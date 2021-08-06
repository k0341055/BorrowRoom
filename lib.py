import sqlite3 as sql3
import pandas as pd
import time
import random
from IPython.core.interactiveshell import InteractiveShell
from IPython.display import display
def get_tbname(conn):
    cursor=conn.execute("select name from sqlite_master where type = 'table'")
    tables=[]
    for name in cursor.fetchall():
        tables.append(name[0])
    tables.remove(tables[0])
    return tables
def transDF(tb,conn):
    SQL="SELECT * FROM '%s'" %tb
    cursor=conn.execute(SQL)
    cols = [description[0] for description in cursor.description]
    tdf=pd.DataFrame(data=cursor.fetchall(),columns = cols)
    display(tdf[tdf.columns.tolist()[:-1]])
def return_room(student,conn):
    SQL="UPDATE borrows SET lend_sid='%s',lend_name='%s',lend_password='%s'\
    WHERE lend_sid='%s'" % ("null","null","null",student)
    conn.execute(SQL)
    conn.commit()
    print('教室已歸還成功，您可借其他教室')
def count_endt(student,conn):
    SQL="SELECT c_no,time,credits from courses WHERE c_no = \
    (SELECT c_no from borrows WHERE lend_sid='%s')" % student
    cursor=conn.execute(SQL)
    countt=cursor.fetchall()
    m=str(int(countt[0][1].split(':')[1])-10)
    if m == '0':
        m ='00'
    h=str(int(countt[0][0].split(':')[0])+int(countt[0][2]))
    endt=h+":"+m+":00"
    return endt
def auto_return(student,conn):
    endt=count_endt(student,conn)
    if time.strftime("%H:%M:%S", time.localtime())==endt:
        return_room(student,conn)
    else:
        print('預計課程結束時間：'+endt)
        print('還未到課程結束時間，未能自動歸還教室')
def get_accounts(conn):
    account = input('輸入帳號：')
    password = input('輸入密碼：')
    SQL="select * from students where sid='%s'and password='%s'" % (account,password)
    cursor=conn.execute(SQL)
    accounts=cursor.fetchall()
    return accounts
def get_lends(conn,account):
    SQL="select * from borrows where lend_sid = '%s'" % account
    cursor=conn.execute(SQL)
    lends=cursor.fetchall()
    return lends
def get_room_info(conn):
    cno=input('請輸入課程編號：')
    room=input('請輸入要借的教室：')
    SQL="select * from borrows where c_no='%s'and room='%s'" % (cno,room)
    cursor=conn.execute(SQL)
    lendr=cursor.fetchall()
    return lendr
def login(conn,state,accounts):
    if len(accounts)!=0:
        msg='登入成功'
        print(msg)
        revise=input('若要更改密碼，請輸入1，否則輸入其他數字：')
        if revise=='1':
            password=input('請輸入新密碼：')
            SQL="UPDATE students SET password='%s' WHERE sid='%s'" % (password,accounts[0][0])
            conn.execute(SQL)
            conn.commit()
            state=0
            print('請稍候重新登入')
            time.sleep(2)            
            return state
        logout=input('若要登出，請輸入2，否則輸入其他數字：')
        if logout=='2':
            state=2
            return state
        choice = input('若要借教室，請輸入1，否則為還教室')
        if choice == '1':
            print('\n'+'='*14+'即將進入借教室畫面'+'='*14)
            state=1
        else:
            print('\n'+'='*14+'即將進入還教室畫面'+'='*14)
            state=3
    else:
        msg='登入失敗，請稍候重新登入'
        print(msg)
        time.sleep(2)
        state=2
    return state
def borrow_part(conn,state,accounts):
    lendr=get_room_info(conn)
    if len(lendr)!=0:
        cno=lendr[0][0]
        room=lendr[0][2]
        lsid=lendr[0][3]
        lname=lendr[0][4]
        lpassword=lendr[0][5]
        SQL="select c_no from classes where sid = '%s'" % accounts[0][0]
        cursor=conn.execute(SQL)
        ccno=cursor.fetchall()
        lends=get_lends(conn,accounts[0][0])
        borrow_cond=(lsid=="null")&(lname=="null")&(lpassword=="null")&\
        ((cno,) in ccno)&(len(lends)==0)
        if borrow_cond :
            print('成功借到教室！')
            key=str(int(random.random()*1000000000))
            SQL="UPDATE borrows SET lend_sid='%s',lend_name='%s',lend_password='%s'\
            WHERE c_no='%s' AND room='%s'" % (accounts[0][0],accounts[0][1],key,cno,room)
            conn.execute(SQL)
            conn.commit()
            print('教室密碼為：'+ key)
            print('請保存該密碼，並盡快使用！\n稍後將自動登出')
            time.sleep(3)
            state=2
        else:
            print('借教室失敗！\n')
            if (cno,) not in ccno:
                print('您未修該門課，無法借到此教室！\n稍後將自動登出')
                time.sleep(3)
                state=2
                return state
            if not((lsid=="null")&(lname=="null")&(lpassword=="null")):
                if not(lsid==accounts[0][0]):
                    print('教室'+room+'已被學號：'+lsid+' 姓名：'+lname+' 同學借走')
                    SQL="SELECT phone from students where sid = '%s'" % (lsid)
                    cursor=conn.execute(SQL)
                    lphone=cursor.fetchone()
                    print('連絡電話為：'+lphone[0])
                    print('稍後將自動登出')
                else:
                    print('您已借過該教室，無法再借該教室\n稍後將自動登出')
                time.sleep(3)
                state=2
            else:
                lends=get_lends(conn,accounts[0][0])
                if len(lends)!=0:
                    print('您已借'+lends[0][2]+'教室')
                    print('請於課程結束前自行歸還，或待課程結束系統自動歸還該教室後，再借其他教室')
                    yn=input('若要歸還該教室，請輸入0，否則輸入其他數字，系統將自動判斷是否可歸還教室：')
                    if yn == '0' :
                        return_room(accounts[0][0],conn)
                        state=1
                    else:
                        auto_return(accounts[0][0],conn)
                        print('謝謝您使用本系統，待課程結束後您可借其他教室\n稍後將自動登出')
                        time.sleep(3)
                        state=2
    else:
        print('輸入錯誤，查無該教室或課程編號！')
        state=1
    return state
def return_part(conn,state,accounts):
    lends=get_lends(conn,accounts[0][0])
    if len(lends)!=0:
        print('您目前已借有： 課程編號 '+lends[0][0]+' 教室 '+lends[0][2])
        yn=input('若要歸還該教室，請輸入0，否則輸入其他數字：')
        if yn == '0' :
            return_room(accounts[0][0],conn)
            print('教室已歸還成功，您可借其他教室')
            y = input('若您要進入借教室畫面，請輸入1，否則將自動登出')
            if y == '1':
                print('='*14+'即將進入借教室畫面'+'='*14)
                state=1
            else:
                print('謝謝您使用本系統，稍後將自動登出')
                state=2
                time.sleep(3)
        else:
            print('謝謝您使用本系統，稍後將自動登出')
            state=2
            time.sleep(3)
    else:
        print('您目前沒有任何借教室紀錄，因此無法歸還教室')
        y = input('若您要進入借教室畫面，請輸入1，否則將自動登出')
        if y == '1':
            print('\n'+'='*14+'即將進入借教室畫面'+'='*14)
            state=1
        else:
            print('謝謝您使用本系統，稍後將自動登出')
            state=2
            time.sleep(3)
    return state
def logout():
    leave=input('若要重新登入，請輸入1，否則將開本系統：')
    if leave=='1':
        state=0
        enter_sys=True
    else:
        print('\n'+'='*12+'您將離開本系統，感謝使用'+'='*12)
        enter_sys=False
        state=4
    return enter_sys,state

def borrow_sys():
    state=0
    conn=sql3.connect("db.sqlite",timeout=30.0)
    enter_sys=True
    while enter_sys:
        if state==0:
            print('\n'+'*'*10+'歡迎來到高科線上借教室系統'+'*'*10)
            accounts = get_accounts(conn)
            state=login(conn,state,accounts)
        while state==1:
            state=borrow_part(conn,state,accounts)
        while state==3:
            state=return_part(conn,state,accounts)
        if state==2:
            enter_sys,state=logout()
    tbn=get_tbname(conn)
    print('\n'+'*'*8+'以下為所有教室資料變動後之結果：'+'*'*8)
    print('\ntable: ','borrows')
    transDF('borrows',conn)
    conn.close()