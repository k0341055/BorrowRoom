import sqlite3 as sql3
import pandas as pd
import time
import secrets
import os
from IPython.display import display

# State constants
STATE_LOGIN = 0
STATE_BORROW = 1
STATE_LOGOUT = 2
STATE_RETURN = 3
STATE_EXIT = 4

# Sentinel value for unoccupied borrow fields (stored as string in DB)
_EMPTY = "null"

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "db.sqlite")


def get_tbname(conn):
    cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = [name[0] for name in cursor.fetchall()]
    if tables:
        tables.pop(0)
    return tables


def transDF(tb, conn):
    # Table name comes from sqlite_master (not user input), safe to embed
    cursor = conn.execute(f"SELECT * FROM [{tb}]")
    cols = [description[0] for description in cursor.description]
    tdf = pd.DataFrame(data=cursor.fetchall(), columns=cols)
    display(tdf[tdf.columns.tolist()[:-1]])


def return_room(student, conn):
    conn.execute(
        "UPDATE borrows SET lend_sid=?, lend_name=?, lend_password=? WHERE lend_sid=?",
        (_EMPTY, _EMPTY, _EMPTY, student)
    )
    conn.commit()
    print('教室已歸還成功，您可借其他教室')


def count_endt(student, conn):
    cursor = conn.execute(
        "SELECT c_no, time, credits FROM courses WHERE c_no = (SELECT c_no FROM borrows WHERE lend_sid=?)",
        (student,)
    )
    countt = cursor.fetchall()
    m = str(int(countt[0][1].split(':')[1]) - 10).zfill(2)
    h = str(int(countt[0][0].split(':')[0]) + int(countt[0][2]))
    return h + ":" + m + ":00"


def auto_return(student, conn):
    endt = count_endt(student, conn)
    if time.strftime("%H:%M:%S", time.localtime()) == endt:
        return_room(student, conn)
    else:
        print('預計課程結束時間：' + endt)
        print('還未到課程結束時間，未能自動歸還教室')


def get_accounts(conn):
    account = input('輸入帳號：')
    password = input('輸入密碼：')
    cursor = conn.execute(
        "SELECT * FROM students WHERE sid=? AND password=?",
        (account, password)
    )
    return cursor.fetchall()


def get_lends(conn, account):
    cursor = conn.execute(
        "SELECT * FROM borrows WHERE lend_sid=?",
        (account,)
    )
    return cursor.fetchall()


def get_room_info(conn):
    cno = input('請輸入課程編號：')
    room = input('請輸入要借的教室：')
    cursor = conn.execute(
        "SELECT * FROM borrows WHERE c_no=? AND room=?",
        (cno, room)
    )
    return cursor.fetchall()


def login(conn, state, accounts):
    if accounts:
        print('登入成功')
        if input('若要更改密碼，請輸入1，否則輸入其他數字：') == '1':
            password = input('請輸入新密碼：')
            conn.execute(
                "UPDATE students SET password=? WHERE sid=?",
                (password, accounts[0][0])
            )
            conn.commit()
            print('請稍候重新登入')
            time.sleep(2)
            return STATE_LOGIN
        if input('若要登出，請輸入2，否則輸入其他數字：') == '2':
            return STATE_LOGOUT
        if input('若要借教室，請輸入1，否則為還教室') == '1':
            print('\n' + '='*14 + '即將進入借教室畫面' + '='*14)
            return STATE_BORROW
        else:
            print('\n' + '='*14 + '即將進入還教室畫面' + '='*14)
            return STATE_RETURN
    else:
        print('登入失敗，請稍候重新登入')
        time.sleep(2)
        return STATE_LOGOUT


def borrow_part(conn, state, accounts):
    lendr = get_room_info(conn)
    if not lendr:
        print('輸入錯誤，查無該教室或課程編號！')
        return STATE_BORROW

    cno = lendr[0][0]
    room = lendr[0][2]
    lsid = lendr[0][3]
    lname = lendr[0][4]
    lpassword = lendr[0][5]

    cursor = conn.execute("SELECT c_no FROM classes WHERE sid=?", (accounts[0][0],))
    ccno = cursor.fetchall()
    lends = get_lends(conn, accounts[0][0])

    is_available = (lsid == _EMPTY) and (lname == _EMPTY) and (lpassword == _EMPTY)
    is_enrolled = (cno,) in ccno
    has_no_borrow = len(lends) == 0

    if is_available and is_enrolled and has_no_borrow:
        key = secrets.token_hex(6)  # 12-char cryptographically secure hex key
        conn.execute(
            "UPDATE borrows SET lend_sid=?, lend_name=?, lend_password=? WHERE c_no=? AND room=?",
            (accounts[0][0], accounts[0][1], key, cno, room)
        )
        conn.commit()
        print('成功借到教室！')
        print('教室密碼為：' + key)
        print('請保存該密碼，並盡快使用！\n稍後將自動登出')
        time.sleep(3)
        return STATE_LOGOUT

    print('借教室失敗！\n')

    if not is_enrolled:
        print('您未修該門課，無法借到此教室！\n稍後將自動登出')
        time.sleep(3)
        return STATE_LOGOUT

    if not is_available:
        if lsid != accounts[0][0]:
            print(f'教室{room}已被學號：{lsid} 姓名：{lname} 同學借走')
            cursor = conn.execute("SELECT phone FROM students WHERE sid=?", (lsid,))
            lphone = cursor.fetchone()
            print('連絡電話為：' + lphone[0])
            print('稍後將自動登出')
        else:
            print('您已借過該教室，無法再借該教室\n稍後將自動登出')
        time.sleep(3)
        return STATE_LOGOUT

    # Room is available but student already has a borrow
    lends = get_lends(conn, accounts[0][0])
    if lends:
        print('您已借' + lends[0][2] + '教室')
        print('請於課程結束前自行歸還，或待課程結束系統自動歸還該教室後，再借其他教室')
        if input('若要歸還該教室，請輸入0，否則輸入其他數字，系統將自動判斷是否可歸還教室：') == '0':
            return_room(accounts[0][0], conn)
            return STATE_BORROW
        else:
            auto_return(accounts[0][0], conn)
            print('謝謝您使用本系統，待課程結束後您可借其他教室\n稍後將自動登出')
            time.sleep(3)
            return STATE_LOGOUT

    return STATE_LOGOUT


def return_part(conn, state, accounts):
    lends = get_lends(conn, accounts[0][0])
    if lends:
        print('您目前已借有： 課程編號 ' + lends[0][0] + ' 教室 ' + lends[0][2])
        if input('若要歸還該教室，請輸入0，否則輸入其他數字：') == '0':
            return_room(accounts[0][0], conn)
            # return_room already prints success message
            if input('若您要進入借教室畫面，請輸入1，否則將自動登出') == '1':
                print('='*14 + '即將進入借教室畫面' + '='*14)
                return STATE_BORROW
            else:
                print('謝謝您使用本系統，稍後將自動登出')
                time.sleep(3)
                return STATE_LOGOUT
        else:
            print('謝謝您使用本系統，稍後將自動登出')
            time.sleep(3)
            return STATE_LOGOUT
    else:
        print('您目前沒有任何借教室紀錄，因此無法歸還教室')
        if input('若您要進入借教室畫面，請輸入1，否則將自動登出') == '1':
            print('\n' + '='*14 + '即將進入借教室畫面' + '='*14)
            return STATE_BORROW
        else:
            print('謝謝您使用本系統，稍後將自動登出')
            time.sleep(3)
            return STATE_LOGOUT


def logout():
    if input('若要重新登入，請輸入1，否則將離開本系統：') == '1':
        return True, STATE_LOGIN
    print('\n' + '='*12 + '您將離開本系統，感謝使用' + '='*12)
    return False, STATE_EXIT


def borrow_sys():
    conn = sql3.connect(DB_PATH, timeout=30.0)
    try:
        state = STATE_LOGIN
        enter_sys = True
        accounts = []
        while enter_sys:
            if state == STATE_LOGIN:
                print('\n' + '*'*10 + '歡迎來到高科線上借教室系統' + '*'*10)
                accounts = get_accounts(conn)
                state = login(conn, state, accounts)
            while state == STATE_BORROW:
                state = borrow_part(conn, state, accounts)
            while state == STATE_RETURN:
                state = return_part(conn, state, accounts)
            if state == STATE_LOGOUT:
                enter_sys, state = logout()
        print('\n' + '*'*8 + '以下為所有教室資料變動後之結果：' + '*'*8)
        print('\ntable: ', 'borrows')
        transDF('borrows', conn)
    finally:
        conn.close()
