// ── Constants ──────────────────────────────────────────────────────────────────
const PX_HOUR     = 64;
const TT_START    = 8 * 60;   // 08:00 in minutes
const TT_HOURS    = 13;       // rows 08:00–20:00
const GANTT_START = 8 * 60;
const GANTT_END   = 21 * 60;
const GANTT_RANGE = GANTT_END - GANTT_START; // 780 min
const DAYS        = ['週一', '週二', '週三', '週四', '週五'];

// ── State ──────────────────────────────────────────────────────────────────────
let token          = localStorage.getItem('token');
let currentUser    = JSON.parse(localStorage.getItem('user') || 'null');
let notifPollTimer = null;
let _countdownTimer = null;
let _myCourses     = [];   // cached enrolled courses for credits lookup

// ── Dark mode ──────────────────────────────────────────────────────────────────
const MOON_PATH = `<path stroke-linecap="round" stroke-linejoin="round"
  d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75
     0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21
     12.75 21a9.753 9.753 0 009.002-5.998z"/>`;
const SUN_PATH = `<path stroke-linecap="round" stroke-linejoin="round"
  d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591
     M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636
     5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z"/>`;

function updateThemeIcons(isDark) {
  ['themeIcon', 'loginThemeIcon'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = isDark ? SUN_PATH : MOON_PATH;
  });
}

function toggleDark() {
  const isDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  updateThemeIcons(isDark);
}

(function initTheme() {
  const saved = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = saved ? saved === 'dark' : prefersDark;
  if (isDark) document.documentElement.classList.add('dark');
  updateThemeIcons(isDark);
})();

// ── API ────────────────────────────────────────────────────────────────────────
async function api(path, opts = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const res  = await fetch('/api' + path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || '操作失敗，請稍後再試');
  return data;
}

// ── Toast ──────────────────────────────────────────────────────────────────────
let _toastTimer;
function toast(msg, type = 'error') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = [
    'fixed top-20 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl shadow-xl text-sm',
    'font-medium fade-in max-w-xs text-center pointer-events-none',
    type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white',
  ].join(' ');
  el.classList.remove('hidden');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.add('hidden'), 4000);
}

// ── Page helpers ───────────────────────────────────────────────────────────────
function showPage(page) {
  document.getElementById('loginSection').classList.toggle('hidden', page !== 'login');
  document.getElementById('dashboardSection').classList.toggle('hidden', page !== 'dashboard');
}

// ── Utilities ──────────────────────────────────────────────────────────────────
function timeStrToMin(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function minToTimeStr(min) {
  return `${String(Math.floor(min / 60)).padStart(2,'0')}:${String(min % 60).padStart(2,'0')}`;
}
function formatTimeRange(timeStr, credits) {
  if (!timeStr) return '-';
  const start = timeStrToMin(timeStr);
  return `${timeStr.slice(0,5)}–${minToTimeStr(start + credits * 60 - 10)}`;
}
function weekdayLabel(n) {
  return DAYS[n - 1] || '-';
}
function leftPct(timeStr) {
  return ((timeStrToMin(timeStr) - GANTT_START) / GANTT_RANGE * 100).toFixed(2);
}
function widthPct(timeStr, credits) {
  return ((credits * 60 - 10) / GANTT_RANGE * 100).toFixed(2);
}
function roomColorClass(room) {
  const map = { E117:'room-E117', E118:'room-E118', E211:'room-E211',
                E212:'room-E212', B301:'room-B301', D202:'room-D202', C401:'room-C401' };
  return map[room] || 'room-other';
}

// ── Tab switching ──────────────────────────────────────────────────────────────
const TABS = ['status', 'enroll', 'borrow', 'timetable', 'settings'];

function switchTab(name) {
  TABS.forEach(t => {
    document.getElementById('page-' + t).classList.toggle('hidden', t !== name);
    document.getElementById('tab-' + t).classList.toggle('active', t === name);
  });
  window.location.hash = name;
  if (name === 'status')    { loadStatus(); loadMyRoomBorrows(); }
  if (name === 'enroll')    { loadMyCourses(); loadAvailableCourses(); }
  if (name === 'borrow')    { loadBorrowCards(); }
  if (name === 'timetable') { loadTimetable(); }
}

// ── Status tab ─────────────────────────────────────────────────────────────────
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
      <div class="flex items-center gap-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl p-4
                  border border-indigo-100 dark:border-indigo-800/50">
        <span class="w-2.5 h-2.5 rounded-full bg-indigo-500 shrink-0 animate-pulse"></span>
        <div>
          <p class="font-semibold text-indigo-700 dark:text-indigo-300 text-sm">借用中</p>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            課程：${borrow.c_no}（${borrow.title}）&nbsp;｜&nbsp;
            教室：<strong>${borrow.room}</strong>&nbsp;｜&nbsp;${formatTimeRange(borrow.time, borrow.credits)}
          </p>
        </div>
      </div>`;
    btn.classList.remove('hidden');
  } else {
    card.innerHTML = `
      <div class="flex items-center gap-3 bg-slate-50 dark:bg-slate-700/40 rounded-xl p-4">
        <span class="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-500 shrink-0"></span>
        <p class="text-slate-400 dark:text-slate-500 text-sm">目前沒有借用任何教室</p>
      </div>`;
    btn.classList.add('hidden');
  }
}

async function loadMyRoomBorrows() {
  const el = document.getElementById('myRoomBorrows');
  try {
    const { borrows } = await api('/borrows/my-rooms');
    if (!borrows.length) {
      el.innerHTML = '<p class="text-slate-400 dark:text-slate-500 text-sm">修課的教室目前無人借用</p>';
      return;
    }
    el.innerHTML = `
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead><tr class="border-b border-slate-100 dark:border-slate-700">
            <th class="pb-2 pr-3 text-left text-xs text-slate-400 font-medium">教室</th>
            <th class="pb-2 pr-3 text-left text-xs text-slate-400 font-medium">課程</th>
            <th class="pb-2 pr-3 text-left text-xs text-slate-400 font-medium">上課時段</th>
            <th class="pb-2 pr-3 text-left text-xs text-slate-400 font-medium">借用者</th>
            <th class="pb-2 text-left text-xs text-slate-400 font-medium">學號</th>
          </tr></thead>
          <tbody class="divide-y divide-slate-50 dark:divide-slate-700/50">
            ${borrows.map(b => `
              <tr class="${b.lend_sid === currentUser?.sid
                ? 'bg-indigo-50 dark:bg-indigo-900/20'
                : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'}">
                <td class="py-2 pr-3 font-semibold text-indigo-600 dark:text-indigo-400">${b.room}</td>
                <td class="py-2 pr-3 dark:text-slate-200">${b.title}</td>
                <td class="py-2 pr-3 text-slate-500 dark:text-slate-400 text-xs">${formatTimeRange(b.time, b.credits)}</td>
                <td class="py-2 pr-3 dark:text-slate-200">${b.lend_name}</td>
                <td class="py-2 text-slate-400 text-xs">${b.lend_sid}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  } catch {
    el.innerHTML = '<p class="text-red-400 text-sm">載入失敗</p>';
  }
}

// ── Enroll tab ─────────────────────────────────────────────────────────────────
async function loadMyCourses() {
  const el = document.getElementById('myCourses');
  try {
    const { courses } = await api('/courses/me');
    _myCourses = courses;
    if (!courses.length) {
      el.innerHTML = '<p class="text-slate-400 dark:text-slate-500 text-sm">尚未選課</p>';
      return;
    }
    el.innerHTML = courseTable(courses, true);
  } catch { el.innerHTML = '<p class="text-red-400 text-sm">載入失敗</p>'; }
}

async function loadAvailableCourses() {
  const el = document.getElementById('availCourses');
  try {
    const { courses } = await api('/courses/available');
    if (!courses.length) {
      el.innerHTML = '<p class="text-slate-400 dark:text-slate-500 text-sm">無可加選課程</p>';
      return;
    }
    el.innerHTML = courseTable(courses, false);
  } catch { el.innerHTML = '<p class="text-red-400 text-sm">載入失敗</p>'; }
}

function courseTable(courses, enrolled) {
  return `
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead><tr class="border-b border-slate-100 dark:border-slate-700">
          <th class="pb-2 pr-2 text-left text-xs text-slate-400 font-medium">課號</th>
          <th class="pb-2 pr-2 text-left text-xs text-slate-400 font-medium">課程名稱</th>
          <th class="pb-2 pr-2 text-left text-xs text-slate-400 font-medium">星期</th>
          <th class="pb-2 pr-2 text-left text-xs text-slate-400 font-medium">時段</th>
          <th class="pb-2 pr-2 text-left text-xs text-slate-400 font-medium">教室</th>
          <th class="pb-2 pr-2 text-left text-xs text-slate-400 font-medium">學分</th>
          <th class="pb-2"></th>
        </tr></thead>
        <tbody class="divide-y divide-slate-50 dark:divide-slate-700/50">
          ${courses.map(c => `
            <tr class="hover:bg-slate-50 dark:hover:bg-slate-700/30">
              <td class="py-2 pr-2 font-mono text-indigo-600 dark:text-indigo-400 text-xs">${c.c_no}</td>
              <td class="py-2 pr-2 dark:text-slate-200 whitespace-nowrap">${c.title}</td>
              <td class="py-2 pr-2 text-xs font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">${weekdayLabel(c.weekday)}</td>
              <td class="py-2 pr-2 text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">${formatTimeRange(c.time, c.credits)}</td>
              <td class="py-2 pr-2">
                <span class="inline-block px-1.5 py-0.5 rounded text-xs font-semibold ${roomColorClass(c.room)}">${c.room}</span>
              </td>
              <td class="py-2 pr-2 text-center dark:text-slate-300 text-xs">${c.credits}</td>
              <td class="py-2">
                ${enrolled
                  ? `<button onclick="handleDrop('${c.c_no}')"
                       class="text-xs bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50
                              text-red-500 dark:text-red-400 px-2 py-1 rounded-lg transition whitespace-nowrap">退選</button>`
                  : `<button onclick="handleEnroll('${c.c_no}')"
                       class="text-xs bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50
                              text-indigo-600 dark:text-indigo-400 px-2 py-1 rounded-lg transition whitespace-nowrap">加選</button>`
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
  } catch (e) { toast(e.message); }
}

async function handleDrop(c_no) {
  if (!confirm('確定要退選此課程？')) return;
  try {
    await api('/enroll/' + c_no, { method: 'DELETE' });
    toast('退選成功', 'success');
    await Promise.all([loadMyCourses(), loadAvailableCourses()]);
  } catch (e) { toast(e.message); }
}

// ── Borrow tab — course cards ──────────────────────────────────────────────────
async function loadBorrowCards() {
  const el = document.getElementById('borrowQuickList');
  try {
    const { courses } = await api('/courses/me');
    _myCourses = courses;
    if (!courses.length) {
      el.innerHTML = '<p class="text-slate-400 dark:text-slate-500 text-sm">尚未選課，請先至選課頁面加選課程</p>';
      return;
    }
    el.innerHTML = `
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
        ${courses.map(c => {
          const colorCls = roomColorClass(c.room);
          return `
            <button onclick="openGanttModal('${c.room}',${c.weekday})"
              class="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700
                     hover:border-indigo-300 dark:hover:border-indigo-600
                     hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20 transition text-left w-full group">
              <div class="${colorCls} w-12 h-12 rounded-xl flex flex-col items-center justify-center
                          shrink-0 font-bold text-xs border-l-0">
                <span class="font-semibold text-xs leading-tight">${c.room}</span>
                <span class="text-[9px] opacity-60 font-normal">${weekdayLabel(c.weekday)}</span>
              </div>
              <div class="flex-1 min-w-0">
                <p class="font-semibold text-sm dark:text-slate-100 truncate">${c.title}</p>
                <p class="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                  ${weekdayLabel(c.weekday)} · ${formatTimeRange(c.time, c.credits)} · ${c.credits} 學分
                </p>
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-slate-300 dark:text-slate-600
                   group-hover:text-indigo-400 shrink-0 transition" fill="none" viewBox="0 0 24 24"
                   stroke-width="2" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/>
              </svg>
            </button>`;
        }).join('')}
      </div>`;
  } catch { el.innerHTML = '<p class="text-red-400 text-sm">載入失敗</p>'; }
}

// Manual borrow form (fallback)
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
    const course = _myCourses.find(c => c.c_no === c_no);
    showKeyModal(data.key, room, c_no, course?.credits ?? 2, course?.title);
    loadStatus();
    loadMyRoomBorrows();
  } catch (e) { toast(e.message); }
});

// Borrow directly from Gantt modal detail panel
async function handleBorrowFromGantt(c_no, room) {
  try {
    const data = await api('/borrow', { method: 'POST', body: JSON.stringify({ c_no, room }) });
    closeGanttModal();
    const course = _myCourses.find(c => c.c_no === c_no);
    showKeyModal(data.key, room, c_no, course?.credits ?? 2, course?.title);
    loadStatus();
    loadMyRoomBorrows();
  } catch (e) { toast(e.message); }
}

// ── Return ─────────────────────────────────────────────────────────────────────
async function handleReturn() {
  if (!confirm('確定要歸還教室？')) return;
  try {
    const data = await api('/return', { method: 'POST' });
    toast(data.message, 'success');
    loadStatus();
    loadMyRoomBorrows();
  } catch (e) { toast(e.message); }
}

// ── Key modal + QR code ────────────────────────────────────────────────────────
function showKeyModal(key, room, c_no, credits, title) {
  document.getElementById('keyDisplay').textContent = key;
  document.getElementById('keyModalSub').textContent =
    title ? `${title} · ${room}` : room;

  // Generate QR code (always white background for scanner compatibility)
  const qrContainer = document.getElementById('qrContainer');
  qrContainer.innerHTML = '';
  const qrData = JSON.stringify({
    room, key, c_no,
    exp: Date.now() + (credits * 60 - 10) * 60_000,
  });
  try {
    new QRCode(qrContainer, {
      text: qrData,
      width:  192,
      height: 192,
      colorDark:  '#1e293b',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M,
    });
  } catch {
    qrContainer.innerHTML =
      `<p class="text-xs text-slate-400 py-8 px-4 text-center">QR Code 產生失敗，請使用備用密碼</p>`;
  }

  startCountdown(credits * 60 - 10);
  document.getElementById('keyModal').classList.remove('hidden');
}

function closeKeyModal() {
  clearInterval(_countdownTimer);
  _countdownTimer = null;
  document.getElementById('keyModal').classList.add('hidden');
}

function startCountdown(durationMin) {
  clearInterval(_countdownTimer);
  let remaining = durationMin * 60; // seconds

  const tick = () => {
    const dot  = document.getElementById('qrDot');
    const disp = document.getElementById('qrCountdown');
    if (!disp) { clearInterval(_countdownTimer); return; }

    if (remaining <= 0) {
      disp.textContent = '已失效';
      disp.classList.add('text-red-500', 'dark:text-red-400');
      if (dot) { dot.classList.remove('bg-emerald-500'); dot.classList.add('bg-red-500'); }
      clearInterval(_countdownTimer);
      return;
    }

    const h = Math.floor(remaining / 3600);
    const m = Math.floor((remaining % 3600) / 60);
    const s = remaining % 60;
    disp.textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    remaining--;
  };

  tick();
  _countdownTimer = setInterval(tick, 1000);
}

// ── Timetable tab ──────────────────────────────────────────────────────────────
async function loadTimetable() {
  const wrap = document.getElementById('timetableWrap');
  wrap.innerHTML = '<div class="h-32 bg-slate-100 dark:bg-slate-700 rounded-xl animate-pulse"></div>';
  try {
    const { courses } = await api('/courses/me');
    _myCourses = courses;
    renderTimetable(courses);
  } catch (e) {
    wrap.innerHTML = `<p class="text-red-400 text-sm">${e.message}</p>`;
  }
}

function renderTimetable(courses) {
  const wrap = document.getElementById('timetableWrap');
  const todayJS  = new Date().getDay();
  const todayNum = todayJS >= 1 && todayJS <= 5 ? todayJS : 0;

  const byDay = { 1:[], 2:[], 3:[], 4:[], 5:[] };
  courses.forEach(c => { if (byDay[c.weekday]) byDay[c.weekday].push(c); });

  const hourLabels = Array.from({ length: TT_HOURS }, (_, i) => {
    const h = 8 + i;
    return `<div class="tt-hour-label">${String(h).padStart(2,'0')}:00</div>`;
  }).join('');

  function buildDayCol(dayNum) {
    const gridRows = Array.from({ length: TT_HOURS }, () => `<div class="tt-body-row"></div>`).join('');
    const blocks = byDay[dayNum].map(c => {
      const startMin = timeStrToMin(c.time);
      const top      = (startMin - TT_START) / 60 * PX_HOUR;
      const height   = Math.max((c.credits * 60 - 10) / 60 * PX_HOUR, 22);
      const endStr   = minToTimeStr(startMin + c.credits * 60 - 10);
      return `
        <div class="tt-block ${roomColorClass(c.room)}"
             style="top:${top.toFixed(1)}px;height:${height.toFixed(1)}px"
             onclick="openGanttModal('${c.room}',${c.weekday})"
             title="${c.title}（${c.room}）${c.time.slice(0,5)}–${endStr}">
          <div class="font-semibold truncate leading-tight">${c.title}</div>
          <div class="opacity-60 text-[9px] truncate mt-0.5">${c.room} · ${c.time.slice(0,5)}</div>
        </div>`;
    }).join('');
    return `<div class="tt-day-col">${gridRows}${blocks}</div>`;
  }

  const headerCells = `<div class="tt-head-cell"></div>` +
    DAYS.map((d, i) => {
      const dayNum  = i + 1;
      const isToday = dayNum === todayNum;
      return `<div class="tt-head-cell${isToday ? ' today' : ''}">${d}</div>`;
    }).join('');

  wrap.innerHTML = `
    <div class="tt-wrap">
      <div class="tt-grid">
        ${headerCells}
        <div class="tt-time-col">${hourLabels}</div>
        ${[1,2,3,4,5].map(d => buildDayCol(d)).join('')}
      </div>
    </div>`;
}

// ── Gantt modal ────────────────────────────────────────────────────────────────
async function openGanttModal(room, weekday) {
  const modal = document.getElementById('ganttModal');
  modal.classList.remove('hidden');
  document.getElementById('ganttModalTitle').textContent = `${room} — ${DAYS[weekday - 1]}`;
  document.getElementById('ganttModalSub').textContent   = '教室借用甘特圖 · 點選課程條查看詳情及借教室';
  document.getElementById('ganttModalBody').innerHTML    =
    '<div class="h-10 bg-slate-100 dark:bg-slate-700 rounded-xl animate-pulse"></div>';
  document.getElementById('ganttDetail').classList.add('hidden');

  try {
    const { schedule } = await api(`/rooms/${room}/schedule?weekday=${weekday}`);
    renderGantt(schedule);
  } catch (e) {
    document.getElementById('ganttModalBody').innerHTML =
      `<p class="text-red-400 text-sm">${e.message}</p>`;
  }
}

function closeGanttModal() {
  document.getElementById('ganttModal').classList.add('hidden');
  document.getElementById('ganttDetail').classList.add('hidden');
}

document.getElementById('ganttModal').addEventListener('click', function(e) {
  if (e.target === this) closeGanttModal();
});

function renderGantt(schedule) {
  const body = document.getElementById('ganttModalBody');
  window._ganttSchedule = schedule;

  if (!schedule.length) {
    body.innerHTML = '<p class="text-slate-400 dark:text-slate-500 text-sm py-4">此教室當天無排課</p>';
    return;
  }

  // Time ruler
  const ticksHtml = Array.from({ length: 14 }, (_, i) => {
    const h    = 8 + i;
    const left = ((h * 60 - GANTT_START) / GANTT_RANGE * 100).toFixed(2);
    return `<div class="absolute top-0 bottom-0 border-l border-slate-200 dark:border-slate-600 pointer-events-none"
                 style="left:${left}%">
              <span class="absolute -top-5 -translate-x-1/2 text-[10px] text-slate-400">${h}:00</span>
            </div>`;
  }).join('');

  const barsHtml = schedule.map((c, idx) => {
    const lsid    = c.lend_sid;
    const isMe    = lsid === currentUser?.sid;
    const occupied = lsid !== 'null';

    let colorCls, labelPrefix, titleHint;
    if (!occupied) {
      colorCls    = 'bg-emerald-200 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700';
      labelPrefix = '';
      titleHint   = `${c.title} — 空閒（點選可借教室）`;
    } else if (isMe) {
      colorCls    = 'bg-indigo-400 dark:bg-indigo-600 text-white border border-indigo-500';
      labelPrefix = '📌 ';
      titleHint   = `${c.title} — 我借用中`;
    } else if (c.can_force_return) {
      colorCls    = 'bg-rose-300 dark:bg-rose-800/70 text-rose-900 dark:text-rose-200 border border-rose-400 dark:border-rose-700';
      labelPrefix = '⚠ ';
      titleHint   = `${c.title} — ${c.lend_name} 借用中（可強制歸還）`;
    } else {
      colorCls    = 'bg-amber-200 dark:bg-amber-900/60 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-700';
      labelPrefix = '';
      titleHint   = `${c.title} — ${c.lend_name} 借用中`;
    }

    return `
      <div class="gantt-bar ${colorCls}"
           style="left:${leftPct(c.time)}%;width:${widthPct(c.time,c.credits)}%"
           title="${titleHint}"
           onclick="showGanttDetail(${idx})">
        <span class="truncate text-[11px]">${labelPrefix}${c.title}</span>
        ${c.can_force_return ? `
          <button onclick="event.stopPropagation();handleForceReturn('${c.c_no}','${c.room}')"
            class="ml-1 shrink-0 bg-rose-600 hover:bg-rose-700 text-white text-[10px]
                   px-1.5 py-0.5 rounded font-semibold whitespace-nowrap">強制歸還</button>` : ''}
      </div>`;
  }).join('');

  body.innerHTML = `
    <div class="relative pt-6 pb-3">
      <div class="relative h-5 mb-2">${ticksHtml}</div>
      <div class="relative h-12 bg-slate-50 dark:bg-slate-800/50 rounded-xl
                  border border-slate-200 dark:border-slate-700 overflow-visible">
        ${barsHtml}
      </div>
    </div>`;
}

function showGanttDetail(idx) {
  const c = window._ganttSchedule?.[idx];
  if (!c) return;
  const panel    = document.getElementById('ganttDetail');
  const endMin   = timeStrToMin(c.time) + c.credits * 60 - 10;
  const occupied = c.lend_sid !== 'null';
  const isMe     = c.lend_sid === currentUser?.sid;

  const KEY_ICON = `<svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none"
    viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
    <path stroke-linecap="round" stroke-linejoin="round"
      d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43
         L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499
         c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"/>
  </svg>`;

  let statusHtml = '';
  if (!occupied) {
    statusHtml = `
      <p class="text-xs text-emerald-600 dark:text-emerald-400 mt-1">✓ 此教室目前空閒</p>
      ${c.is_enrolled_by_me
        ? `<button onclick="handleBorrowFromGantt('${c.c_no}','${c.room}')"
             class="mt-2 flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700
                    dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white text-xs
                    font-semibold px-4 py-2 rounded-xl transition shadow-sm">
             ${KEY_ICON} 立即借此教室
           </button>`
        : `<p class="text-xs text-slate-400 dark:text-slate-500 mt-1">（您未修此課程，無法借用）</p>`
      }`;
  } else if (isMe) {
    statusHtml = `<p class="text-xs text-indigo-600 dark:text-indigo-400 mt-1 font-medium">📌 您正在借用此教室</p>`;
  } else {
    statusHtml = `
      <p class="text-xs mt-1 dark:text-slate-200">借用者：<strong>${c.lend_name}</strong>（${c.lend_sid}）</p>
      ${c.can_force_return
        ? `<p class="text-xs text-rose-600 dark:text-rose-400 mt-1">⚠ 您的課程將接續此教室，可強制歸還</p>
           <button onclick="handleForceReturn('${c.c_no}','${c.room}')"
             class="mt-2 bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold
                    px-3 py-1.5 rounded-xl transition">強制歸還此教室</button>`
        : ''
      }`;
  }

  panel.classList.remove('hidden');
  panel.innerHTML = `
    <div class="flex items-start justify-between gap-2">
      <div>
        <p class="font-semibold dark:text-slate-100">
          ${c.title}
          <span class="font-mono text-indigo-500 dark:text-indigo-400 text-xs ml-1">${c.c_no}</span>
        </p>
        <p class="text-slate-500 dark:text-slate-400 text-xs mt-0.5">
          教室：${c.room} ｜ 時段：${c.time.slice(0,5)}–${minToTimeStr(endMin)} ｜ 學分：${c.credits}
        </p>
        ${statusHtml}
      </div>
    </div>`;
}

async function handleForceReturn(c_no, room) {
  if (!confirm(`確定要強制歸還「${room}」？原借用者將收到系統通知。`)) return;
  try {
    const data = await api('/borrow/force-return', { method: 'POST', body: JSON.stringify({ c_no }) });
    toast(data.message, 'success');
    const modal = document.getElementById('ganttModal');
    if (!modal.classList.contains('hidden')) {
      const title  = document.getElementById('ganttModalTitle').textContent;
      const parts  = title.split(' — ');
      const dayIdx = DAYS.indexOf(parts[1]);
      if (dayIdx >= 0) openGanttModal(parts[0], dayIdx + 1);
    }
    loadMyRoomBorrows();
    document.getElementById('ganttDetail').classList.add('hidden');
  } catch (e) { toast(e.message); }
}

// ── Settings ───────────────────────────────────────────────────────────────────
async function handleChangePw() {
  const newPw = document.getElementById('newPwInput').value;
  if (!newPw.trim()) { toast('新密碼不得為空'); return; }
  try {
    const data = await api('/auth/password', { method: 'PUT', body: JSON.stringify({ new_password: newPw }) });
    toast(data.message, 'success');
    setTimeout(handleLogout, 1800);
  } catch (e) { toast(e.message); }
}

// ── Notifications ──────────────────────────────────────────────────────────────
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
      el.innerHTML = '<p class="text-slate-400 text-sm text-center mt-8">沒有通知</p>';
      return;
    }
    el.innerHTML = notifications.map(n => `
      <div class="rounded-xl p-3 text-sm cursor-pointer transition
                  ${n.is_read
                    ? 'bg-slate-50 dark:bg-slate-700/40'
                    : 'bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/50'}"
           onclick="markOneRead(${n.id}, this)">
        <p class="${n.is_read
          ? 'text-slate-600 dark:text-slate-300'
          : 'text-slate-800 dark:text-slate-100 font-medium'}">${n.message}</p>
        <p class="text-[10px] text-slate-400 mt-1">${n.created_at}</p>
      </div>`).join('');
  } catch {
    el.innerHTML = '<p class="text-red-400 text-sm text-center">載入失敗</p>';
  }
}

async function markOneRead(id, elItem) {
  try {
    await api('/notifications/read', { method: 'POST', body: JSON.stringify({ notif_id: id }) });
    elItem.classList.remove('bg-indigo-50', 'border', 'border-indigo-100');
    elItem.classList.add('bg-slate-50');
    const p = elItem.querySelector('p');
    if (p) { p.classList.remove('font-medium'); }
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
    badge.classList.add('show');
  } else {
    badge.classList.remove('show');
  }
}

async function pollNotifications() {
  try {
    const { unread } = await api('/notifications');
    updateNotifBadge(unread);
  } catch {}
}

// ── Auth ───────────────────────────────────────────────────────────────────────
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

// ── Dashboard init ─────────────────────────────────────────────────────────────
function initDashboard() {
  document.getElementById('navUser').textContent =
    `${currentUser.name}（${currentUser.sid}）`;
  const hash = window.location.hash.replace('#', '') || 'status';
  switchTab(TABS.includes(hash) ? hash : 'status');
  pollNotifications();
  clearInterval(notifPollTimer);
  notifPollTimer = setInterval(pollNotifications, 30_000);
}

// ── Init ───────────────────────────────────────────────────────────────────────
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
