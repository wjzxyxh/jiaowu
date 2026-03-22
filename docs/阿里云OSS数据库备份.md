# 数据库备份到阿里云 OSS

使用脚本 `scripts/backup_db_to_oss.py` 将本系统使用的数据库备份并上传到 **阿里云对象存储 OSS**。

---

## 自动备份（推荐）

已提供 **带文件锁** 的包装脚本，避免定时任务重叠执行：

| 文件 | 作用 |
|------|------|
| `scripts/run_oss_backup.sh` | 加载密钥、写日志、`flock` 防重入 |
| `scripts/oss_backup.env.example` | 密钥配置模板（复制后改名使用） |
| `deploy/systemd/jiaowu-oss-backup.service` | systemd 一次性任务 |
| `deploy/systemd/jiaowu-oss-backup.timer` | 每天 **03:15** 触发（可改） |

### 快速启用（Linux + systemd）

1. 安装依赖：`pip install oss2`（或 `pip install -r requirements.txt`）。
2. `sudo mkdir -p /etc/jiaowu`
3. `sudo cp scripts/oss_backup.env.example /etc/jiaowu/oss_backup.env`，编辑填入真实 AK/SK/Endpoint/Bucket，`sudo chmod 600 /etc/jiaowu/oss_backup.env`。
4. 修改 `deploy/systemd/jiaowu-oss-backup.service` 里的 **`WorkingDirectory`**、**`ExecStart`** 路径为你的项目目录（默认写的是 `/opt/jiaowu`）。
5. 安装并启动定时器：

```bash
sudo cp deploy/systemd/jiaowu-oss-backup.service /etc/systemd/system/
sudo cp deploy/systemd/jiaowu-oss-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now jiaowu-oss-backup.timer
```

6. 立即试跑：`sudo systemctl start jiaowu-oss-backup.service`  
7. 看日志：`journalctl -u jiaowu-oss-backup.service -n 80`  
   脚本也会在项目下写 **`logs/runtime/oss_backup.log`**（可用 `OSS_BACKUP_LOG_DIR` 修改）。

### 使用 crontab（无 systemd 或习惯 cron）

```cron
15 3 * * * JIAOWU_OSS_BACKUP_ENV=/etc/jiaowu/oss_backup.env /opt/jiaowu/scripts/run_oss_backup.sh
```

（将 `/opt/jiaowu` 换成实际项目路径。）

### 环境变量说明（自动备份相关）

| 变量 | 说明 |
|------|------|
| `JIAOWU_OSS_BACKUP_ENV` | 密钥文件路径；默认 `<项目根>/.oss_backup.env` |
| `OSS_BACKUP_LOG_DIR` | 日志目录，默认 `<项目根>/logs/runtime` |
| `OSS_BACKUP_PYTHON` | Python 可执行文件，默认 `python3` |
| `OSS_BACKUP_LOCK_DIR` | 锁文件目录，默认 `/tmp` |

---

## 1. 安装依赖

```bash
cd /path/to/pycharm_project_231
pip install oss2
# 或
pip install -r requirements.txt
```

## 2. 在阿里云准备

1. 开通 **对象存储 OSS**，创建 **Bucket**（建议私有读写，通过 RAM 用户访问）。
2. 创建 **RAM 用户**，授予该 Bucket 的 **`oss:PutObject`**（及若使用分片上传可能需要的相关权限）最小权限策略。
3. 记录：**AccessKey ID**、**AccessKey Secret**、**Endpoint**（如华东1：`oss-cn-hangzhou.aliyuncs.com`）、**Bucket 名称**。

> **安全**：不要把 AccessKey 写进代码仓库，使用环境变量或服务器密钥管理。

## 3. 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `OSS_ACCESS_KEY_ID` | 是 | RAM 用户 AccessKey ID |
| `OSS_ACCESS_KEY_SECRET` | 是 | RAM 用户 AccessKey Secret |
| `OSS_ENDPOINT` | 是 | 如 `oss-cn-hangzhou.aliyuncs.com`（**不要**带 `https://`） |
| `OSS_BUCKET_NAME` | 是 | Bucket 名称 |
| `OSS_PREFIX` | 否 | 对象键前缀，默认 `jiaowu-backups/` |
| `DATABASE_URL` | 否 | 不设置则与 Flask 相同：默认 SQLite `jiaowu.db` |
| `MYSQLDUMP_PATH` | 否 | MySQL 时 `mysqldump` 路径，默认在 `PATH` 中查找 |
| `EXTRA_SQLITE_GLOBS` | 否 | 额外 SQLite 相对路径，逗号分隔 |
| `OSS_BACKUP_SCAN_EXTRA_DB` | 否 | `1`（默认）自动备份项目根与 `data/` 下其它 `*.db`；`0` 关闭 |

## 4. 执行备份

```bash
export OSS_ACCESS_KEY_ID="你的ID"
export OSS_ACCESS_KEY_SECRET="你的Secret"
export OSS_ENDPOINT="oss-cn-hangzhou.aliyuncs.com"
export OSS_BUCKET_NAME="你的bucket"

cd /path/to/pycharm_project_231
python3 scripts/backup_db_to_oss.py
```

仅检查、不上传：

```bash
python3 scripts/backup_db_to_oss.py --dry-run
```

## 5. 备份内容与命名

- **SQLite（默认）**  
  - 主库：使用 SQLite **在线 backup**，生成 `jiaowu_primary_<UTC时间>.db`，上传到  
    `{OSS_PREFIX}sqlite/jiaowu_primary_<UTC时间>.db`  
  - 其它库：默认会扫描项目根目录和 `data/` 下所有 `*.db`（与主库路径相同则跳过），上传到  
    `{OSS_PREFIX}sqlite/extra_<相对路径安全化>_<UTC时间>.db`

- **MySQL**（`DATABASE_URL` 为 `mysql+pymysql://...`）  
  - 调用本机 **`mysqldump`** 导出 `jiaowu_primary_<UTC时间>.sql`，上传到  
    `{OSS_PREFIX}mysql/jiaowu_primary_<UTC时间>.sql`  
  - 需已安装 MySQL 客户端，且能访问数据库。

## 6. 定时任务示例（crontab）

更推荐直接使用 **`scripts/run_oss_backup.sh`**（见上文「自动备份」）。若仍要直接调 Python：

```cron
0 3 * * * cd /path/to/pycharm_project_231 && set -a && . /path/to/oss_backup.env && set +a && python3 scripts/backup_db_to_oss.py >> /var/log/jiaowu_oss_backup.log 2>&1
```

密钥文件格式为 `KEY=value`（与 `oss_backup.env.example` 一致），注意 `chmod 600`。

## 7. 常见问题

| 问题 | 处理 |
|------|------|
| `NoSuchBucket` / 403 | 检查 Bucket 地域与 Endpoint、RAM 权限 |
| MySQL 备份失败 | 安装 `mysql-client`，确认 `mysqldump` 能连上库 |
| SQLite 文件被占用 | 脚本使用 `backup` API，一般可与正在运行的服务共存；极端情况可短暂停服务后备份 |

## 8. 代码位置

- 脚本：`scripts/backup_db_to_oss.py`
- 数据库配置：`config.py`（`DATABASE_URL` / 默认 `jiaowu.db`）
