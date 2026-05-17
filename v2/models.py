from typing import Optional
from pydantic import BaseModel


class LoginRequest(BaseModel):
    sid: str
    password: str


class BorrowRequest(BaseModel):
    c_no: str
    room: str


class ChangePasswordRequest(BaseModel):
    new_password: str


class EnrollRequest(BaseModel):
    c_no: str


class ForceReturnRequest(BaseModel):
    c_no: str  # c_no of the course currently occupying the room


class ReturnRequest(BaseModel):
    c_no: str


class MarkReadRequest(BaseModel):
    notif_id: Optional[int] = None  # None = mark all as read
