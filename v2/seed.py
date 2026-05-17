"""
seed.py — 初始化 / 補充測試資料
執行方式（在 v2/ 目錄下）：python seed.py
"""
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "db.sqlite"
EMPTY = "null"


def run():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    # ── notifications table ────────────────────────────────────────────────────
    c.execute("""
        CREATE TABLE IF NOT EXISTS notifications (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            to_sid     CHAR(7)  NOT NULL,
            from_sid   CHAR(7)  NOT NULL,
            message    TEXT     NOT NULL,
            is_read    INTEGER  NOT NULL DEFAULT 0,
            created_at TEXT     NOT NULL DEFAULT (datetime('now','localtime'))
        )
    """)
    c.execute("CREATE INDEX IF NOT EXISTS idx_notif_to_sid ON notifications(to_sid)")

    # ── courses ────────────────────────────────────────────────────────────────
    # format: (c_no, title, credits, time, room)
    new_courses = [
        # E117
        ("2001", "程式設計基礎",     2, "13:10:00", "E117"),
        ("2002", "網頁前端開發",     3, "15:10:00", "E117"),
        # E118
        ("2010", "作業系統概論",     3, "08:10:00", "E118"),
        ("2011", "計算機網路",       2, "13:10:00", "E118"),
        ("2012", "資訊安全概論",     3, "15:10:00", "E118"),
        # E211
        ("2020", "企業資源規劃",     2, "08:10:00", "E211"),
        ("2021", "系統分析與設計",   3, "10:10:00", "E211"),
        # E212
        ("2030", "統計學",           3, "09:10:00", "E212"),
        ("2031", "管理數學",         2, "13:10:00", "E212"),
        ("2032", "財務管理",         3, "15:10:00", "E212"),
        # B301
        ("2040", "微積分",           3, "08:10:00", "B301"),
        ("2041", "線性代數",         2, "13:10:00", "B301"),
        ("2042", "離散數學",         3, "15:10:00", "B301"),
        # D202
        ("2050", "金融市場概論",     2, "09:10:00", "D202"),
        ("2051", "投資學",           3, "13:10:00", "D202"),
        # C401
        ("2060", "會計學",           3, "08:10:00", "C401"),
        ("2061", "稅務法規",         2, "13:10:00", "C401"),
        ("2062", "審計學",           3, "15:10:00", "C401"),
    ]
    c.executemany(
        "INSERT OR IGNORE INTO courses(c_no,title,credits,time,room) VALUES(?,?,?,?,?)",
        new_courses,
    )

    # ── borrows sentinel rows for new courses ──────────────────────────────────
    borrow_sentinels = [
        (cno, t, room, EMPTY, EMPTY, EMPTY) for cno, _, _, t, room in new_courses
    ]
    c.executemany(
        "INSERT OR IGNORE INTO borrows(c_no,time,room,lend_sid,lend_name,lend_password) VALUES(?,?,?,?,?,?)",
        borrow_sentinels,
    )

    # ── demo students ──────────────────────────────────────────────────────────
    demo_students = [
        ("0341055", "k0341055", "金融系4A",     "----------", "u0341055"),  # existing, update name to anon
        ("9000001", "demo_lin",   "資訊管理系3A", "0911000001", "demo1"),
        ("9000002", "demo_chen",  "資訊管理系3A", "0911000002", "demo2"),
        ("9000003", "demo_wang",  "金融系2B",     "0911000003", "demo3"),
        ("9000004", "demo_lee",   "會計資訊系2A", "0911000004", "demo4"),
    ]
    c.executemany(
        "INSERT OR IGNORE INTO students(sid,name,dep,phone,password) VALUES(?,?,?,?,?)",
        demo_students,
    )

    # ── enrollments for demo students ─────────────────────────────────────────
    # format: (sid, c_no, room)
    enrollments = [
        # demo_lin: 資管 — enrolled in E117, E118, E211 courses
        ("9000001", "1374", "E117"),
        ("9000001", "2001", "E117"),
        ("9000001", "2002", "E117"),
        ("9000001", "2010", "E118"),
        ("9000001", "2011", "E118"),
        ("9000001", "2020", "E211"),
        ("9000001", "2159", "E211"),
        # demo_chen: 資管 — E211, E212, B301
        ("9000002", "2021", "E211"),
        ("9000002", "2159", "E211"),
        ("9000002", "2030", "E212"),
        ("9000002", "2031", "E212"),
        ("9000002", "2040", "B301"),
        ("9000002", "2041", "B301"),
        # demo_wang: 金融 — D202, E117
        ("9000003", "1991", "D202"),
        ("9000003", "2050", "D202"),
        ("9000003", "2051", "D202"),
        ("9000003", "2001", "E117"),
        ("9000003", "2002", "E117"),
        # demo_lee: 會計 — C401, E212
        ("9000004", "2060", "C401"),
        ("9000004", "2061", "C401"),
        ("9000004", "2062", "C401"),
        ("9000004", "2030", "E212"),
        ("9000004", "2032", "E212"),
        # keep existing enrollments for k0341055 (0341055) — add more
        ("0341055", "1374", "E117"),
        ("0341055", "2001", "E117"),
        ("0341055", "2002", "E117"),
        ("0341055", "1991", "D202"),
        ("0341055", "2050", "D202"),
        ("0341055", "2051", "D202"),
    ]
    c.executemany(
        "INSERT OR IGNORE INTO classes(sid,c_no,room) VALUES(?,?,?)",
        enrollments,
    )

    # ── pre-baked active borrows for demo/testing ──────────────────────────────
    # Scenario A: demo_lin has borrowed E118/作業系統概論 (2010, ends ~11:00)
    # Scenario B: demo_chen has borrowed E211/系統分析與設計 (2021, ends ~13:00)
    # Scenario C: demo_wang has borrowed D202/投資學 (2051, ends ~16:00)
    # These create interesting Gantt states to test force-return
    active_borrows = [
        # (c_no, lend_sid, lend_name, key)
        ("2010", "9000001", "demo_lin",  "ab12cd34ef56"),
        ("2021", "9000002", "demo_chen", "11aabb22ccdd"),
        ("2051", "9000003", "demo_wang", "fe98dc76ba54"),
    ]
    for cno, sid, name, key in active_borrows:
        c.execute(
            "UPDATE borrows SET lend_sid=?, lend_name=?, lend_password=? WHERE c_no=?",
            (sid, name, key, cno),
        )

    conn.commit()
    conn.close()
    print("✅ Seed 完成：notifications table、新課程、示範學生、選課紀錄、借用狀態已寫入 db.sqlite")


if __name__ == "__main__":
    run()
