import sqlite3
from pathlib import Path
from typing import Optional

DB_PATH = Path(__file__).parent.parent / "db.sqlite"
EMPTY = "null"  # Sentinel stored in DB for unoccupied borrow fields


def _conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), timeout=30.0)
    conn.row_factory = sqlite3.Row
    return conn


def authenticate(sid: str, password: str) -> Optional[dict]:
    with _conn() as conn:
        row = conn.execute(
            "SELECT sid, name, dep, phone FROM students WHERE sid=? AND password=?",
            (sid, password),
        ).fetchone()
    return dict(row) if row else None


def change_password(sid: str, new_password: str) -> None:
    with _conn() as conn:
        conn.execute("UPDATE students SET password=? WHERE sid=?", (new_password, sid))
        conn.commit()


def get_my_borrow(sid: str) -> Optional[dict]:
    with _conn() as conn:
        row = conn.execute(
            """SELECT b.c_no, b.room, c.title
               FROM borrows b
               JOIN courses c ON b.c_no = c.c_no
               WHERE b.lend_sid=?""",
            (sid,),
        ).fetchone()
    return dict(row) if row else None


def get_room(c_no: str, room: str) -> Optional[dict]:
    with _conn() as conn:
        row = conn.execute(
            "SELECT c_no, room, lend_sid, lend_name FROM borrows WHERE c_no=? AND room=?",
            (c_no, room),
        ).fetchone()
    return dict(row) if row else None


def is_enrolled(sid: str, c_no: str) -> bool:
    with _conn() as conn:
        row = conn.execute(
            "SELECT 1 FROM classes WHERE sid=? AND c_no=?",
            (sid, c_no),
        ).fetchone()
    return row is not None


def borrow_room(sid: str, name: str, c_no: str, room: str, key: str) -> None:
    with _conn() as conn:
        conn.execute(
            "UPDATE borrows SET lend_sid=?, lend_name=?, lend_password=? WHERE c_no=? AND room=?",
            (sid, name, key, c_no, room),
        )
        conn.commit()


def return_room(sid: str) -> None:
    with _conn() as conn:
        conn.execute(
            "UPDATE borrows SET lend_sid=?, lend_name=?, lend_password=? WHERE lend_sid=?",
            (EMPTY, EMPTY, EMPTY, sid),
        )
        conn.commit()


def get_lender_contact(sid: str) -> Optional[dict]:
    with _conn() as conn:
        row = conn.execute(
            "SELECT name, phone FROM students WHERE sid=?", (sid,)
        ).fetchone()
    return dict(row) if row else None


def get_all_active_borrows() -> list[dict]:
    with _conn() as conn:
        rows = conn.execute(
            """SELECT b.c_no, b.room, b.lend_sid, b.lend_name, c.title
               FROM borrows b
               JOIN courses c ON b.c_no = c.c_no
               WHERE b.lend_sid != ?""",
            (EMPTY,),
        ).fetchall()
    return [dict(r) for r in rows]


def get_enrolled_courses(sid: str) -> list[dict]:
    with _conn() as conn:
        rows = conn.execute(
            """SELECT c.c_no, c.title, c.time, c.room
               FROM classes cl
               JOIN courses c ON cl.c_no = c.c_no
               WHERE cl.sid=?""",
            (sid,),
        ).fetchall()
    return [dict(r) for r in rows]
