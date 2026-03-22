#!/usr/bin/env bash
# 自动/定时调用 OSS 数据库备份。支持文件锁，避免上一次未结束又开新任务。
#
# 用法：
#   ./scripts/run_oss_backup.sh
#   JIAOWU_OSS_BACKUP_ENV=/etc/jiaowu/oss_backup.env ./scripts/run_oss_backup.sh
#
# 环境变量：
#   JIAOWU_OSS_BACKUP_ENV  密钥配置文件路径；未设置时优先 /etc/jiaowu/oss_backup.env，其次 <项目根>/.oss_backup.env
#   OSS_BACKUP_LOG_DIR     日志目录，默认：<项目根>/logs/runtime
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -n "${JIAOWU_OSS_BACKUP_ENV:-}" ]]; then
  ENV_FILE="$JIAOWU_OSS_BACKUP_ENV"
elif [[ -f /etc/jiaowu/oss_backup.env ]]; then
  ENV_FILE=/etc/jiaowu/oss_backup.env
else
  ENV_FILE="$ROOT/.oss_backup.env"
fi
# set -a：文件内写 OSS_ACCESS_KEY_ID=xxx（无需 export），子进程 python 可继承
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

LOG_DIR="${OSS_BACKUP_LOG_DIR:-$ROOT/logs/runtime}"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/oss_backup.log"

LOCK_DIR="${OSS_BACKUP_LOCK_DIR:-/tmp}"
LOCK_FILE="$LOCK_DIR/jiaowu_oss_backup.lock"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "$(date -Iseconds) [oss-backup] skip: lock held, another run in progress" >>"$LOG_FILE"
  exit 0
fi

# 阿里云 ECS 上 root 的 python3 常为 3.6；若已安装 3.9+ 多在 /usr/local/bin/python3
PY="${OSS_BACKUP_PYTHON:-}"
if [[ -z "$PY" ]]; then
  if [[ -x /usr/local/bin/python3 ]]; then
    PY=/usr/local/bin/python3
  else
    PY=python3
  fi
fi
{
  echo "$(date -Iseconds) [oss-backup] start pid=$$ env=$ENV_FILE"
  "$PY" "$ROOT/scripts/backup_db_to_oss.py" "$@"
  ec=$?
  echo "$(date -Iseconds) [oss-backup] exit $ec"
  exit "$ec"
} >>"$LOG_FILE" 2>&1
