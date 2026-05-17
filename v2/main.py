import secrets
import uuid
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.staticfiles import StaticFiles

import database as db
from models import (
    BorrowRequest,
    ChangePasswordRequest,
    EnrollRequest,
    ForceReturnRequest,
    LoginRequest,
    MarkReadRequest,
)

app = FastAPI(title="學生個人管理系統 API", version="2.0.0")
security = HTTPBearer()

# In-memory session store: token -> {sid, name}
sessions: dict[str, dict] = {}

BASE_DIR = Path(__file__).parent


# ── Auth helper ───────────────────────────────────────────────────────────────

def get_auth(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    user = sessions.get(token)
    if not user:
        raise HTTPException(status_code=401, detail="未登入或 Token 已過期，請重新登入")
    return token, user


# ── Static files ──────────────────────────────────────────────────────────────

app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")


@app.get("/", include_in_schema=False)
def root():
    return FileResponse(str(BASE_DIR / "static" / "index.html"))


# ── Auth ──────────────────────────────────────────────────────────────────────

@app.post("/api/auth/login")
def login(req: LoginRequest):
    user = db.authenticate(req.sid, req.password)
    if not user:
        raise HTTPException(status_code=401, detail="帳號或密碼錯誤")
    token = str(uuid.uuid4())
    sessions[token] = {"sid": user["sid"], "name": user["name"]}
    return {"token": token, "sid": user["sid"], "name": user["name"]}


@app.post("/api/auth/logout")
def logout(auth=Depends(get_auth)):
    token, _ = auth
    sessions.pop(token, None)
    return {"message": "已登出"}


@app.put("/api/auth/password")
def change_password(req: ChangePasswordRequest, auth=Depends(get_auth)):
    token, user = auth
    if not req.new_password.strip():
        raise HTTPException(status_code=422, detail="新密碼不得為空")
    db.change_password(user["sid"], req.new_password)
    sessions.pop(token, None)
    return {"message": "密碼已更新，請重新登入"}


# ── Borrow ────────────────────────────────────────────────────────────────────

@app.get("/api/borrow/me")
def get_my_borrow(auth=Depends(get_auth)):
    _, user = auth
    return {"borrow": db.get_my_borrow(user["sid"])}


@app.post("/api/borrow")
def borrow_room(req: BorrowRequest, auth=Depends(get_auth)):
    _, user = auth

    room_info = db.get_room(req.c_no, req.room)
    if not room_info:
        raise HTTPException(status_code=404, detail="查無該教室或課程編號，請確認輸入")

    if not db.is_enrolled(user["sid"], req.c_no):
        raise HTTPException(status_code=403, detail="您未修該門課，無法借用此教室")

    existing = db.get_my_borrow(user["sid"])
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"您已借有「{existing['room']}」教室，請先歸還後再借其他教室",
        )

    if room_info["lend_sid"] != "null":
        lender = db.get_lender_contact(room_info["lend_sid"])
        detail = f"教室 {req.room} 已被學號 {room_info['lend_sid']}（{room_info['lend_name']}）借走"
        if lender and lender.get("phone"):
            detail += f"，聯絡電話：{lender['phone']}"
        raise HTTPException(status_code=409, detail=detail)

    key = secrets.token_hex(6)
    db.borrow_room(user["sid"], user["name"], req.c_no, req.room, key)
    return {"message": "借教室成功", "key": key, "room": req.room, "c_no": req.c_no}


@app.post("/api/return")
def return_room(auth=Depends(get_auth)):
    _, user = auth
    existing = db.get_my_borrow(user["sid"])
    if not existing:
        raise HTTPException(status_code=404, detail="您目前沒有借教室紀錄")
    db.return_room(user["sid"])
    return {"message": f"教室「{existing['room']}」已成功歸還"}


# ── Force return ──────────────────────────────────────────────────────────────

@app.post("/api/borrow/force-return")
def force_return(req: ForceReturnRequest, auth=Depends(get_auth)):
    _, user = auth
    try:
        displaced_sid = db.force_return_room(req.c_no, user["sid"])
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))

    # Look up course info for the notification message
    import sqlite3 as _sql
    conn = _sql.connect(str(db.DB_PATH))
    conn.row_factory = _sql.Row
    course = conn.execute("SELECT title, room FROM courses WHERE c_no=?", (req.c_no,)).fetchone()
    conn.close()

    msg = (
        f"⚠️ 系統通知：您借用的教室「{course['room']}」（{course['title']}）"
        f"已被學號 {user['sid']} 強制歸還，請知悉。"
    )
    db.create_notification(to_sid=displaced_sid, from_sid=user["sid"], message=msg)

    return {"message": f"教室「{course['room']}」已強制歸還，系統已通知原借用者"}


# ── Courses / Enrollment ──────────────────────────────────────────────────────

@app.get("/api/courses/me")
def get_my_courses(auth=Depends(get_auth)):
    _, user = auth
    return {"courses": db.get_enrolled_courses(user["sid"])}


@app.get("/api/courses/available")
def get_available_courses(auth=Depends(get_auth)):
    _, user = auth
    return {"courses": db.get_available_courses(user["sid"])}


@app.post("/api/enroll")
def enroll(req: EnrollRequest, auth=Depends(get_auth)):
    _, user = auth
    try:
        db.enroll_course(user["sid"], req.c_no)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"message": "選課成功"}


@app.delete("/api/enroll/{c_no}")
def drop(c_no: str, auth=Depends(get_auth)):
    _, user = auth
    existing = db.get_my_borrow(user["sid"])
    if existing and existing["c_no"] == c_no:
        raise HTTPException(status_code=409, detail="您正在借用此課程的教室，請先歸還後再退選")
    db.drop_course(user["sid"], c_no)
    return {"message": "退選成功"}


# ── Room schedule (Gantt) ─────────────────────────────────────────────────────

@app.get("/api/rooms/{room}/schedule")
def room_schedule(room: str, auth=Depends(get_auth)):
    _, user = auth
    schedule = db.get_room_schedule(room, user["sid"])
    return {"room": room, "schedule": schedule}


# ── Borrows in my enrolled rooms ──────────────────────────────────────────────

@app.get("/api/borrows/my-rooms")
def my_room_borrows(auth=Depends(get_auth)):
    _, user = auth
    return {"borrows": db.get_borrows_in_my_rooms(user["sid"])}


# ── Notifications ─────────────────────────────────────────────────────────────

@app.get("/api/notifications")
def get_notifications(auth=Depends(get_auth)):
    _, user = auth
    notifs = db.get_notifications(user["sid"])
    unread = sum(1 for n in notifs if not n["is_read"])
    return {"notifications": notifs, "unread": unread}


@app.post("/api/notifications/read")
def mark_read(req: MarkReadRequest, auth=Depends(get_auth)):
    _, user = auth
    db.mark_notifications_read(user["sid"], req.notif_id)
    return {"message": "已標記為已讀"}
