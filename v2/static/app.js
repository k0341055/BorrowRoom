// ── State ─────────────────────────────────────────────────────────────────────
let token = localStorage.getItem('token');
let currentUser = JSON.parse(localStorage.getItem('user') || 'null');
let notifPollTimer = null;

// ── API ───────────────────────────────────────────────────────────────────────
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
    'fixed top-16 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium fade-in max-w-xs text-center pointer-events-none',
    type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white',
  ].join(' ');
  el.classList.remove('hidden');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.add('hidden'), 4000);
}

// ── Tab switching ─────────────────────────────────────────────────────────────
const TABS = ['status', 'enroll', 'borrow', 'gantt', 'settings'];
function switchTab(name) {
  TABS.forEach(t => {
    document.getElementById('page-' + t).classList.toggle('hidden', t !== name);
    document.getElementById('tab-' + t).classList.toggle('active', t === name);
  });
  window.location.hash = name;
  if (name === 'status')   { loadStatus(); loadMyRoomBorrows(); }
  if (name === 'enroll')   { loadMyCourses(); loadAvailableCourses(); }
  if (name === 'borrow')   { loadBorrowQuickList(); }
  if (name === 'gantt')    { loadGanttSelect(); }
}

function showPage(page) {
  document.getElementById('loginSection').classList.toggle('hidden', page !== 'login');
  document.getElementById('dashboardSection').classList.toggle('hidden', page !== 'dashboard');
}

// ── Status tab ────────────────────────────────────────────────────────────────
async function loadStatus() {
  try {
    const { borrow } = await api('/borrow/me');
    renderStatusCard(borrow);
  } catch { renderStatusCard(null); }
}

function renderStatusCard(borrow) {
  const card = document.getElementById('statusCard');
  const btn  = document.getElementById('returnBtnWrap');
  if (borrow) {
    card.innerHTML = `
      <div class="flex items-center gap-3 bg-indigo-50 rounded-xl p-4">
        <span class="w-2.5 h-2.5 rounded-full bg-indigo-500 shrink-0"></span>
        <div>
          <p class="font-semibold text-indigo-700 text-sm">借用中</p>
          <p class="text-xs text-gray-500 mt-0.5">
            課程：${borrow.c_no}（${borrow.title}）&nbsp;｜&nbsp; 教室：<strong>${borrow.room}</strong>
          </p>
        </div>
      </div>`;
    btn.classList.remove('hidden');
  } else {
    card.innerHTML = `
      <div class="flex items-center gap-3 bg-gray-50 rounded-xl p-4">
        <span class="w-2.5 h-2.5 rounded-full bg-gray-300 shrink-0"></span>
        <p class="text-gray-400 text-sm">目前沒有借用任何教室</p>
      </div>`;
    btn.classList.add('hidden');
  }
}

async function loadMyRoomBorrows() {
  const el = document.getElementById('myRoomBorrows');
  try {
    const { borrows } = await api('/borrows/my-rooms');
    if (!borrows.length) {
      el.innerHTML = '<p class="text-gray-400 text-sm">修課的教室目前無人借用</p>';
      return;
    }
    el.innerHTML = `
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead><tr class="border-b border-gray-100">
            <th class="pb-2 pr-3 text-left text-xs text-gray-400 font-medium">教室</th>
            <th class="pb-2 pr-3 text-left text-xs text-gray-400 font-medium">課程</th>
            <th class="pb-2 pr-3 text-left text-xs text-gray-400 font-medium">上課時段</th>
            <th class="pb-2 pr-3 text-left text-xs text-gray-400 font-medium">借用者</th>
            <th class="pb-2 text-left text-xs text-gray-400 font-medium">學號</th>
          </tr></thead>
          <tbody class="divide-y divide-gray-50">
            ${borrows.map(b => `
              <tr class="${b.lend_sid === currentUser?.sid ? 'bg-indigo-50' : 'hover:bg-gray-50'}">
                <td class="py-2 pr-3 font-semibold text-indigo-600">${b.room}</td>
                <td class="py-2 pr-3 text-gray-700">${b.title}</td>
                <td class="py-2 pr-3 text-gray-500">${formatTimeRange(b.time, b.credits)}</td>
                <td class="py-2 pr-3">${b.lend_name}</td>
                <td class="py-2 text-gray-400 text-xs">${b.lend_sid}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  } catch {
    el.innerHTML = '<p class="text-red-400 text-sm">載入失敗</p>';
  }
}

// ── Enroll tab ────────────────────────────────────────────────────────────────
async function loadMyCourses() {
  const el = document.getElementById('myCourses');
  try {
    const { courses } = await api('/courses/me');
    if (!courses.length) { el.innerHTML = '<p class="text-gray-400 text-sm">尚未選課</p>'; return; }
    el.innerHTML = courseTable(courses, true);
  } catch { el.innerHTML = '<p class="text-red-400 text-sm">載入失敗</p>'; }
}

async function loadAvailableCourses() {
  const el = document.getElementById('availCourses');
  try {
    const { courses } = await api('/courses/available');
    if (!courses.length) { el.innerHTML = '<p class="text-gray-400 text-sm">無可加選課程</p>'; return; }
    el.innerHTML = courseTable(courses, false);
  } catch { el.innerHTML = '<p class="text-red-400 text-sm">載入失敗</p>'; }
}

function courseTable(courses, enrolled) {
  return `
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead><tr class="border-b border-gray-100">
          <th class="pb-2 pr-3 text-left text-xs text-gray-400 font-medium">課號</th>
          <th class="pb-2 pr-3 text-left text-xs text-gray-400 font-medium">課程名稱</th>
          <th class="pb-2 pr-3 text-left text-xs text-gray-400 font-medium">時段</th>
          <th class="pb-2 pr-3 text-left text-xs text-gray-400 font-medium">教室</th>
          <th class="pb-2 pr-3 text-left text-xs text-gray-400 font-medium">學分</th>
          <th class="pb-2"></th>
        </tr></thead>
        <tbody class="divide-y divide-gray-50">
          ${courses.map(c => `
            <tr class="hover:bg-gray-50">
              <td class="py-2 pr-3 font-mono text-indigo-600">${c.c_no}</td>
              <td class="py-2 pr-3">${c.title}</td>
              <td class="py-2 pr-3 text-gray-500 text-xs">${formatTimeRange(c.time, c.credits)}</td>
              <td class="py-2 pr-3 font-semibold">${c.room}</td>
              <td class="py-2 pr-3 text-center">${c.credits}</td>
              <td class="py-2">
                ${enrolled
                  ? `<button onclick="handleDrop('${c.c_no}')"
                       class="text-xs bg-red-50 hover:bg-red-100 text-red-500 px-2 py-1 rounded-lg transition">退選</button>`
                  : `<button onclick="handleEnroll('${c.c_no}')"
                       class="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-600 px-2 py-1 rounded-lg transition">加選</button>`
                }
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

async function handleEnroll(c_no) {
  try {
    await api('/enroll', { method: 'POST', body: JSON.stringify({ c_no }) });
    toast('選課成功', 'success');
    await Promise.all([loadMyCourses(), loadAvailableCourses()]);
    loadGanttSelect();
  } catch (e) { toast(e.message); }
}

async function handleDrop(c_no) {
  if (!confirm('確定要退選此課程？')) return;
  try {
    await api('/enroll/' + c_no, { method: 'DELETE' });
    toast('退選成功', 'success');
    await Promise.all([loadMyCourses(), loadAvailableCourses()]);
    loadGanttSelect();
  } catch (e) { toast(e.message); }
}

// ── Borrow tab ────────────────────────────────────────────────────────────────
async function loadBorrowQuickList() {
  const el = document.getElementById('borrowQuickList');
  try {
    const { courses } = await api('/courses/me');
    if (!courses.length) { el.innerHTML = ''; return; }
    el.innerHTML = `<div class="flex flex-wrap gap-2">
      ${courses.map(c =>
        `<button onclick="fillBorrowForm('${c.c_no}','${c.room}')"
           class="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-lg transition font-mono">
           ${c.c_no} ${c.room}
         </button>`
      ).join('')}
    </div>`;
  } catch { el.innerHTML = ''; }
}

function fillBorrowForm(cno, room) {
  document.getElementById('cnoInput').value = cno;
  document.getElementById('roomInput').value = room;
}

document.getElementById('borrowForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const c_no = document.getElementById('cnoInput').value.trim();
  const room = document.getElementById('roomInput').value.trim();
  if (!c_no || !room) { toast('請填寫課程編號與教室'); return; }
  try {
    const data = await api('/borrow', { method: 'POST', body: JSON.stringify({ c_no, room }) });
    document.getElementById('cnoInput').value = '';
    document.getElementById('roomInput').value = '';
    showKeyModal(data.key);
    loadStatus();
    loadMyRoomBorrows();
  } catch (e) { toast(e.message); }
});

// ── Return ────────────────────────────────────────────────────────────────────
async function handleReturn() {
  if (!confirm('確定要歸還教室？')) return;
  try {
    const data = await api('/return', { method: 'POST' });
    toast(data.message, 'success');
    loadStatus();
    loadMyRoomBorrows();
  } catch (e) { toast(e.message); }
}

// ── Gantt tab ─────────────────────────────────────────────────────────────────
const GANTT_START_MIN = 8 * 60;   // 08:00 = 480 min
const GANTT_END_MIN   = 21 * 60;  // 21:00 = 1260 min
const GANTT_RANGE     = GANTT_END_MIN - GANTT_START_MIN; // 780 min

function timeStrToMin(t) {
  const parts = t.split(':').map(Number);
  return parts[0] * 60 + parts[1];
}

function minToTimeStr(min) {
  const h = Math.floor(min / 60).toString().padStart(2, '0');
  const m = (min % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

function courseEndMin(timeStr, credits) {
  return timeStrToMin(timeStr) + credits * 60 - 10;
}

function leftPct(timeStr)     { return ((timeStrToMin(timeStr) - GANTT_START_MIN) / GANTT_RANGE * 100).toFixed(2); }
function widthPct(timeStr, credits) {
  const dur = credits * 60 - 10;
  return (dur / GANTT_RANGE * 100).toFixed(2);
}

async function loadGanttSelect() {
  const sel = document.getElementById('ganttCourseSelect');
  try {
    const { courses } = await api('/courses/me');
    sel.innerHTML = '<option value="">— 請選擇課程 —</option>' +
      courses.map(c =>
        `<option value="${c.room}" data-cno="${c.c_no}">
           ${c.c_no} ${c.title}（${c.room}）${formatTimeRange(c.time, c.credits)}
         </option>`
      ).join('');
  } catch {}
}

async function loadGantt() {
  const sel  = document.getElementById('ganttCourseSelect');
  const room = sel.value;
  if (!room) { toast('請先選擇課程'); return; }

  const wrap = document.getElementById('ganttWrap');
  wrap.innerHTML = '<div class="h-10 bg-gray-100 rounded-xl animate-pulse"></div>';
  document.getElementById('ganttDetail').classList.add('hidden');

  try {
    const { schedule } = await api(`/rooms/${room}/schedule`);
    renderGantt(room, schedule);
  } catch (e) {
    wrap.innerHTML = `<p class="text-red-400 text-sm">${e.message}</p>`;
  }
}

function renderGantt(room, schedule) {
  const wrap = document.getElementById('ganttWrap');

  // Build hour-tick ruler (08:00 – 21:00, 13 ticks)
  const hours = [];
  for (let h = 8; h <= 21; h++) hours.push(h);
  const ticksHtml = hours.map(h => {
    const left = ((h * 60 - GANTT_START_MIN) / GANTT_RANGE * 100).toFixed(2);
    return `<div class="absolute top-0 bottom-0 border-l border-gray-200" style="left:${left}%">
              <span class="absolute -top-5 -translate-x-1/2 text-[10px] text-gray-400">${h}:00</span>
            </div>`;
  }).join('');

  // Build bars
  const barsHtml = schedule.map((c, idx) => {
    const lsid = c.lend_sid;
    const isMe = lsid === currentUser?.sid;
    const occupied = lsid !== 'null';

    let colorCls, label, titleHint;
    if (!occupied) {
      colorCls = 'bg-emerald-200 text-emerald-800 border border-emerald-300';
      label = c.title;
      titleHint = `${c.title} — 空閒`;
    } else if (isMe) {
      colorCls = 'bg-indigo-400 text-white border border-indigo-500';
      label = '📌 ' + c.title;
      titleHint = `${c.title} — 我借用中`;
    } else if (c.can_force_return) {
      colorCls = 'bg-rose-300 text-rose-900 border border-rose-400';
      label = '⚠ ' + c.title;
      titleHint = `${c.title} — ${c.lend_name} 借用中（可強制歸還）`;
    } else {
      colorCls = 'bg-amber-200 text-amber-900 border border-amber-300';
      label = c.title;
      titleHint = `${c.title} — ${c.lend_name} 借用中`;
    }

    const endMin = courseEndMin(c.time, c.credits);
    const timeRange = `${c.time.slice(0,5)} – ${minToTimeStr(endMin)}`;

    return `
      <div class="gantt-bar ${colorCls}"
           style="left:${leftPct(c.time)}%;width:${widthPct(c.time, c.credits)}%"
           title="${titleHint}"
           onclick="showGanttDetail(${idx})">
        <span class="truncate text-[11px]">${label}</span>
        ${c.can_force_return
          ? `<button onclick="event.stopPropagation();handleForceReturn('${c.c_no}','${c.room}')"
               class="ml-1 shrink-0 bg-rose-600 hover:bg-rose-700 text-white text-[10px] px-1.5 py-0.5 rounded font-semibold">
               強制歸還
             </button>`
          : ''}
      </div>`;
  }).join('');

  // Store schedule for detail panel
  window._ganttSchedule = schedule;

  wrap.innerHTML = `
    <div class="min-w-[600px]">
      <p class="text-xs font-semibold text-gray-500 mb-6">教室：${room}</p>
      <!-- Time ruler -->
      <div class="relative h-5 mb-1">${ticksHtml}</div>
      <!-- Bars container -->
      <div class="relative h-10 bg-gray-50 rounded-lg border border-gray-200">
        ${barsHtml}
      </div>
      <!-- Bottom labels -->
      <div class="relative h-5 mt-1">
        ${schedule.map(c => `
          <div class="absolute text-[9px] text-gray-400 -translate-x-1/2"
               style="left:calc(${leftPct(c.time)}% + ${widthPct(c.time,c.credits)/2}%)">
            ${c.room}
          </div>`).join('')}
      </div>
    </div>`;
}

function showGanttDetail(idx) {
  const c = window._ganttSchedule?.[idx];
  if (!c) return;
  const panel = document.getElementById('ganttDetail');
  const endMin = courseEndMin(c.time, c.credits);
  const occupied = c.lend_sid !== 'null';
  panel.classList.remove('hidden');
  panel.innerHTML = `
    <p class="font-semibold text-gray-700">${c.title} <span class="font-mono text-indigo-500 text-xs">${c.c_no}</span></p>
    <p class="text-gray-500 text-xs">教室：${c.room} &nbsp;｜&nbsp; 時段：${c.time.slice(0,5)} – ${minToTimeStr(endMin)} &nbsp;｜&nbsp; 學分：${c.credits}</p>
    ${occupied
      ? `<p class="text-xs mt-1">借用者：<strong>${c.lend_name}</strong>（${c.lend_sid}）</p>
         ${c.can_force_return
           ? `<p class="text-xs text-rose-600 mt-1">⚠ 您的課程將接續此教室，可強制歸還</p>
              <button onclick="handleForceReturn('${c.c_no}','${c.room}')"
                class="mt-2 bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg">
                強制歸還此教室
              </button>`
           : ''}`
      : `<p class="text-xs text-emerald-600 mt-1">✓ 此教室目前空閒</p>`
    }`;
}

async function handleForceReturn(c_no, room) {
  if (!confirm(`確定要強制歸還「${room}」？原借用者將收到系統通知。`)) return;
  try {
    const data = await api('/borrow/force-return', { method: 'POST', body: JSON.stringify({ c_no }) });
    toast(data.message, 'success');
    loadGantt();
    loadMyRoomBorrows();
    document.getElementById('ganttDetail').classList.add('hidden');
  } catch (e) { toast(e.message); }
}

// ── Settings ──────────────────────────────────────────────────────────────────
async function handleChangePw() {
  const newPw = document.getElementById('newPwInput').value;
  if (!newPw.trim()) { toast('新密碼不得為空'); return; }
  try {
    const data = await api('/auth/password', { method: 'PUT', body: JSON.stringify({ new_password: newPw }) });
    toast(data.message, 'success');
    setTimeout(handleLogout, 1800);
  } catch (e) { toast(e.message); }
}

// ── Key modal ─────────────────────────────────────────────────────────────────
function showKeyModal(key) {
  document.getElementById('keyDisplay').textContent = key;
  document.getElementById('keyModal').classList.remove('hidden');
}
function closeKeyModal() {
  document.getElementById('keyModal').classList.add('hidden');
}

// ── Notifications ─────────────────────────────────────────────────────────────
function toggleNotifDrawer() {
  const drawer  = document.getElementById('notifDrawer');
  const overlay = document.getElementById('notifOverlay');
  const isOpen  = drawer.classList.contains('open');
  drawer.classList.toggle('open', !isOpen);
  overlay.classList.toggle('hidden', isOpen);
  if (!isOpen) loadNotifications();
}

async function loadNotifications() {
  const el = document.getElementById('notifList');
  try {
    const { notifications, unread } = await api('/notifications');
    updateNotifBadge(unread);
    if (!notifications.length) {
      el.innerHTML = '<p class="text-gray-400 text-sm text-center mt-8">沒有通知</p>';
      return;
    }
    el.innerHTML = notifications.map(n => `
      <div class="rounded-xl p-3 text-sm ${n.is_read ? 'bg-gray-50' : 'bg-indigo-50 border border-indigo-100'} cursor-pointer"
           onclick="markOneRead(${n.id}, this)">
        <p class="${n.is_read ? 'text-gray-600' : 'text-gray-800 font-medium'}">${n.message}</p>
        <p class="text-[10px] text-gray-400 mt-1">${n.created_at}</p>
      </div>`).join('');
  } catch {
    el.innerHTML = '<p class="text-red-400 text-sm text-center">載入失敗</p>';
  }
}

async function markOneRead(id, el) {
  try {
    await api('/notifications/read', { method: 'POST', body: JSON.stringify({ notif_id: id }) });
    el.classList.remove('bg-indigo-50', 'border', 'border-indigo-100');
    el.classList.add('bg-gray-50');
    el.querySelector('p').classList.remove('font-medium');
    pollNotifications();
  } catch {}
}

async function markAllRead() {
  try {
    await api('/notifications/read', { method: 'POST', body: JSON.stringify({}) });
    loadNotifications();
  } catch {}
}

function updateNotifBadge(unread) {
  const badge = document.getElementById('notifBadge');
  if (unread > 0) {
    badge.textContent = unread > 9 ? '9+' : unread;
    badge.classList.remove('hidden');
    badge.classList.add('flex');
  } else {
    badge.classList.add('hidden');
    badge.classList.remove('flex');
  }
}

async function pollNotifications() {
  try {
    const { unread } = await api('/notifications');
    updateNotifBadge(unread);
  } catch {}
}

// ── Auth ──────────────────────────────────────────────────────────────────────
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const sid      = document.getElementById('sidInput').value.trim();
  const password = document.getElementById('passwordInput').value;
  if (!sid || !password) return;
  const alertEl = document.getElementById('loginAlert');
  alertEl.classList.add('hidden');
  try {
    const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ sid, password }) });
    token       = data.token;
    currentUser = { sid: data.sid, name: data.name };
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(currentUser));
    showPage('dashboard');
    initDashboard();
  } catch (e) {
    alertEl.textContent = e.message;
    alertEl.classList.remove('hidden');
  }
});

async function handleLogout() {
  clearInterval(notifPollTimer);
  try { await api('/auth/logout', { method: 'POST' }); } catch {}
  token = null; currentUser = null;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  showPage('login');
}

// ── Dashboard init ────────────────────────────────────────────────────────────
function initDashboard() {
  document.getElementById('navUser').textContent = `${currentUser.name}（${currentUser.sid}）`;
  const hash = window.location.hash.replace('#', '') || 'status';
  switchTab(TABS.includes(hash) ? hash : 'status');
  pollNotifications();
  clearInterval(notifPollTimer);
  notifPollTimer = setInterval(pollNotifications, 30000);
}

// ── Utility ───────────────────────────────────────────────────────────────────
function formatTimeRange(timeStr, credits) {
  if (!timeStr) return '-';
  const start = timeStr.slice(0, 5);
  const startMin = timeStrToMin(timeStr);
  const endMin = startMin + credits * 60 - 10;
  return `${start}–${minToTimeStr(endMin)}`;
}

// ── Init ──────────────────────────────────────────────────────────────────────
window.addEventListener('hashchange', () => {
  const name = window.location.hash.replace('#', '');
  if (TABS.includes(name)) switchTab(name);
});

if (token && currentUser) {
  showPage('dashboard');
  initDashboard();
} else {
  showPage('login');
}
