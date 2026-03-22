#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
将教务系统数据库备份并上传到阿里云 OSS。

支持：
  - SQLite：使用 sqlite3 在线备份 API，尽量保证与运行中实例一致
  - MySQL：若本机可用 mysqldump，则导出 .sql 后上传；否则跳过并提示

环境变量（必填）：
  OSS_ACCESS_KEY_ID
  OSS_ACCESS_KEY_SECRET
  OSS_ENDPOINT          例：oss-cn-hangzhou.aliyuncs.com（不要带 https://）
  OSS_BUCKET_NAME

环境变量（可选）：
  OSS_PREFIX            对象键前缀，默认 jiaowu-backups/
  DATABASE_URL          不设置则从项目 config 读取（与 Flask 一致）
  MYSQLDUMP_PATH        mysqldump 可执行文件路径，默认 mysqldump
  EXTRA_SQLITE_GLOBS    额外要上传的 sqlite 文件，逗号分隔相对项目根路径
                        例：data/other.db,cache/local.db
  OSS_BACKUP_SCAN_EXTRA_DB  是否自动扫描项目根与 data/ 下 *.db（默认 1）

用法：
  cd /path/to/project
  python3 scripts/backup_db_to_oss.py

  # 仅检查配置、不上传
  python3 scripts/backup_db_to_oss.py --dry-run
"""
from __future__ import annotations

import argparse
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urlparse

# 项目根目录（scripts 的上一级）
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


def _utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _normalize_oss_endpoint(endpoint: str) -> str:
    e = (endpoint or "").strip()
    e = re.sub(r"^https?://", "", e, flags=re.I)
    e = e.rstrip("/")
    return e


def _sqlite_safe_backup(src_path: Path, dst_path: Path) -> None:
    """使用 SQLite backup API 导出到独立文件。"""
    # Path.as_uri() 已是 file:///... 形式，不可再拼 "file:" 前缀
    src_uri = src_path.resolve().as_uri()
    src = sqlite3.connect(f"{src_uri}?mode=ro", uri=True)
    try:
        dst = sqlite3.connect(str(dst_path))
        try:
            src.backup(dst)
        finally:
            dst.close()
    finally:
        src.close()


def _parse_mysql_url(database_url: str) -> dict | None:
    """
    解析 sqlalchemy mysql URL，例如：
    mysql+pymysql://user:pass@host:3306/dbname?charset=utf8mb4
    """
    u = urlparse(database_url.replace("mysql+pymysql://", "mysql://", 1))
    if u.scheme != "mysql":
        return None
    user = unquote(u.username or "")
    password = unquote(u.password or "")
    host = u.hostname or "localhost"
    port = u.port or 3306
    db = (u.path or "").lstrip("/")
    if not db:
        return None
    return {
        "user": user,
        "password": password,
        "host": host,
        "port": port,
        "database": db,
    }


def _run_mysqldump(mysql_cfg: dict, out_sql: Path, mysqldump_path: str) -> None:
    env = os.environ.copy()
    # 避免密码出现在 ps 列表：用 MYSQL_PWD（mysqldump 支持）
    if mysql_cfg["password"]:
        env["MYSQL_PWD"] = mysql_cfg["password"]
    cmd = [
        mysqldump_path,
        f"--host={mysql_cfg['host']}",
        f"--port={mysql_cfg['port']}",
        f"--user={mysql_cfg['user']}",
        "--single-transaction",
        "--quick",
        "--routines",
        "--events",
        "--set-gtid-purged=OFF",
        mysql_cfg["database"],
    ]
    with open(out_sql, "wb") as f:
        subprocess.run(
            cmd,
            stdout=f,
            stderr=subprocess.PIPE,
            check=True,
            env=env,
        )


def _get_primary_database_url() -> str:
    database_url = os.environ.get("DATABASE_URL")
    if database_url:
        return database_url
    from config import Config

    return Config.SQLALCHEMY_DATABASE_URI


def _sqlite_path_from_uri(uri: str) -> Path | None:
    if not uri.startswith("sqlite:///"):
        return None
    # sqlite:////absolute 或 sqlite:///relative
    path_part = uri.replace("sqlite:///", "", 1)
    p = Path(path_part)
    if not p.is_absolute():
        p = PROJECT_ROOT / p
    return p


def main() -> int:
    parser = argparse.ArgumentParser(description="Backup database to Aliyun OSS")
    parser.add_argument("--dry-run", action="store_true", help="只打印将要上传的对象，不实际上传")
    args = parser.parse_args()

    ak = os.environ.get("OSS_ACCESS_KEY_ID", "").strip()
    sk = os.environ.get("OSS_ACCESS_KEY_SECRET", "").strip()
    endpoint = _normalize_oss_endpoint(os.environ.get("OSS_ENDPOINT", ""))
    bucket_name = os.environ.get("OSS_BUCKET_NAME", "").strip()
    prefix = (os.environ.get("OSS_PREFIX", "jiaowu-backups/") or "jiaowu-backups/").strip()
    if prefix and not prefix.endswith("/"):
        prefix += "/"

    if not all([ak, sk, endpoint, bucket_name]):
        print(
            "错误：请设置环境变量 OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET, "
            "OSS_ENDPOINT, OSS_BUCKET_NAME",
            file=sys.stderr,
        )
        return 2

    try:
        import oss2
    except ImportError:
        print("错误：未安装 oss2，请执行: pip install oss2", file=sys.stderr)
        return 2

    database_url = _get_primary_database_url()
    stamp = _utc_stamp()
    uploads: list[tuple[str, Path]] = []  # (oss_key, local_path)

    tmpdir = Path(tempfile.mkdtemp(prefix="oss_db_backup_"))
    try:
        # 1) 主库
        if database_url.startswith("sqlite"):
            db_path = _sqlite_path_from_uri(database_url)
            if not db_path or not db_path.is_file():
                print(f"错误：SQLite 文件不存在: {db_path}", file=sys.stderr)
                return 1
            local_copy = tmpdir / f"jiaowu_primary_{stamp}.db"
            print(f"备份 SQLite（在线 backup）: {db_path} -> {local_copy.name}")
            _sqlite_safe_backup(db_path, local_copy)
            uploads.append((f"{prefix}sqlite/jiaowu_primary_{stamp}.db", local_copy))
        elif "mysql" in database_url.lower():
            mysql_cfg = _parse_mysql_url(database_url)
            mysqldump = os.environ.get("MYSQLDUMP_PATH", "mysqldump")
            if not mysql_cfg:
                print("错误：无法解析 MySQL DATABASE_URL", file=sys.stderr)
                return 1
            if not shutil.which(mysqldump):
                print(
                    f"错误：未找到 {mysqldump}，无法导出 MySQL。请安装客户端或设置 MYSQLDUMP_PATH。",
                    file=sys.stderr,
                )
                return 1
            out_sql = tmpdir / f"jiaowu_primary_{stamp}.sql"
            print(f"执行 mysqldump: {mysql_cfg['host']}:{mysql_cfg['port']}/{mysql_cfg['database']}")
            try:
                _run_mysqldump(mysql_cfg, out_sql, mysqldump)
            except subprocess.CalledProcessError as e:
                print(f"mysqldump 失败: {e}", file=sys.stderr)
                if e.stderr:
                    print(e.stderr.decode(errors="replace"), file=sys.stderr)
                return 1
            uploads.append((f"{prefix}mysql/jiaowu_primary_{stamp}.sql", out_sql))
        else:
            print(f"警告：暂不支持的 DATABASE_URL 类型，跳过主库: {database_url[:80]}...", file=sys.stderr)

        # 2) 额外 SQLite：环境变量 + 自动扫描项目根与 data/ 目录
        primary_resolved: Path | None = None
        if database_url.startswith("sqlite"):
            primary_resolved = _sqlite_path_from_uri(database_url)
            if primary_resolved:
                primary_resolved = primary_resolved.resolve()

        extra_paths: list[Path] = []
        extra_env = os.environ.get("EXTRA_SQLITE_GLOBS", "").strip()
        if extra_env:
            for rel in [x.strip() for x in extra_env.split(",") if x.strip()]:
                extra_paths.append((PROJECT_ROOT / rel).resolve())

        auto_scan = os.environ.get("OSS_BACKUP_SCAN_EXTRA_DB", "1").strip().lower() not in (
            "0",
            "false",
            "no",
        )
        if auto_scan:
            for base in (PROJECT_ROOT, PROJECT_ROOT / "data"):
                if not base.is_dir():
                    continue
                for p in base.glob("*.db"):
                    p = p.resolve()
                    if p not in extra_paths:
                        extra_paths.append(p)

        seen: set[Path] = set()
        for p in extra_paths:
            if p in seen:
                continue
            seen.add(p)
            if primary_resolved and p.resolve() == primary_resolved:
                continue
            if not p.is_file():
                print(f"警告：跳过不存在的文件: {p}", file=sys.stderr)
                continue
            try:
                rel = p.relative_to(PROJECT_ROOT)
                rel_str = str(rel)
            except ValueError:
                rel_str = p.name
            safe_name = re.sub(r"[^\w.\-]+", "_", rel_str.replace("/", "_"))
            local_copy = tmpdir / f"extra_{safe_name}_{stamp}.db"
            print(f"备份额外 SQLite: {p}")
            try:
                _sqlite_safe_backup(p, local_copy)
            except sqlite3.Error as e:
                print(f"警告：无法备份（可能非 SQLite 或损坏）{p}: {e}", file=sys.stderr)
                continue
            uploads.append((f"{prefix}sqlite/extra_{safe_name}_{stamp}.db", local_copy))

        if not uploads:
            print("没有可上传的备份文件。", file=sys.stderr)
            return 1

        auth = oss2.Auth(ak, sk)
        bucket = oss2.Bucket(auth, endpoint, bucket_name)

        for oss_key, local_path in uploads:
            print(f"上传: {local_path.name} -> oss://{bucket_name}/{oss_key}")
            if args.dry_run:
                continue
            oss2.resumable_upload(bucket, oss_key, str(local_path))

        if args.dry_run:
            print("--dry-run：未实际上传。")
        else:
            print("全部上传完成。")
        return 0
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
