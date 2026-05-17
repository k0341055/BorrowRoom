"""
init_db.py — 從零建立乾淨的 demo 資料庫（不含任何真實個資）
執行方式（在 v2/ 目錄下）：python init_db.py
"""
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "db.sqlite"
EMPTY = "null"


def create_schema(c):
    c.executescript("""
        CREATE TABLE IF NOT EXISTS students (
            sid      CHAR(7)  PRIMARY KEY,
            name     CHAR(10) NOT NULL,
            dep      CHAR(10),
            phone    CHAR(10),
            password CHAR(10) NOT NULL
        );

        CREATE TABLE IF NOT EXISTS courses (
            c_no    CHAR(4)   PRIMARY KEY,
            title   CHAR(10)  NOT NULL,
            credits INTEGER   NOT NULL,
            time    TIME      NOT NULL,
            room    CHAR(4)   NOT NULL
        );

        CREATE TABLE IF NOT EXISTS classes (
            sid   CHAR(7) NOT NULL REFERENCES students(sid),
            c_no  CHAR(4) NOT NULL REFERENCES courses(c_no),
            room  CHAR(4),
            PRIMARY KEY (sid, c_no)
        );

        CREATE TABLE IF NOT EXISTS borrows (
            c_no          CHAR(4)  PRIMARY KEY REFERENCES courses(c_no),
            time          TIME,
            room          CHAR,
            lend_sid      CHAR(7)  DEFAULT 'null',
            lend_name     CHAR(5)  DEFAULT 'null',
            lend_password CHAR(10) DEFAULT 'null'
        );

        CREATE TABLE IF NOT EXISTS notifications (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            to_sid     CHAR(7) NOT NULL,
            from_sid   CHAR(7) NOT NULL,
            message    TEXT    NOT NULL,
            is_read    INTEGER NOT NULL DEFAULT 0,
            created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
        );

        CREATE INDEX IF NOT EXISTS idx_notif_to_sid ON notifications(to_sid);
    """)


def seed_data(c):
    # ── Courses ───────────────────────────────────────────────────────────────
    # (c_no, title, credits, time, room)
    courses = [
        # E117
        ("1374", "資料庫管理與應用", 3, "09:10:00", "E117"),
        ("2001", "程式設計基礎",     2, "13:10:00", "E117"),
        ("2002", "網頁前端開發",     3, "15:10:00", "E117"),
        # E118
        ("2010", "作業系統概論",     3, "08:10:00", "E118"),
        ("2011", "計算機網路",       2, "13:10:00", "E118"),
        ("2012", "資訊安全概論",     3, "15:10:00", "E118"),
        # E211
        ("2159", "資料庫管理",       3, "13:30:00", "E211"),
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
        ("1991", "金融APP程式設計",  3, "16:30:00", "D202"),
        ("2050", "金融市場概論",     2, "09:10:00", "D202"),
        ("2051", "投資學",           3, "13:10:00", "D202"),
        # C401
        ("2060", "會計學",           3, "08:10:00", "C401"),
        ("2061", "稅務法規",         2, "13:10:00", "C401"),
        ("2062", "審計學",           3, "15:10:00", "C401"),
    ]
    c.executemany(
        "INSERT OR IGNORE INTO courses(c_no,title,credits,time,room) VALUES(?,?,?,?,?)",
        courses,
    )

    # ── Borrow sentinel rows ──────────────────────────────────────────────────
    c.executemany(
        "INSERT OR IGNORE INTO borrows(c_no,time,room,lend_sid,lend_name,lend_password) VALUES(?,?,?,?,?,?)",
        [(cno, t, room, EMPTY, EMPTY, EMPTY) for cno, _, _, t, room in courses],
    )

    # ── Demo students — all fictitious ────────────────────────────────────────
    # sid, name, dep, phone (fake), password
    students = [
        ("0341055", "k0341055",   "金融系4A",     "09XX-000001", "u0341055"),
        ("D000002",  "demo_lin",   "資訊管理系3A", "09XX-000002", "demo1"),
        ("D000003",  "demo_chen",  "資訊管理系3A", "09XX-000003", "demo2"),
        ("D000004",  "demo_wang",  "金融系2B",     "09XX-000004", "demo3"),
        ("D000005",  "demo_lee",   "會計資訊系2A", "09XX-000005", "demo4"),
        ("D000006",  "demo_wu",    "資訊管理系2A", "09XX-000006", "demo5"),
        ("D000007",  "demo_zhang", "金融系3A",     "09XX-000007", "demo6"),
    ]
    c.executemany(
        "INSERT OR IGNORE INTO students(sid,name,dep,phone,password) VALUES(?,?,?,?,?)",
        students,
    )

    # ── Enrollments ───────────────────────────────────────────────────────────
    enrollments = [
        # demo_user: 金融系 — E117, D202
        ("0341055", "1374", "E117"),
        ("0341055", "2001", "E117"),
        ("0341055", "2002", "E117"),
        ("0341055", "1991", "D202"),
        ("0341055", "2050", "D202"),
        ("0341055", "2051", "D202"),
        # demo_lin: 資管系 — E117, E118, E211
        ("D000002", "1374", "E117"),
        ("D000002", "2001", "E117"),
        ("D000002", "2002", "E117"),
        ("D000002", "2010", "E118"),
        ("D000002", "2011", "E118"),
        ("D000002", "2020", "E211"),
        ("D000002", "2159", "E211"),
        # demo_chen: 資管系 — E211, E212, B301
        ("D000003", "2021", "E211"),
        ("D000003", "2159", "E211"),
        ("D000003", "2030", "E212"),
        ("D000003", "2031", "E212"),
        ("D000003", "2040", "B301"),
        ("D000003", "2041", "B301"),
        # demo_wang: 金融系 — D202, E117
        ("D000004", "1991", "D202"),
        ("D000004", "2050", "D202"),
        ("D000004", "2051", "D202"),
        ("D000004", "2001", "E117"),
        ("D000004", "2002", "E117"),
        # demo_lee: 會計系 — C401, E212
        ("D000005", "2060", "C401"),
        ("D000005", "2061", "C401"),
        ("D000005", "2062", "C401"),
        ("D000005", "2030", "E212"),
        ("D000005", "2032", "E212"),
        # demo_wu: 資管系 — E212, B301
        ("D000006", "2030", "E212"),
        ("D000006", "2031", "E212"),
        ("D000006", "2032", "E212"),
        ("D000006", "2042", "B301"),
        # demo_zhang: 金融系 — D202, E118
        ("D000007", "2050", "D202"),
        ("D000007", "2051", "D202"),
        ("D000007", "2010", "E118"),
        ("D000007", "2012", "E118"),
    ]
    c.executemany(
        "INSERT OR IGNORE INTO classes(sid,c_no,room) VALUES(?,?,?)",
        enrollments,
    )

    # ── Pre-baked borrows for Gantt/force-return demo ─────────────────────────
    # demo_lin borrowed E118/作業系統概論 → demo_user has 2011(E118) after it
    # demo_chen borrowed E211/系統分析與設計 → demo_user has 2159(E211) after it
    # demo_wang borrowed D202/投資學 → demo_user has 1991(D202) after it
    active_borrows = [
        ("2010", "D000002", "demo_lin",  "ab12cd34ef56"),
        ("2021", "D000003", "demo_chen", "11aabb22ccdd"),
        ("2051", "D000004", "demo_wang", "fe98dc76ba54"),
    ]
    for cno, sid, name, key in active_borrows:
        c.execute(
            "UPDATE borrows SET lend_sid=?, lend_name=?, lend_password=? WHERE c_no=?",
            (sid, name, key, cno),
        )


def run():
    if DB_PATH.exists():
        DB_PATH.unlink()
        print("🗑  已刪除舊 db.sqlite")

    conn = sqlite3.connect(str(DB_PATH))
    c = conn.cursor()
    create_schema(c)
    seed_data(c)
    conn.commit()
    conn.close()
    print("✅ db.sqlite 重建完成（僅含虛構 demo 資料，無任何真實個資）")
    print(f"   路徑：{DB_PATH}")


if __name__ == "__main__":
    run()
