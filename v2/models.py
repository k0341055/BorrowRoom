from pydantic import BaseModel


class LoginRequest(BaseModel):
    sid: str
    password: str


class BorrowRequest(BaseModel):
    c_no: str
    room: str


class ChangePasswordRequest(BaseModel):
    new_password: str
