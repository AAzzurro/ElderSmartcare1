import json
import os
import sqlite3
import time
from contextlib import contextmanager
from typing import Any, Dict, List, Optional

from config import SQLITE_DB_PATH


@contextmanager
def _connect():
    db_dir = os.path.dirname(SQLITE_DB_PATH)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)
    conn = sqlite3.connect(SQLITE_DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    """Create SQLite tables if they do not already exist."""
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS medicines (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                care_group_id TEXT NOT NULL,
                bed_no TEXT NOT NULL DEFAULT '',
                resident_name TEXT NOT NULL DEFAULT '',
                name TEXT NOT NULL,
                dosage TEXT NOT NULL DEFAULT '',
                contra TEXT NOT NULL DEFAULT '',
                time_str TEXT NOT NULL DEFAULT '',
                note_status TEXT NOT NULL DEFAULT '',
                audio_path TEXT NOT NULL DEFAULT '',
                box_image_path TEXT NOT NULL DEFAULT '',
                taken_json TEXT NOT NULL DEFAULT '{}',
                created_at REAL NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                care_group_id TEXT NOT NULL,
                resident_name TEXT NOT NULL DEFAULT '',
                event_type TEXT NOT NULL DEFAULT '',
                title TEXT NOT NULL DEFAULT '',
                description TEXT NOT NULL DEFAULT '',
                is_urgent INTEGER NOT NULL DEFAULT 0,
                chat_content TEXT NOT NULL DEFAULT '',
                timestamp REAL NOT NULL
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_medicines_group_id ON medicines(care_group_id, id)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_events_group_time ON events(care_group_id, timestamp DESC)"
        )


def _json_dumps(value: Any) -> str:
    return json.dumps(value if value is not None else {}, ensure_ascii=False)


def _json_loads_dict(value: str) -> Dict[str, Any]:
    try:
        decoded = json.loads(value or "{}")
    except (TypeError, json.JSONDecodeError):
        return {}
    return decoded if isinstance(decoded, dict) else {}


def _medicine_from_row(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "床号": row["bed_no"] or "",
        "姓名": row["resident_name"] or "",
        "药品名称": row["name"] or "",
        "用法用量": row["dosage"] or "",
        "识别禁忌": row["contra"] or "",
        "服药时间": row["time_str"] or "",
        "护工备注": row["note_status"] or "",
        "语音文件": row["audio_path"] or "",
        "药盒图片": row["box_image_path"] or "",
        "已服药": _json_loads_dict(row["taken_json"]),
    }


def _event_from_row(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "resident_name": row["resident_name"] or "",
        "event_type": row["event_type"] or "",
        "title": row["title"] or "",
        "description": row["description"] or "",
        "is_urgent": bool(row["is_urgent"]),
        "chat_content": row["chat_content"] or "",
        "timestamp": row["timestamp"] or 0,
    }


def _medicine_id_by_index(conn: sqlite3.Connection, care_group_id: str, index: int) -> Optional[int]:
    row = conn.execute(
        """
        SELECT id
        FROM medicines
        WHERE care_group_id = ?
        ORDER BY id ASC
        LIMIT 1 OFFSET ?
        """,
        (care_group_id, index),
    ).fetchone()
    return int(row["id"]) if row else None


def list_medicines(care_group_id: str) -> List[Dict[str, Any]]:
    init_db()
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT *
            FROM medicines
            WHERE care_group_id = ?
            ORDER BY id ASC
            """,
            (care_group_id,),
        ).fetchall()
    return [_medicine_from_row(row) for row in rows]


def insert_medicine(care_group_id: str, medicine: Dict[str, Any]) -> int:
    init_db()
    with _connect() as conn:
        cursor = conn.execute(
            """
            INSERT INTO medicines (
                care_group_id,
                bed_no,
                resident_name,
                name,
                dosage,
                contra,
                time_str,
                note_status,
                audio_path,
                box_image_path,
                taken_json,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                care_group_id,
                str(medicine.get("床号") or ""),
                str(medicine.get("姓名") or ""),
                str(medicine.get("药品名称") or ""),
                str(medicine.get("用法用量") or ""),
                str(medicine.get("识别禁忌") or ""),
                str(medicine.get("服药时间") or ""),
                str(medicine.get("护工备注") or ""),
                str(medicine.get("语音文件") or ""),
                str(medicine.get("药盒图片") or ""),
                _json_dumps(medicine.get("已服药") or {}),
                time.time(),
            ),
        )
        return int(cursor.lastrowid)


def update_medicine_taken_by_index(care_group_id: str, index: int, taken: Dict[str, Any]) -> bool:
    init_db()
    with _connect() as conn:
        medicine_id = _medicine_id_by_index(conn, care_group_id, index)
        if medicine_id is None:
            return False
        conn.execute(
            "UPDATE medicines SET taken_json = ? WHERE id = ?",
            (_json_dumps(taken), medicine_id),
        )
    return True


def delete_medicine_by_index(care_group_id: str, index: int) -> bool:
    init_db()
    with _connect() as conn:
        medicine_id = _medicine_id_by_index(conn, care_group_id, index)
        if medicine_id is None:
            return False
        conn.execute("DELETE FROM medicines WHERE id = ?", (medicine_id,))
    return True


def insert_event(care_group_id: str, event: Dict[str, Any]) -> int:
    init_db()
    with _connect() as conn:
        cursor = conn.execute(
            """
            INSERT INTO events (
                care_group_id,
                resident_name,
                event_type,
                title,
                description,
                is_urgent,
                chat_content,
                timestamp
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                care_group_id,
                str(event.get("resident_name") or ""),
                str(event.get("event_type") or ""),
                str(event.get("title") or ""),
                str(event.get("description") or ""),
                1 if event.get("is_urgent") else 0,
                str(event.get("chat_content") or ""),
                float(event.get("timestamp") or time.time()),
            ),
        )
        return int(cursor.lastrowid)


def list_events(
    care_group_id: str,
    resident_name: str = "",
    limit: Optional[int] = 50,
) -> List[Dict[str, Any]]:
    init_db()
    params: List[Any] = [care_group_id]
    where = "WHERE care_group_id = ?"
    if resident_name.strip():
        where += " AND resident_name = ?"
        params.append(resident_name.strip())

    sql = f"""
        SELECT *
        FROM events
        {where}
        ORDER BY timestamp DESC
    """
    if limit is not None:
        sql += " LIMIT ?"
        params.append(int(limit))

    with _connect() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [_event_from_row(row) for row in rows]


init_db()
