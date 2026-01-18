#!/usr/bin/env python3
"""
以Debug模式启动应用
"""
import os
import sys
import subprocess
import time

def stop_app():
    """停止现有应用"""
    print("正在停止现有应用...")
    try:
        subprocess.run(['pkill', '-9', '-f', 'python.*app.py'], 
                      capture_output=True, timeout=5)
        time.sleep(2)
        print("✓ 已停止现有应用")
    except Exception as e:
        print(f"停止应用时出错: {e}")

def start_app():
    """启动应用"""
    print("正在启动应用（Debug模式）...")
    os.chdir('/tmp/pycharm_project_231')
    
    # 启动应用
    with open('nohup.out', 'a') as f:
        process = subprocess.Popen(
            [sys.executable, 'app.py'],
            stdout=f,
            stderr=subprocess.STDOUT,
            cwd='/tmp/pycharm_project_231'
        )
    
    print(f"✓ 应用进程已启动 (PID: {process.pid})")
    print("等待应用初始化...")
    time.sleep(4)
    
    # 检查启动日志
    try:
        with open('nohup.out', 'r') as f:
            lines = f.readlines()
            recent_lines = lines[-30:] if len(lines) > 30 else lines
            
            debug_found = False
            for line in recent_lines:
                if 'Debug mode: on' in line or 'Debugger is active' in line:
                    debug_found = True
                    break
            
            if debug_found:
                print("\n" + "="*50)
                print("✓ 应用已成功启动！")
                print("✓ Debug模式: 已启用")
                print("✓ 端口: 80")
                print("✓ 访问地址: http://localhost")
                print("="*50)
                print("\n最新日志:")
                for line in recent_lines[-10:]:
                    print(line.rstrip())
            else:
                print("\n检查启动日志...")
                for line in recent_lines[-15:]:
                    print(line.rstrip())
    except Exception as e:
        print(f"读取日志时出错: {e}")

if __name__ == '__main__':
    stop_app()
    start_app()
