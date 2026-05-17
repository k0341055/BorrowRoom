// ── State ─────────────────────────────────────────────────────────────────────
let token = localStorage.getItem('token');
let currentUser = JSON.parse(localStorage.getItem('user') || 'null');

// ── API helper ────────────────────────────────────────────────────────────────
async function api(path, opts = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const res = await fetch('/api' + path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || '操作失敗，請稍後再試');
  return data;
}

// ── Toast ─────────────────────────────────────────────────────────────────────
let _toastTimer;
function toast(msg, type = 'error') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = [
    'fixed top-5 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium fade-in max-w-sm text-center',
    type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white',
  ].join(' ');
  el.classList.remove('hidden');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.add('hidden'), 4000);
}

// ── Section helpers ───────────────────────────────────────────────────────────
function showPage(page) {
  document.getElementById('loginSection').classList.toggle('hidden', page !== 'login');
  document.getElementById('dashboardSection').classList.toggle('hidden', page !== 'dashboard');
}

function toggleSection(sectionId, arrowId) {
  const el = document.getElementById(sectionId);
  el.classList.toggle('hidden');
  document.getElementById(arrowId).textContent = el.classList.contains('hidden') ? '▼' : '▲';
}

// ── Status card ───────────────────────────────────────────────────────────────
function renderStatus(borrow) {
  const el = document.getElementById('statusCard');
  if (borrow) {
    el.innerHTML = `
      <div class="flex items-center gap-3 bg-indigo-50 rounded-xl p-4">
        <span class="w-2.5 h-2.5 rounded-full bg-indigo-500 shrink-0"></span>
        <div>
          <p class="font-semibold text-indigo-700 text-sm">借用中</p>
          <p class="text-xs text-gray-500 mt-0.5">
            課程：${borrow.c_no}（${borrow.title}） &nbsp;｜&nbsp; 教室：<strong>${borrow.room}</strong>
          </p>
        </div>
      </div>`;
  } else {
    el.innerHTML = `
      <div class="flex items-center gap-3 bg-gray-50 rounded-xl p-4">
        <span class="w-2.5 h-2.5 rounded-full bg-gray-300 shrink-0"></span>
        <p class="text-gray-400 text-sm">目前沒有借用任何教室</p>
      </div>`;
  }
}

// ── My courses ────────────────────────────────────────────────────────────────
async function loadMyCourses() {
  try {
    const { courses } = await api('/courses/me');
    const el = document.getElementById('myCourses');
    if (!courses.length) {
      el.innerHTML = '<p class="text-gray-400 text-sm">無修課紀錄</p>';
      return;
    }
    el.innerHTML = `
      <div class="overflow-x-auto">
        <table class="w-full text-sm text-left">
          <thead>
            <tr class="border-b border-gray-100">
              <th class="pb-2 pr-4 text-xs text-gray-400 font-medium">課程編號</th>
              <th class="pb-2 pr-4 text-xs text-gray-400 font-medium">課程名稱</th>
              <th class="pb-2 pr-4 text-xs text-gray-400 font-medium">時間</th>
              <th class="pb-2 text-xs text-gray-400 font-medium">教室</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50">
            ${courses.map(c => `
              <tr class="hover:bg-gray-50 cursor-pointer" onclick="fillBorrowForm('${c.c_no}','${c.room}')">
                <td class="py-2 pr-4 font-mono text-indigo-600">${c.c_no}</td>
                <td class="py-2 pr-4">${c.title}</td>
                <td class="py-2 pr-4 text-gray-500">${c.time ? c.time.slice(0,5) : '-'}</td>
                <td class="py-2 font-semibold">${c.room}</td>
              </tr>`).join('')}
          </tbody>
        </table>
        <p class="text-xs text-gray-400 mt-2">點擊課程可自動填入借教室表單</p>
      </div>`;
  } catch (e) {
    document.getElementById('myCourses').innerHTML =
      '<p class="text-red-400 text-sm">載入失敗</p>';
  }
}

function fillBorrowForm(cno, room) {
  document.getElementById('cnoInput').value = cno;
  document.getElementById('roomInput').value = room;
  document.getElementById('cnoInput').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ── All borrows table ─────────────────────────────────────────────────────────
async function loadAllBorrows() {
  try {
    const { borrows } = await api('/borrows');
    const el = document.getElementById('allBorrows');
    if (!borrows.length) {
      el.innerHTML = '<p class="text-gray-400 text-sm">目前無任何借用紀錄</p>';
      return;
    }
    el.innerHTML = `
      <div class="overflow-x-auto">
        <table class="w-full text-sm text-left">
          <thead>
            <tr class="border-b border-gray-100">
              <th class="pb-2 pr-4 text-xs text-gray-400 font-medium">課程</th>
              <th class="pb-2 pr-4 text-xs text-gray-400 font-medium">課程名稱</th>
              <th class="pb-2 pr-4 text-xs text-gray-400 font-medium">教室</th>
              <th class="pb-2 pr-4 text-xs text-gray-400 font-medium">借用者</th>
              <th class="pb-2 text-xs text-gray-400 font-medium">學號</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50">
            ${borrows.map(b => `
              <tr class="hover:bg-gray-50 ${b.lend_sid === currentUser?.sid ? 'bg-indigo-50' : ''}">
                <td class="py-2 pr-4 font-mono text-indigo-600">${b.c_no}</td>
                <td class="py-2 pr-4 text-gray-600">${b.title}</td>
                <td class="py-2 pr-4 font-semibold">${b.room}</td>
                <td class="py-2 pr-4">${b.lend_name}</td>
                <td class="py-2 text-gray-500">${b.lend_sid}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  } catch (e) {
    document.getElementById('allBorrows').innerHTML =
      '<p class="text-red-400 text-sm">載入失敗</p>';
  }
}

// ── Dashboard init ────────────────────────────────────────────────────────────
async function loadDashboard() {
  document.getElementById('navUser').textContent =
    `${currentUser.name}（${currentUser.sid}）`;
  try {
    const { borrow } = await api('/borrow/me');
    renderStatus(borrow);
  } catch {
    renderStatus(null);
  }
  await Promise.all([loadMyCourses(), loadAllBorrows()]);
}

// ── Key modal ─────────────────────────────────────────────────────────────────
function showKeyModal(key) {
  document.getElementById('keyDisplay').textContent = key;
  document.getElementById('keyModal').classList.remove('hidden');
}
function closeKeyModal() {
  document.getElementById('keyModal').classList.add('hidden');
}

// ── Login ─────────────────────────────────────────────────────────────────────
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const sid = document.getElementById('sidInput').value.trim();
  const password = document.getElementById('passwordInput').value;
  if (!sid || !password) return;

  try {
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ sid, password }),
    });
    token = data.token;
    currentUser = { sid: data.sid, name: data.name };
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(currentUser));
    showPage('dashboard');
    await loadDashboard();
  } catch (e) {
    const alertEl = document.getElementById('loginAlert');
    alertEl.textContent = e.message;
    alertEl.className = 'mb-4 px-4 py-3 rounded-lg text-sm bg-red-50 text-red-600 border border-red-100';
    alertEl.classList.remove('hidden');
  }
});

// ── Borrow ────────────────────────────────────────────────────────────────────
document.getElementById('borrowForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const c_no = document.getElementById('cnoInput').value.trim();
  const room = document.getElementById('roomInput').value.trim();
  if (!c_no || !room) { toast('請填寫課程編號與教室'); return; }

  try {
    const data = await api('/borrow', {
      method: 'POST',
      body: JSON.stringify({ c_no, room }),
    });
    document.getElementById('cnoInput').value = '';
    document.getElementById('roomInput').value = '';
    showKeyModal(data.key);
    const { borrow } = await api('/borrow/me');
    renderStatus(borrow);
    await loadAllBorrows();
  } catch (e) {
    toast(e.message);
  }
});

// ── Return ────────────────────────────────────────────────────────────────────
async function handleReturn() {
  try {
    const data = await api('/return', { method: 'POST' });
    toast(data.message, 'success');
    renderStatus(null);
    await loadAllBorrows();
  } catch (e) {
    toast(e.message);
  }
}

// ── Logout ────────────────────────────────────────────────────────────────────
async function handleLogout() {
  try { await api('/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
  token = null;
  currentUser = null;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  showPage('login');
}

// ── Change password ───────────────────────────────────────────────────────────
async function handleChangePw() {
  const newPw = document.getElementById('newPwInput').value;
  if (!newPw.trim()) { toast('新密碼不得為空'); return; }
  try {
    const data = await api('/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ new_password: newPw }),
    });
    toast(data.message, 'success');
    setTimeout(handleLogout, 1800);
  } catch (e) {
    toast(e.message);
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
if (token && currentUser) {
  showPage('dashboard');
  loadDashboard();
} else {
  showPage('login');
}
