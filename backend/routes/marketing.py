"""
营销模块路由：待确认/已提交名单存库
"""
from flask import Blueprint, request, jsonify
from flask_login import login_required
from backend.extensions import db, csrf
from backend.models import MarketingLead
from backend.utils import require_permission, log_operation, handle_db_errors
from datetime import datetime

bp = Blueprint('marketing', __name__)


def _parse_date(s):
    if not s or not isinstance(s, str) or not s.strip():
        return None
    try:
        return datetime.strptime(s.strip()[:10], '%Y-%m-%d').date()
    except ValueError:
        return None


def _parse_datetime(s):
    if not s or not isinstance(s, str) or not s.strip():
        return None
    s = s.strip()
    try:
        if len(s) <= 10:
            return datetime.strptime(s[:10], '%Y-%m-%d')
        return datetime.strptime(s[:19].replace('T', ' '), '%Y-%m-%d %H:%M:%S')
    except ValueError:
        return None


def _lead_from_json(data, lead=None):
    """从请求体更新/创建 MarketingLead 字段"""
    if lead is None:
        lead = MarketingLead()
    name = (data.get('name') or '').strip()
    if name:
        lead.name = name
    if 'grade' in data:
        lead.grade = (data.get('grade') or '').strip() or None
    if 'source' in data:
        lead.source = (data.get('source') or '').strip() or None
    if 'status' in data:
        lead.status = (data.get('status') or '在校').strip()
    if 'phone' in data:
        lead.phone = (data.get('phone') or '').strip() or None
    if 'parent_name' in data:
        lead.parent_name = (data.get('parent_name') or '').strip() or None
    if 'parent_phone' in data:
        lead.parent_phone = (data.get('parent_phone') or '').strip() or None
    if 'address' in data:
        lead.address = (data.get('address') or '').strip() or None
    if 'notes' in data:
        lead.notes = (data.get('notes') or '').strip() or None
    if 'enrollment_date' in data:
        lead.enrollment_date = _parse_date(data.get('enrollment_date'))
    if 'lead_status' in data:
        lead.lead_status = (data.get('lead_status') or 'draft').strip()
    if 'saved_at' in data:
        lead.saved_at = _parse_datetime(data.get('saved_at'))
    if 'submitted_at' in data:
        lead.submitted_at = _parse_datetime(data.get('submitted_at'))
    return lead


@bp.route('/api/marketing/leads', methods=['GET'])
@login_required
@handle_db_errors
def list_leads():
    """获取营销线索列表，按 lead_status 筛选：draft=待确认, trial=试课, submitted=已提交"""
    lead_status = (request.args.get('lead_status') or '').strip().lower()
    if lead_status not in ('draft', 'trial', 'submitted'):
        return jsonify({'error': '请提供 lead_status=draft、trial 或 submitted'}), 400
    
    items = MarketingLead.query.filter_by(lead_status=lead_status).order_by(MarketingLead.updated_at.desc()).all()
    
    # 待确认名单：只按 lead_status 筛选，只要状态未改为试课/已提交就保留在待确认名单（不因有排课或试课状态而排除）
    # 不再额外过滤：之前会排除“有排课但试课状态不是再试”的线索，导致推送后有排课的学生从待确认名单消失
    
    return jsonify({'items': [x.to_dict() for x in items]})


@bp.route('/api/marketing/leads', methods=['POST'])
@csrf.exempt
@login_required
@require_permission('edit')
@handle_db_errors
def create_lead():
    """创建营销线索（待确认或已提交）"""
    if not request.is_json:
        return jsonify({'error': '请求必须是JSON格式'}), 400
    data = request.json or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': '姓名不能为空'}), 400
    lead_status = (data.get('lead_status') or 'draft').strip().lower()
    if lead_status not in ('draft', 'trial', 'submitted'):
        lead_status = 'draft'
    lead = _lead_from_json(data)
    lead.lead_status = lead_status
    now = datetime.now()
    if lead_status == 'draft':
        lead.saved_at = now
        lead.submitted_at = None
    elif lead_status == 'trial':
        lead.submitted_at = None
        lead.saved_at = lead.saved_at or now
    else:
        lead.submitted_at = now
        lead.saved_at = lead.saved_at or now
    db.session.add(lead)
    db.session.commit()
    log_operation('marketing', 'create', 'MarketingLead', lead.id, lead.name)
    return jsonify(lead.to_dict()), 201


@bp.route('/api/marketing/leads/trial-status-map', methods=['GET'])
@login_required
@handle_db_errors
def get_trial_status_map():
    """返回所有设置了试课状态的线索的 name+grade+trial_status（学生名单页无排课时展示用）"""
    items = MarketingLead.query.filter(MarketingLead.trial_status.isnot(None)).filter(MarketingLead.trial_status != '').all()
    return jsonify({
        'items': [{'name': x.name, 'grade': x.grade or '', 'trial_status': x.trial_status} for x in items]
    })


@bp.route('/api/marketing/leads/<int:lead_id>', methods=['PUT'])
@csrf.exempt
@login_required
@require_permission('edit')
@handle_db_errors
def update_lead(lead_id):
    """更新营销线索（可用来恢复至待确认：lead_status=draft）"""
    lead = MarketingLead.query.get_or_404(lead_id)
    if not request.is_json:
        return jsonify({'error': '请求必须是JSON格式'}), 400
    data = request.json or {}
    name = (data.get('name') or '').strip()
    if name:
        lead.name = name
    _lead_from_json(data, lead)
    if data.get('lead_status') == 'draft':
        lead.lead_status = 'draft'
        lead.submitted_at = None
        lead.saved_at = datetime.now()
    elif data.get('lead_status') == 'trial':
        lead.lead_status = 'trial'
        lead.submitted_at = None
        lead.saved_at = lead.saved_at or datetime.now()
    elif data.get('lead_status') == 'submitted':
        lead.lead_status = 'submitted'
        lead.submitted_at = _parse_datetime(data.get('submitted_at')) or datetime.now()
    if lead.lead_status in ('draft', 'trial'):
        lead.saved_at = lead.saved_at or datetime.now()
    db.session.commit()
    log_operation('marketing', 'update', 'MarketingLead', lead.id, lead.name)
    return jsonify(lead.to_dict())


@bp.route('/api/marketing/leads/<int:lead_id>', methods=['DELETE'])
@csrf.exempt
@login_required
@require_permission('edit')
@handle_db_errors
def delete_lead(lead_id):
    """彻底删除营销线索：从数据库中物理删除该条记录（仅允许删除待确认名单）"""
    lead = MarketingLead.query.get_or_404(lead_id)
    if lead.lead_status != 'draft':
        return jsonify({'error': '仅待确认记录可删除；试课/已提交记录请使用恢复至待确认'}), 403
    
    name = lead.name
    
    # 处理相关的排课记录：将未确认的排课记录的 marketing_lead_id 设置为 NULL
    # 这样删除线索后，这些排课记录仍然存在，但不再关联到营销线索
    from backend.models import StudentCourse
    related_courses = StudentCourse.query.filter_by(marketing_lead_id=lead_id).all()
    for course in related_courses:
        # 只处理未确认的排课记录，已确认的保持关联（可能需要保留历史记录）
        if not course.is_confirmed:
            course.marketing_lead_id = None
    
    # 物理删除营销线索
    db.session.delete(lead)
    db.session.commit()
    log_operation('marketing', 'delete', 'MarketingLead', lead_id, name)
    return jsonify({'message': '已删除'})


@bp.route('/api/marketing/leads/<int:lead_id>/mark-trial', methods=['POST'])
@csrf.exempt
@login_required
@require_permission('edit')
@handle_db_errors
def mark_lead_trial(lead_id):
    """将一条待确认标记为试课（确认并提交后进入试课表格）"""
    lead = MarketingLead.query.get_or_404(lead_id)
    if lead.lead_status == 'trial':
        return jsonify(lead.to_dict())
    if lead.lead_status != 'draft':
        return jsonify({'error': '仅待确认记录可进入试课表格'}), 400
    lead.lead_status = 'trial'
    lead.submitted_at = None
    lead.saved_at = lead.saved_at or datetime.now()
    db.session.commit()
    log_operation('marketing', 'update', 'MarketingLead', lead.id, lead.name)
    return jsonify(lead.to_dict())


@bp.route('/api/marketing/leads/<int:lead_id>/mark-submitted', methods=['POST'])
@csrf.exempt
@login_required
@require_permission('edit')
@handle_db_errors
def mark_lead_submitted(lead_id):
    """将一条试课标记为已提交（试课确认并提交到学生管理后调用）"""
    lead = MarketingLead.query.get_or_404(lead_id)
    if lead.lead_status == 'submitted':
        return jsonify(lead.to_dict())
    if lead.lead_status not in ('draft', 'trial'):
        return jsonify({'error': '状态异常'}), 400
    lead.lead_status = 'submitted'
    lead.submitted_at = datetime.now()
    db.session.commit()
    log_operation('marketing', 'update', 'MarketingLead', lead.id, lead.name)
    return jsonify(lead.to_dict())
