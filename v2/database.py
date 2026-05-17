import sqlite3
from pathlib import Path
from typing import Optional

DB_PATH = Path(__file__).parent.parent / "db.sqlite"
EMPTY = "null"


def _conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), timeout=30.0)
    conn.row_factory = sqlite3.Row
    return conn


# ── Auth ───────────────────────────────────────────────────────────────────────

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


# ── Borrow / Return ────────────────────────────────────────────────────────────

def get_my_borrows(sid: str) -> list:
    """Return all rooms currently borrowed by this student."""
    with _conn() as conn:
        rows = conn.execute(
            """SELECT b.c_no, b.room, c.title, c.weekday, c.time, c.credits
               FROM borrows b
               JOIN courses c ON b.c_no = c.c_no
               WHERE b.lend_sid=?
               ORDER BY c.weekday, c.time""",
            (sid,),
        ).fetchall()
    return [dict(r) for r in rows]


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


def return_room(sid: str, c_no: str) -> None:
    """Return the specific room borrowed by this student for this course."""
    with _conn() as conn:
        conn.execute(
            "UPDATE borrows SET lend_sid=?, lend_name=?, lend_password=? WHERE c_no=? AND lend_sid=?",
            (EMPTY, EMPTY, EMPTY, c_no, sid),
        )
        conn.commit()


def get_lender_contact(sid: str) -> Optional[dict]:
    with _conn() as conn:
        row = conn.execute(
            "SELECT name, phone FROM students WHERE sid=?", (sid,)
        ).fetchone()
    return dict(row) if row else None


# ── Courses / Enrollment ───────────────────────────────────────────────────────

def get_enrolled_courses(sid: str) -> list:
    with _conn() as conn:
        rows = conn.execute(
            """SELECT c.c_no, c.title, c.time, c.room, c.credits, c.weekday
               FROM classes cl
               JOIN courses c ON cl.c_no = c.c_no
               WHERE cl.sid=?
               ORDER BY c.weekday, c.time""",
            (sid,),
        ).fetchall()
    return [dict(r) for r in rows]


def get_available_courses(sid: str) -> list:
    with _conn() as conn:
        rows = conn.execute(
            """SELECT c.c_no, c.title, c.time, c.room, c.credits, c.weekday
               FROM courses c
               WHERE c.c_no NOT IN (
                   SELECT cl.c_no FROM classes cl WHERE cl.sid=?
               )
               ORDER BY c.weekday, c.room, c.time""",
            (sid,),
        ).fetchall()
    return [dict(r) for r in rows]


def enroll_course(sid: str, c_no: str) -> None:
    with _conn() as conn:
        row = conn.execute("SELECT room, time FROM courses WHERE c_no=?", (c_no,)).fetchone()
        if not row:
            raise ValueError("課程不存在")
        room, time = row["room"], row["time"]
        conn.execute(
            "INSERT OR IGNORE INTO classes(sid,c_no,room) VALUES(?,?,?)",
            (sid, c_no, room),
        )
        conn.execute(
            "INSERT OR IGNORE INTO borrows(c_no,time,room,lend_sid,lend_name,lend_password) VALUES(?,?,?,?,?,?)",
            (c_no, time, room, EMPTY, EMPTY, EMPTY),
        )
        conn.commit()


def drop_course(sid: str, c_no: str) -> None:
    with _conn() as conn:
        conn.execute("DELETE FROM classes WHERE sid=? AND c_no=?", (sid, c_no))
        conn.commit()


# ── Room schedule (Gantt) ──────────────────────────────────────────────────────

def get_room_schedule(room: str, sid: str, weekday: Optional[int] = None) -> list:
    """
    All courses in a room, optionally filtered by weekday.
    Includes is_enrolled_by_me and can_force_return flags.
    can_force_return requires SAME weekday + time condition.
    """
    with _conn() as conn:
        query = """
            SELECT c.c_no, c.title, c.time, c.credits, c.room, c.weekday,
                   b.lend_sid, b.lend_name,
                   CASE WHEN cl.sid IS NOT NULL THEN 1 ELSE 0 END AS is_enrolled_by_me
            FROM courses c
            JOIN borrows b ON c.c_no = b.c_no
            LEFT JOIN classes cl ON cl.c_no = c.c_no AND cl.sid = ?
            WHERE c.room = ?"""
        params: list = [sid, room]
        if weekday is not None:
            query += " AND c.weekday = ?"
            params.append(weekday)
        query += " ORDER BY c.weekday, c.time"

        rows = conn.execute(query, params).fetchall()
        result = []
        for r in rows:
            item = dict(r)
            can_force = False
            if item["lend_sid"] != EMPTY and item["lend_sid"] != sid:
                check = conn.execute(
                    """SELECT 1
                       FROM classes my_cl
                       JOIN courses my_c ON my_cl.c_no = my_c.c_no
                       JOIN courses tgt  ON tgt.c_no = ?
                       WHERE my_cl.sid = ?
                         AND my_c.room    = tgt.room
                         AND my_c.weekday = tgt.weekday
                         AND (
                           (CAST(substr(my_c.time,1,2) AS INTEGER)*60
                            + CAST(substr(my_c.time,4,2) AS INTEGER))
                           >=
                           (CAST(substr(tgt.time,1,2) AS INTEGER)*60
                            + CAST(substr(tgt.time,4,2) AS INTEGER))
                             + (tgt.credits * 60) - 10
                         )
                       LIMIT 1""",
                    (item["c_no"], sid),
                ).fetchone()
                can_force = check is not None
            item["can_force_return"] = can_force
            result.append(item)
    return result


# ── Borrows in my enrolled rooms ───────────────────────────────────────────────

def get_borrows_in_my_rooms(sid: str) -> list:
    with _conn() as conn:
        rows = conn.execute(
            """SELECT DISTINCT b.c_no, b.room, b.lend_sid, b.lend_name,
                      c.title, c.time, c.credits, c.weekday
               FROM borrows b
               JOIN courses c ON b.c_no = c.c_no
               WHERE b.lend_sid != ?
                 AND b.room IN (
                     SELECT DISTINCT cr.room FROM classes cl
                     JOIN courses cr ON cl.c_no = cr.c_no
                     WHERE cl.sid = ?
                 )
               ORDER BY c.weekday, b.room, c.time""",
            (EMPTY, sid),
        ).fetchall()
    return [dict(r) for r in rows]


# ── Force return ───────────────────────────────────────────────────────────────

def force_return_room(target_c_no: str, requester_sid: str) -> str:
    with _conn() as conn:
        borrow = conn.execute(
            "SELECT lend_sid, room FROM borrows WHERE c_no=?",
            (target_c_no,),
        ).fetchone()
        if not borrow or borrow["lend_sid"] == EMPTY:
            raise ValueError("該教室目前未被借用")

        displaced_sid = borrow["lend_sid"]
        if displaced_sid == requester_sid:
            raise ValueError("無法強制歸還自己借用的教室")

        auth = conn.execute(
            """SELECT 1
               FROM classes my_cl
               JOIN courses my_c ON my_cl.c_no = my_c.c_no
               JOIN courses tgt  ON tgt.c_no = ?
               WHERE my_cl.sid = ?
                 AND my_c.room    = tgt.room
                 AND my_c.weekday = tgt.weekday
                 AND (
                   (CAST(substr(my_c.time,1,2) AS INTEGER)*60
                    + CAST(substr(my_c.time,4,2) AS INTEGER))
                   >=
                   (CAST(substr(tgt.time,1,2) AS INTEGER)*60
                    + CAST(substr(tgt.time,4,2) AS INTEGER))
                     + (tgt.credits * 60) - 10
                 )
               LIMIT 1""",
            (target_c_no, requester_sid),
        ).fetchone()
        if not auth:
            raise ValueError("您沒有權限強制歸還此教室（需修同教室、同天的後續課程）")

        conn.execute(
            "UPDATE borrows SET lend_sid=?, lend_name=?, lend_password=? WHERE c_no=?",
            (EMPTY, EMPTY, EMPTY, target_c_no),
        )
        conn.commit()
    return displaced_sid


def get_all_active_borrows() -> list:
    with _conn() as conn:
        rows = conn.execute(
            """SELECT b.c_no, b.room, b.lend_sid, b.lend_name, c.title
               FROM borrows b JOIN courses c ON b.c_no = c.c_no
               WHERE b.lend_sid != ?""",
            (EMPTY,),
        ).fetchall()
    return [dict(r) for r in rows]


# ── Notifications ──────────────────────────────────────────────────────────────

def create_notification(to_sid: str, from_sid: str, message: str) -> None:
    with _conn() as conn:
        conn.execute(
            "INSERT INTO notifications(to_sid,from_sid,message) VALUES(?,?,?)",
            (to_sid, from_sid, message),
        )
        conn.commit()


def get_notifications(sid: str) -> list:
    with _conn() as conn:
        rows = conn.execute(
            """SELECT id, from_sid, message, is_read, created_at
               FROM notifications WHERE to_sid=?
               ORDER BY is_read ASC, created_at DESC LIMIT 50""",
            (sid,),
        ).fetchall()
    return [dict(r) for r in rows]


def mark_notifications_read(sid: str, notif_id: Optional[int] = None) -> None:
    with _conn() as conn:
        if notif_id is not None:
            conn.execute(
                "UPDATE notifications SET is_read=1 WHERE id=? AND to_sid=?",
                (notif_id, sid),
            )
        else:
            conn.execute("UPDATE notifications SET is_read=1 WHERE to_sid=?", (sid,))
        conn.commit()
