# 學生個人管理系統

> 大學學生個人管理系統，整合線上**選課**、**借教室**與**週課表排程**，支援即時 QR Code 開門、強制歸還與推播通知。

---

## 系統版本

| 版本 | 介面 | 功能 |
|------|------|------|
| **V1** | 命令列（CLI） | 借教室、還教室 |
| **V2** | 網頁前後端（Web SPA） | 選課、借/還教室、週課表、甘特圖、QR Code 開門、強制歸還、即時通知 |

---

## 快速啟動（V2）

```bash
cd v2
pip install -r requirements.txt
python init_db.py          # 初始化 demo 資料庫（只需執行一次）
uvicorn main:app --reload
```

開啟瀏覽器：`http://localhost:8000`  
互動式 API 文件：`http://localhost:8000/docs`

**測試帳號：**

| 學號 | 密碼 | 系所 | 修課教室 |
|------|------|------|------|
| `0341055` | `u0341055` | 金融系 | E117 · D202 |
| `D000002` | `demo1` | 資管系 | E117 · E118 · E211 |
| `D000003` | `demo2` | 資管系 | E211 · E212 · B301 |
| `D000004` | `demo3` | 金融系 | D202 · E117 |
| `D000005` | `demo4` | 會計系 | C401 · E212 |
| `D000006` | `demo5` | 資管系 | E212 · B301 |
| `D000007` | `demo6` | 金融系 | D202 · E118 |

---

## 系統架構

```mermaid
graph TB
    subgraph Client["🌐 前端（Browser SPA）"]
        HTML["index.html<br/>Tailwind CSS · qrcodejs"]
        JS["app.js<br/>Fetch API · 5-Tab Router<br/>每 30 秒通知輪詢"]
    end

    subgraph Server["⚡ 後端（FastAPI）"]
        Router["路由層<br/>16 個 REST API 端點"]
        Session["In-Memory<br/>Session Store<br/>token → {sid, name}"]
    end

    subgraph Data["🗄️ 資料層（SQLite）"]
        DAO["database.py<br/>參數化 SQL 查詢"]
        DB[("db.sqlite<br/>students / courses<br/>classes / borrows<br/>notifications")]
    end

    JS -- "① HTTP 請求<br/>Authorization: Bearer token<br/>JSON Request Body" --> Router
    Router -- "② JSON 回應<br/>200 {data} / 4xx {detail}" --> JS
    Router <--> Session
    Router --> DAO
    DAO -- "③ SQL 查詢<br/>SELECT / UPDATE / INSERT" --> DB
    DB -- "④ Row 資料回傳" --> DAO
    DAO --> Router
```

---

## 前後端資料流

以「借教室」為例，完整說明一次 HTTP 往返的資料流向：

```mermaid
sequenceDiagram
    actor User as 學生
    participant SPA as 前端 SPA<br/>(app.js)
    participant API as FastAPI 後端
    participant DB  as SQLite

    Note over User,SPA: 登入階段
    User  ->>  SPA: 輸入學號 / 密碼
    SPA   ->>+ API: POST /api/auth/login<br/>{ sid, password }
    API   ->>+ DB : SELECT students WHERE sid=? AND password=?
    DB  -->>- API : user row（sid, name, dep）
    API -->>- SPA : 200 { token, sid, name }
    SPA   ->>  SPA: localStorage.setItem(token)

    Note over User,SPA: 借教室階段
    User  ->>  SPA: 點選課程卡片 → Gantt → 立即借此教室
    SPA   ->>+ API: POST /api/borrow<br/>Authorization: Bearer {token}<br/>{ c_no, room }
    API   ->>+ DB : ① SELECT classes（驗證有無選課）<br/>② SELECT borrows（查詢教室是否空閒）
    DB  -->>- API : 選課紀錄 + 教室狀態
    API   ->>  DB : UPDATE borrows SET lend_sid=?, lend_password=?
    API -->>- SPA : 200 { message, key, room, c_no }
    SPA   ->>  User: 顯示 QR Code + 倒數計時器<br/>（有效時間 = 課程時長）

    Note over User,SPA: 歸還教室
    User  ->>  SPA: 點擊「歸還」按鈕
    SPA   ->>+ API: POST /api/return<br/>Authorization: Bearer {token}<br/>{ c_no }
    API   ->>+ DB : UPDATE borrows SET lend_sid='null'<br/>WHERE c_no=? AND lend_sid=?
    DB  -->>- API : 更新成功
    API -->>- SPA : 200 { message }
    SPA   ->>  User: Toast 提示 + 刷新狀態

    Note over User,SPA: 強制歸還（課程接續時）
    User  ->>  SPA: Gantt 紅色條 → 強制歸還
    SPA   ->>+ API: POST /api/borrow/force-return<br/>{ c_no }
    API   ->>+ DB : 驗證接續條件<br/>UPDATE borrows（清空）<br/>INSERT notifications（通知對方）
    DB  -->>- API : 操作結果
    API -->>- SPA : 200 { message }
    SPA   ->>  User: Toast 提示；原借用者收到推播通知
```

---

## 使用者操作流程

```mermaid
flowchart TD
    Start([開啟網頁]) --> Login[登入]
    Login --> Auth{帳密驗證}
    Auth -->|失敗| Login
    Auth -->|成功| Dashboard[主控台 Dashboard]

    Dashboard --> T1[我的狀態]
    Dashboard --> T2[選課]
    Dashboard --> T3[借教室]
    Dashboard --> T4[課表]
    Dashboard --> T5[設定]

    T1 --> S1[查看借用狀態]
    T1 --> S2[修課教室借用狀況]
    S1 -->|借用中| Return1[🔑 歸還教室]

    T2 --> E1[已選課程列表]
    T2 --> E2[可加選課程列表]
    E2 --> Enroll[加選]
    E1 --> Drop[退選]

    T3 --> ActiveBorrow[目前借用中 + 歸還按鈕]
    T3 --> Cards[課程卡片清單<br/>含教室 / 星期 / 時段]
    Cards --> GanttM[開啟教室甘特圖 Modal]
    GanttM --> G2{教室狀態?}
    G2 -->|空閒 + 已選課| BorrowBtn[立即借此教室]
    G2 -->|已被借走| Occupied[顯示借用者資訊]
    G2 -->|可強制歸還| ForceBtn[🔴 強制歸還]
    BorrowBtn --> QR[🎉 QR Code + 倒數計時]
    ForceBtn --> Notify[📬 通知原借用者]
    ActiveBorrow --> Return2[🔑 歸還教室]

    T4 --> TT[週課表格 Mon–Fri]
    TT --> ClickBlock[點擊課程區塊]
    ClickBlock --> GanttM

    T5 --> PW[更改密碼]

    Dashboard --> Bell[🔔 通知鈴]
    Bell --> NotifDrawer[通知抽屜]
    NotifDrawer --> MarkRead[標記已讀]
```

---

## QR Code 開門機制

借教室成功後系統自動產生限時 QR Code：

| 欄位 | 說明 |
|------|------|
| `room` | 教室名稱（例：E117） |
| `key` | 隨機 6-byte hex 密鑰（`secrets.token_hex(6)`） |
| `c_no` | 課程編號 |
| `exp` | 到期時間戳（`Date.now() + 課程時長 ms`） |

- **有效時長**：課程學分 × 60 分鐘 − 10 分鐘（例：3 學分 = 170 分鐘）
- **門禁端**：掃描後解析 JSON，驗證 `key` 與 `exp` 是否在有效期內再開門
- **備用方式**：無法掃碼時可手動輸入備用密碼

---

## 教室甘特圖說明

甘特圖時間軸為 **08:00 – 21:00**，每門課依借用狀態顯示不同顏色：

| 顏色 | 說明 |
|------|------|
| 🟢 綠色 | 教室空閒，可借用 |
| 🟣 靛色 | 我目前借用中 |
| 🟡 黃色 | 他人借用中（無法強制歸還） |
| 🔴 紅色 | 他人借用中，且我的課緊接在後 → 可強制歸還 |

**強制歸還條件（三項同時成立）：**
1. 教室目前被他人借用
2. 我有修該教室的下一堂課
3. 我的課程起始時間 ≥ 當前借用課程的結束時間（`起始 + 學分×60 − 10 分`）

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
        int  weekday "星期（1=週一…5=週五）"
    }
    CLASSES {
        char sid FK "學號"
        char c_no FK "課程編號"
        char room "教室"
    }
    BORROWS {
        char c_no PK_FK "課程編號（主鍵）"
        time time "上課時間"
        char room "教室"
        char lend_sid "借用者學號（null=空閒）"
        char lend_name "借用者姓名"
        char lend_password "借用密碼"
    }
    NOTIFICATIONS {
        int  id PK "通知 ID"
        char to_sid FK "接收者學號"
        char from_sid "發送者學號"
        text message "通知內容"
        int  is_read "0=未讀 / 1=已讀"
        text created_at "建立時間"
    }

    STUDENTS ||--o{ CLASSES       : "選課"
    COURSES  ||--o{ CLASSES       : "開設"
    COURSES  ||--|| BORROWS       : "對應教室狀態"
    STUDENTS ||--o{ NOTIFICATIONS : "接收通知"
```

---

## API 端點（V2）

| 方法 | 路徑 | 說明 | 需登入 | 請求 Body | 回應 |
|------|------|------|--------|-----------|------|
| `POST` | `/api/auth/login` | 登入，取得 Bearer Token | ✗ | `{sid, password}` | `{token, sid, name}` |
| `POST` | `/api/auth/logout` | 登出，清除 Session | ✓ | — | `{message}` |
| `PUT` | `/api/auth/password` | 更改密碼 | ✓ | `{new_password}` | `{message}` |
| `GET` | `/api/borrow/me` | 我目前所有借用紀錄 | ✓ | — | `{borrows: [...]}` |
| `POST` | `/api/borrow` | 借教室 | ✓ | `{c_no, room}` | `{message, key, room, c_no}` |
| `POST` | `/api/return` | 歸還指定教室 | ✓ | `{c_no}` | `{message}` |
| `POST` | `/api/borrow/force-return` | 強制歸還（接續課程者） | ✓ | `{c_no}` | `{message}` |
| `GET` | `/api/courses/me` | 我的修課清單 | ✓ | — | `{courses: [...]}` |
| `GET` | `/api/courses/available` | 可加選課程 | ✓ | — | `{courses: [...]}` |
| `POST` | `/api/enroll` | 加選課程 | ✓ | `{c_no}` | `{message}` |
| `DELETE` | `/api/enroll/{c_no}` | 退選課程 | ✓ | — | `{message}` |
| `GET` | `/api/rooms/{room}/schedule` | 教室排程（甘特圖資料），可加 `?weekday=N` | ✓ | — | `{schedule: [...]}` |
| `GET` | `/api/borrows/my-rooms` | 修課教室的借用狀況 | ✓ | — | `{borrows: [...]}` |
| `GET` | `/api/notifications` | 我的通知列表 | ✓ | — | `{notifications: [...], unread: N}` |
| `POST` | `/api/notifications/read` | 標記通知已讀 | ✓ | `{notif_id?}` | `{message}` |

---

## 專案結構

```
BorrowRoom/
├── borrow.py              # V1 入口
├── lib.py                 # V1 核心邏輯（已優化：SQL Injection、secrets 修復）
├── db.sqlite              # 共用 SQLite 資料庫（.gitignore 中，不上傳）
├── instruction.txt        # V1 使用說明
└── v2/
    ├── main.py            # FastAPI 後端（15 個 API 端點）
    ├── database.py        # 資料庫操作層（參數化查詢）
    ├── models.py          # Pydantic 請求模型
    ├── init_db.py         # Demo 資料庫初始化（7 教室、22 課程、7 學生）
    ├── seed.py            # 呼叫 init_db 的捷徑腳本
    ├── requirements.txt   # Python 套件需求
    └── static/
        ├── index.html     # 前端 SPA（5-Tab + 通知抽屜 + QR Modal）
        └── app.js         # 前端邏輯（Tab 路由、週課表、甘特圖、QR 倒數、通知輪詢）
```

---

## V1 → V2 改善對照

| 項目 | V1（CLI） | V2（Web） |
|------|-----------|-----------|
| 介面 | Terminal | 瀏覽器 5-Tab SPA + Dark Mode |
| 認證 | 每次輸入帳密 | Bearer Token（localStorage）|
| SQL 安全 | 字串格式化（Injection 風險）| 參數化查詢 `?` |
| 密碼產生 | `random.random()` | `secrets.token_hex(6)` |
| 選課 | ✗ | ✓ 加選 / 退選，含衝突保護 |
| 借用限制 | 全局一人一間 | 每間教室同時僅一人，同學可借多間 |
| 教室排程 | ✗ | ✓ 週課表格（Mon–Fri × 08:00–20:00）|
| 甘特圖 | ✗ | ✓ 教室日視圖（08:00–21:00），點課程 Block 觸發 |
| 開門機制 | 顯示密碼 | ✓ 限時 QR Code（課程時長倒數）+ 備用密碼 |
| 強制歸還 | ✗ | ✓ 接續課程者可強制歸還，自動通知原借用者 |
| 通知系統 | ✗ | ✓ 即時推播 + 30 秒輪詢 |
| 深色模式 | ✗ | ✓ 自動偵測系統主題 + 手動切換 |
