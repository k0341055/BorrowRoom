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
            c_no    CHAR(4)  PRIMARY KEY,
            title   CHAR(20) NOT NULL,
            credits INTEGER  NOT NULL,
            time    TIME     NOT NULL,
            room    CHAR(4)  NOT NULL,
            weekday INTEGER  NOT NULL DEFAULT 1
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
            lend_name     CHAR(10) DEFAULT 'null',
            lend_password CHAR(12) DEFAULT 'null'
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
    # ── Courses ──────────────────────────────────────────────────────────────
    # (c_no, title, credits, time, room, weekday)  weekday: 1=週一 … 5=週五
    courses = [
        # E117 ── 週一/週三/週五
        ("1001", "電腦概論",           2, "08:10:00", "E117", 1),  # 週一（force-return demo）
        ("1374", "資料庫管理與應用",   3, "10:10:00", "E117", 1),  # 週一
        ("2001", "程式設計基礎",       2, "13:10:00", "E117", 3),  # 週三
        ("2002", "網頁前端開發",       3, "15:10:00", "E117", 5),  # 週五
        # E118 ── 週二/週四
        ("2010", "作業系統概論",       3, "08:10:00", "E118", 2),  # 週二
        ("2011", "計算機網路",         2, "13:10:00", "E118", 2),  # 週二
        ("2012", "資訊安全概論",       3, "15:10:00", "E118", 4),  # 週四
        # E211 ── 週三/週四
        ("2020", "企業資源規劃",       2, "08:10:00", "E211", 3),  # 週三
        ("2021", "系統分析與設計",     3, "10:10:00", "E211", 3),  # 週三
        ("2159", "資料庫管理",         3, "13:30:00", "E211", 4),  # 週四
        # E212 ── 週二/週四
        ("2030", "統計學",             3, "09:10:00", "E212", 2),  # 週二
        ("2031", "管理數學",           2, "13:10:00", "E212", 4),  # 週四
        ("2032", "財務管理",           3, "15:10:00", "E212", 4),  # 週四
        # B301 ── 週一/週三/週五
        ("2040", "微積分",             3, "08:10:00", "B301", 1),  # 週一
        ("2041", "線性代數",           2, "13:10:00", "B301", 3),  # 週三
        ("2042", "離散數學",           3, "15:10:00", "B301", 5),  # 週五
        # D202 ── 週二/週四/週五
        ("2050", "金融市場概論",       2, "09:10:00", "D202", 2),  # 週二
        ("2051", "投資學",             3, "13:10:00", "D202", 4),  # 週四
        ("1991", "金融APP程式設計",    3, "16:30:00", "D202", 5),  # 週五
        # C401 ── 週一/週三/週五
        ("2060", "會計學",             3, "08:10:00", "C401", 1),  # 週一
        ("2061", "稅務法規",           2, "13:10:00", "C401", 3),  # 週三
        ("2062", "審計學",             3, "15:10:00", "C401", 5),  # 週五
    ]
    c.executemany(
        "INSERT OR IGNORE INTO courses(c_no,title,credits,time,room,weekday) VALUES(?,?,?,?,?,?)",
        courses,
    )

    # ── Borrow sentinel rows ──────────────────────────────────────────────────
    c.executemany(
        "INSERT OR IGNORE INTO borrows(c_no,time,room,lend_sid,lend_name,lend_password) VALUES(?,?,?,?,?,?)",
        [(cno, t, room, EMPTY, EMPTY, EMPTY) for cno, _, _, t, room, _ in courses],
    )

    # ── Demo students ─────────────────────────────────────────────────────────
    students = [
        ("0341055", "k0341055",   "金融系4A",     "09XX-000001", "u0341055"),
        ("D000002", "demo_lin",   "資訊管理系3A", "09XX-000002", "demo1"),
        ("D000003", "demo_chen",  "資訊管理系3A", "09XX-000003", "demo2"),
        ("D000004", "demo_wang",  "金融系2B",     "09XX-000004", "demo3"),
        ("D000005", "demo_lee",   "會計資訊系2A", "09XX-000005", "demo4"),
        ("D000006", "demo_wu",    "資訊管理系2A", "09XX-000006", "demo5"),
        ("D000007", "demo_zhang", "金融系3A",     "09XX-000007", "demo6"),
    ]
    c.executemany(
        "INSERT OR IGNORE INTO students(sid,name,dep,phone,password) VALUES(?,?,?,?,?)",
        students,
    )

    # ── Enrollments ───────────────────────────────────────────────────────────
    enrollments = [
        # 0341055: E117(週一/週三/週五) + D202(週二/週四/週五)
        # 注意：沒有選 1001，以便測試 force-return
        ("0341055", "1374", "E117"),
        ("0341055", "2001", "E117"),
        ("0341055", "2002", "E117"),
        ("0341055", "2050", "D202"),
        ("0341055", "2051", "D202"),
        ("0341055", "1991", "D202"),
        # D000002: E117(含1001) + E118 + E211
        ("D000002", "1001", "E117"),
        ("D000002", "1374", "E117"),
        ("D000002", "2001", "E117"),
        ("D000002", "2010", "E118"),
        ("D000002", "2011", "E118"),
        ("D000002", "2020", "E211"),
        ("D000002", "2159", "E211"),
        # D000003: E211 + E212 + B301
        ("D000003", "2021", "E211"),
        ("D000003", "2159", "E211"),
        ("D000003", "2030", "E212"),
        ("D000003", "2031", "E212"),
        ("D000003", "2040", "B301"),
        ("D000003", "2041", "B301"),
        # D000004: D202 + E117
        ("D000004", "2050", "D202"),
        ("D000004", "2051", "D202"),
        ("D000004", "1991", "D202"),
        ("D000004", "2001", "E117"),
        ("D000004", "2002", "E117"),
        # D000005: C401 + E212
        ("D000005", "2060", "C401"),
        ("D000005", "2061", "C401"),
        ("D000005", "2062", "C401"),
        ("D000005", "2030", "E212"),
        ("D000005", "2032", "E212"),
        # D000006: E212 + B301
        ("D000006", "2030", "E212"),
        ("D000006", "2031", "E212"),
        ("D000006", "2032", "E212"),
        ("D000006", "2042", "B301"),
        # D000007: D202 + E118
        ("D000007", "2050", "D202"),
        ("D000007", "2051", "D202"),
        ("D000007", "2010", "E118"),
        ("D000007", "2012", "E118"),
    ]
    c.executemany(
        "INSERT OR IGNORE INTO classes(sid,c_no,room) VALUES(?,?,?)",
        enrollments,
    )

    # ── Pre-baked borrows for demo ────────────────────────────────────────────
    # Scenario A: D000002 借 1001(E117,週一,08:10,ends 10:00)
    #   → 0341055 有 1374(E117,週一,10:10) ∴ 0341055 可強制歸還 ✓
    # Scenario B: D000003 借 2021(E211,週三,10:10)
    #   → 顯示教室被佔用（0341055 未選 E211，僅展示）
    # Scenario C: D000004 借 2051(D202,週四,13:10)
    #   → 0341055 選了 2051 但同一天後無 D202 課 → 無法強制歸還
    #   → 出現在「修課教室借用狀況」
    active_borrows = [
        ("1001", "D000002", "demo_lin",  "ab12cd34ef56"),
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
    cc = conn.cursor()
    create_schema(cc)
    seed_data(cc)
    conn.commit()
    conn.close()
    print("✅ db.sqlite 重建完成（僅含虛構 demo 資料）")
    print(f"   路徑：{DB_PATH}")


if __name__ == "__main__":
    run()
