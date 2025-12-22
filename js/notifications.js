import { apiRequest } from './api.js';

const bellSvg = `
<svg aria-hidden="true" focusable="false" width="22" height="22" viewBox="0 0 24 24" fill="none">
  <path d="M12 3a6 6 0 0 0-6 6v4.4l-.92 2.3A1 1 0 0 0 6.02 17h11.96a1 1 0 0 0 .94-1.3l-.92-2.3V9a6 6 0 0 0-6-6Z" stroke="currentColor" stroke-width="1.5" fill="currentColor" fill-opacity="0.06"/>
  <path d="M9.5 18a2.5 2.5 0 0 0 5 0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>
`;

const statusText = {
  PENDING: '승인 대기',
  APPROVED: '승인됨',
  REJECTED: '거절됨',
  CANCELLED: '취소됨',
};

function buildItem(text, status, meta) {
  const li = document.createElement('li');
  li.className = `notif-item ${status ? status.toLowerCase() : ''}`;
  li.innerHTML = `<div>${text}</div>${meta ? `<div class="muted small">${meta}</div>` : ''}`;
  return li;
}

const cache = {
  users: null,
  shifts: null
};

async function ensureMeta() {
  if (!cache.users) cache.users = apiRequest('/users');
  if (!cache.shifts) cache.shifts = apiRequest('/schedule/shifts');
  const [users, shifts] = await Promise.all([cache.users, cache.shifts]);
  return { users, shifts };
}

function timeWindow(req, shift) {
  const start = req.target_start_time || shift?.start_time;
  const end = req.target_end_time || shift?.end_time;
  if (!start || !end) return shift ? `${shift.start_time?.slice(0, 5)}~${shift.end_time?.slice(0, 5)}` : '';
  return `${start.slice(0, 5)}~${end.slice(0, 5)}`;
}

function describeRequest(req, userMap, shiftMap, viewerRole) {
  const applicant = userMap[req.user_id]?.name || '알 수 없는 신청자';
  const shift = shiftMap[req.target_shift_id];
  const window = timeWindow(req, shift);
  const kind = req.type === 'ABSENCE' ? '결근' : '추가 근무';
  const base = `${req.target_date} ${window ? `${window} ` : ''}${kind}`;
  if (req.status === 'PENDING') {
    return {
      text: viewerRole === 'MEMBER' ? `신청 접수됨: ${base}` : `${applicant}님 요청 대기: ${base}`,
      meta: req.reason ? `사유: ${req.reason}` : null
    };
  }
  if (req.status === 'APPROVED') {
    return { text: `승인됨: ${base}`, meta: `신청자: ${applicant}` };
  }
  if (req.status === 'REJECTED') {
    return { text: `거절됨: ${base}`, meta: req.reason ? `사유: ${req.reason}` : `신청자: ${applicant}` };
  }
  if (req.status === 'CANCELLED' && req.cancelled_after_approval) {
    return { text: `승인 후 취소됨: ${base}`, meta: `신청자: ${applicant}` };
  }
  if (req.status === 'CANCELLED') {
    return { text: `신청 취소됨: ${base}`, meta: `신청자: ${applicant}` };
  }
  return { text: `${base} · ${statusText[req.status] || req.status}`, meta: `신청자: ${applicant}` };
}

async function fetchNotifications(user) {
  if (!user) return [];
  const { users, shifts } = await ensureMeta();
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
  const shiftMap = Object.fromEntries(shifts.map((s) => [s.id, s]));
  if (user.role === 'MEMBER') {
    const mine = await apiRequest('/requests/my');
    return mine
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .slice(0, 10)
      .map((req) => ({ ...describeRequest(req, userMap, shiftMap, user.role), status: req.status, created_at: req.created_at }));
  }
  const feed = await apiRequest('/requests/feed');
  return feed
    .filter((req) => req.status === 'PENDING' || req.cancelled_after_approval || req.status === 'CANCELLED')
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, 10)
    .map((req) => ({ ...describeRequest(req, userMap, shiftMap, user.role), status: req.status, created_at: req.created_at }));
}

export async function initNotifications(user) {
  const container = document.querySelector('.header-right');
  if (!container) return;
  let panel = document.getElementById('notif-panel');
  let btn = document.getElementById('notif-btn');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'notif-btn';
    btn.className = 'icon-btn bell';
    btn.title = '알림 보기';
    btn.innerHTML = `${bellSvg}<span id="notif-badge" class="notif-badge" style="display:none;"></span>`;
    container.insertBefore(btn, container.firstChild);
  }
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'notif-panel';
    panel.className = 'notif-panel';
    panel.innerHTML = `<div class="notif-header">알림 <button class="btn tiny muted" id="notif-refresh">새로고침</button></div><ul id="notif-list" class="notif-list"></ul>`;
    container.appendChild(panel);
  }

  const listEl = panel.querySelector('#notif-list');
  const badgeEl = document.getElementById('notif-badge');
  const lastSeenKey = 'notif_last_seen';
  const maxItems = 10;
  let latest = [];

  function computeUnread(items) {
    const lastSeen = parseInt(localStorage.getItem(lastSeenKey) || '0', 10);
    return items.filter((i) => {
      const created = i.created_at ? Date.parse(i.created_at) : 0;
      return i.status === 'PENDING' && created > lastSeen;
    }).length;
  }

  async function refresh() {
    if (!listEl) return;
    listEl.innerHTML = '<li class="muted">불러오는 중...</li>';
    try {
      const items = await fetchNotifications(user);
      latest = items;
      listEl.innerHTML = '';
      if (!items.length) {
        listEl.innerHTML = '<li class="muted">새 알림이 없습니다</li>';
      } else {
        items.slice(0, maxItems).forEach((it) => listEl.appendChild(buildItem(it.text, it.status, it.meta)));
      }
      const unread = computeUnread(items);
      if (badgeEl) {
        badgeEl.textContent = unread;
        badgeEl.style.display = unread ? 'inline-block' : 'none';
      }
    } catch (e) {
      listEl.innerHTML = `<li class="error">알림을 불러오지 못했습니다: ${e.message || e}</li>`;
      if (badgeEl) badgeEl.style.display = 'none';
    }
  }

  panel.querySelector('#notif-refresh')?.addEventListener('click', (e) => {
    e.stopPropagation();
    refresh();
  });

  window.addEventListener('notifications:refresh', () => refresh());

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const willShow = !panel.classList.contains('show');
    panel.classList.toggle('show', willShow);
    if (willShow) {
      refresh().then(() => {
        localStorage.setItem(lastSeenKey, Date.now().toString());
        if (badgeEl) badgeEl.style.display = 'none';
      });
    }
  });
  document.addEventListener('click', (e) => {
    if (!panel.contains(e.target) && e.target !== btn) panel.classList.remove('show');
  });

  await refresh();
}

export function triggerNotificationsRefresh() {
  const evt = new Event('notifications:refresh');
  window.dispatchEvent(evt);
}
