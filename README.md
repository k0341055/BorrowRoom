# 高科線上借教室系統

> 國立高雄科技大學（NKUST）教室線上借用系統，提供學生以學號登入並借還教室的服務。

---

## 系統版本

| 版本 | 介面 | 啟動方式 |
|------|------|----------|
| **V1** | 命令列（CLI） | `python borrow.py` |
| **V2** | 網頁前後端（Web） | `cd v2 && uvicorn main:app --reload` |

---

## V2 系統架構

```mermaid
graph TB
    subgraph Client["🌐 前端（Browser）"]
        HTML["index.html<br/>Tailwind CSS"]
        JS["app.js<br/>Fetch API"]
    end

    subgraph Server["⚡ 後端（FastAPI Server）"]
        Auth["Auth API<br/>/api/auth/*"]
        Borrow["Borrow API<br/>/api/borrow"]
        Return["Return API<br/>/api/return"]
        Info["Info API<br/>/api/borrows<br/>/api/courses/me"]
        Static["Static Files<br/>/static/*"]
        Session["In-Memory<br/>Session Store"]
    end

    subgraph DB["🗄️ 資料層（SQLite）"]
        database["database.py<br/>參數化查詢"]
        sqlite[("db.sqlite")]
    end

    HTML --> JS
    JS -->|"HTTP + Bearer Token"| Auth
    JS -->|"HTTP + Bearer Token"| Borrow
    JS -->|"HTTP + Bearer Token"| Return
    JS -->|"HTTP + Bearer Token"| Info
    Auth <--> Session
    Auth --> database
    Borrow --> database
    Return --> database
    Info --> database
    database <--> sqlite
    Static -->|"Serve HTML/JS"| HTML
```

---

## 使用者操作流程

```mermaid
flowchart TD
    Start([開啟網頁]) --> Login[登入頁面]
    Login --> Auth{驗證帳號密碼}
    Auth -->|失敗| Login
    Auth -->|成功| Dashboard[主控台 Dashboard]

    Dashboard --> ViewStatus[查看目前借用狀態]
    Dashboard --> ViewCourses[查看修課清單]
    Dashboard --> Choose{選擇操作}

    Choose -->|借教室| BorrowForm[填寫課程編號 + 教室]
    BorrowForm --> Check{條件驗證}
    Check -->|查無課程/教室| ErrNotFound[❌ 查無紀錄]
    Check -->|未修此課| ErrEnroll[❌ 您未修該門課]
    Check -->|已借有教室| ErrAlready[❌ 請先歸還現有教室]
    Check -->|教室已被借走| ErrOccupied[❌ 顯示借用者資訊]
    Check -->|✅ 條件符合| BorrowOK[🎉 借教室成功<br/>顯示教室密碼]
    BorrowOK --> Dashboard

    Choose -->|還教室| ReturnCheck{有借用紀錄？}
    ReturnCheck -->|沒有| ErrNoRecord[❌ 無借用紀錄]
    ReturnCheck -->|有| ReturnOK[✅ 歸還成功]
    ReturnOK --> Dashboard

    Choose -->|更改密碼| ChangePw[輸入新密碼]
    ChangePw --> PwOK[✅ 密碼更新 → 重新登入]

    Choose -->|登出| Login
```

---

## 資料庫結構

```mermaid
erDiagram
    STUDENTS {
        char sid PK "學號"
        char name "姓名"
        char dep "系所"
        char phone "聯絡電話"
        char password "密碼"
    }
    COURSES {
        char c_no PK "課程編號"
        char title "課程名稱"
        int  credits "學分數"
        time time "上課時間"
        char room "教室"
    }
    CLASSES {
        char sid FK "學號"
        char c_no FK "課程編號"
        char room "教室"
    }
    BORROWS {
        char c_no FK "課程編號"
        time time "時間"
        char room "教室"
        char lend_sid "借用者學號"
        char lend_name "借用者姓名"
        char lend_password "借用密碼"
    }

    STUDENTS ||--o{ CLASSES : "修課"
    COURSES  ||--o{ CLASSES : "開設"
    COURSES  ||--o{ BORROWS : "對應教室"
    STUDENTS ||--o{ BORROWS : "借用"
```

---

## API 端點（V2）

| 方法 | 路徑 | 說明 | 需登入 |
|------|------|------|--------|
| `POST` | `/api/auth/login` | 登入，取得 Bearer Token | ✗ |
| `POST` | `/api/auth/logout` | 登出，清除 Token | ✓ |
| `PUT` | `/api/auth/password` | 更改密碼（自動登出） | ✓ |
| `GET` | `/api/borrow/me` | 查詢我目前的借用紀錄 | ✓ |
| `POST` | `/api/borrow` | 借教室 | ✓ |
| `POST` | `/api/return` | 歸還教室 | ✓ |
| `GET` | `/api/borrows` | 查詢所有目前借用中紀錄 | ✓ |
| `GET` | `/api/courses/me` | 查詢我的修課清單 | ✓ |

---

## 快速啟動（V2）

```bash
cd v2
pip install -r requirements.txt
uvicorn main:app --reload
# 開啟瀏覽器：http://localhost:8000
```

互動式 API 文件（Swagger UI）：`http://localhost:8000/docs`

---

## 專案結構

```
BorrowRoom/
├── borrow.py              # V1 入口
├── lib.py                 # V1 核心邏輯（已優化：修復 SQL Injection、使用 secrets 等）
├── db.sqlite              # 共用 SQLite 資料庫
├── instruction.txt        # V1 使用說明
└── v2/
    ├── main.py            # FastAPI 後端（路由、認證）
    ├── database.py        # 資料庫操作層（參數化查詢）
    ├── models.py          # Pydantic 請求模型
    ├── requirements.txt   # Python 套件需求
    └── static/
        ├── index.html     # 前端單頁應用（Tailwind CSS）
        └── app.js         # 前端邏輯（Fetch API）
```

---

## V1 → V2 改善對照

| 項目 | V1（CLI） | V2（Web） |
|------|-----------|-----------|
| 介面 | Terminal 命令列 | 瀏覽器網頁 |
| 認證 | 每次輸入帳密 | Bearer Token（localStorage） |
| SQL | 字串格式化（有 Injection 風險）| 參數化查詢 |
| 密碼產生 | `random.random()` | `secrets.token_hex()` |
| 修課清單 | 無法直接查看 | 表格顯示，點擊自動填入 |
| 架構 | 單一 Python 腳本 | 前後端分離 REST API |
