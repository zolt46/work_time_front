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

function humanize(r) {
  const kind = r.type === 'ABSENCE' ? '결근' : '추가 근무';
  const status = r.status === 'CANCELLED' && r.cancelled_after_approval ? '승인 후 취소됨' : (statusText[r.status] || r.status);
  return `${r.target_date} ${kind} · ${status}`;
}

function buildItem(text, status) {
  const li = document.createElement('li');
  li.className = `notif-item ${status ? status.toLowerCase() : ''}`;
  li.textContent = text;
  return li;
}

async function fetchNotifications(user) {
  if (!user) return [];
  if (user.role === 'MEMBER') {
    const mine = await apiRequest('/requests/my');
    return mine.slice(0, 10);
  }
  const pending = await apiRequest('/requests/pending');
  return pending.slice(0, 15);
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

  async function refresh() {
    if (!listEl) return;
    listEl.innerHTML = '<li class="muted">불러오는 중...</li>';
    try {
      const items = await fetchNotifications(user);
      listEl.innerHTML = '';
      if (!items.length) {
        listEl.innerHTML = '<li class="muted">새 알림이 없습니다</li>';
      } else {
        items.forEach((it) => listEl.appendChild(buildItem(humanize(it), it.status)));
      }
      const pendingCount = items.filter((i) => i.status === 'PENDING').length;
      if (badgeEl) {
        badgeEl.textContent = pendingCount;
        badgeEl.style.display = pendingCount ? 'inline-block' : 'none';
      }
      // 알림을 본 것으로 처리: 패널이 열려 있을 때는 배지를 비운다
      if (panel.classList.contains('show') && badgeEl) {
        badgeEl.style.display = 'none';
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

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const willShow = !panel.classList.contains('show');
    panel.classList.toggle('show', willShow);
    if (willShow) {
      refresh().then(() => {
        if (badgeEl) badgeEl.style.display = 'none';
      });
    }
  });
  panel.addEventListener('click', () => {
    panel.classList.remove('show');
    if (badgeEl) badgeEl.style.display = 'none';
    if (listEl && !listEl.querySelector('.muted') && !listEl.querySelector('.error')) {
      listEl.innerHTML = '<li class="muted">새 알림이 없습니다</li>';
    }
  });
  document.addEventListener('click', (e) => {
    if (!panel.contains(e.target) && e.target !== btn) panel.classList.remove('show');
  });

  await refresh();
}
