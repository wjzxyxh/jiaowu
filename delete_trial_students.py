#!/usr/bin/env python3
"""
删除所有【试课学员】相关记录的脚本

删除内容：
1. StudentCourse 表中所有与试课学员相关的记录（marketing_lead_id 不为空的记录）
2. MarketingLead 表中的所有记录
3. Student 表中名为【试课学员】的占位学生记录

使用方法：
    python3 delete_trial_students.py          # 交互式确认
    python3 delete_trial_students.py --yes    # 直接删除，无需确认
"""

import sys
import argparse
from app import create_app
from models import db, MarketingLead, StudentCourse, Student

TRIAL_PLACEHOLDER_NAME = '【试课学员】'

def delete_trial_students(force=False):
    """删除所有试课学员相关记录"""
    app = create_app()
    
    with app.app_context():
        try:
            # 统计要删除的记录数
            trial_courses_count = StudentCourse.query.filter(StudentCourse.marketing_lead_id.isnot(None)).count()
            marketing_leads_count = MarketingLead.query.count()
            placeholder_students_count = Student.query.filter_by(name=TRIAL_PLACEHOLDER_NAME).count()
            
            print(f"准备删除以下记录：")
            print(f"  - StudentCourse 表中与试课学员相关的记录: {trial_courses_count} 条")
            print(f"  - MarketingLead 表中的所有记录: {marketing_leads_count} 条")
            print(f"  - Student 表中名为【试课学员】的记录: {placeholder_students_count} 条")
            print(f"  总计: {trial_courses_count + marketing_leads_count + placeholder_students_count} 条")
            
            # 确认删除
            if not force:
                try:
                    confirm = input("\n确认删除？(yes/no): ")
                    if confirm.lower() != 'yes':
                        print("已取消删除操作")
                        return
                except EOFError:
                    print("\n错误：无法读取输入。请使用 --yes 参数跳过确认。")
                    sys.exit(1)
            else:
                print("\n使用 --yes 参数，跳过确认，直接删除...")
            
            # 1. 删除 StudentCourse 表中所有与试课学员相关的记录
            print("\n正在删除 StudentCourse 表中的试课记录...")
            deleted_courses = StudentCourse.query.filter(StudentCourse.marketing_lead_id.isnot(None)).delete(synchronize_session=False)
            print(f"已删除 {deleted_courses} 条 StudentCourse 记录")
            
            # 2. 删除 MarketingLead 表中的所有记录
            print("\n正在删除 MarketingLead 表中的所有记录...")
            deleted_leads = MarketingLead.query.delete(synchronize_session=False)
            print(f"已删除 {deleted_leads} 条 MarketingLead 记录")
            
            # 3. 删除 Student 表中名为【试课学员】的占位学生记录
            print("\n正在删除 Student 表中名为【试课学员】的记录...")
            deleted_students = Student.query.filter_by(name=TRIAL_PLACEHOLDER_NAME).delete(synchronize_session=False)
            print(f"已删除 {deleted_students} 条 Student 记录")
            
            # 提交事务
            db.session.commit()
            print("\n✓ 所有试课学员相关记录已成功删除！")
            
        except Exception as e:
            db.session.rollback()
            print(f"\n✗ 删除过程中发生错误: {e}")
            import traceback
            traceback.print_exc()
            sys.exit(1)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='删除所有【试课学员】相关记录')
    parser.add_argument('--yes', action='store_true', help='跳过确认，直接删除')
    args = parser.parse_args()
    
    delete_trial_students(force=args.yes)
