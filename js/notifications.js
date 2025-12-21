import { apiRequest } from './api.js';

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
    return mine.slice(0, 10).map((r) => {
      const status = r.status;
      return {
        status,
        text: `${r.target_date} ${r.type === 'ABSENCE' ? '결근' : '추가'} / ${status}`
      };
    });
  }
  // operator/master
  const feed = await apiRequest('/requests/feed');
  return feed.slice(0, 12).map((r) => {
    const status = r.status;
    const label = status === 'CANCELLED' && r.cancelled_after_approval ? '승인 후 취소' : status;
    return {
      status,
      text: `${r.target_date} ${r.type === 'ABSENCE' ? '결근' : '추가'} · ${label}`
    };
  });
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
    btn.innerHTML = '🔔<span id="notif-badge" class="notif-badge" style="display:none;"></span>';
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
        items.forEach((it) => listEl.appendChild(buildItem(it.text, it.status)));
      }
      const pendingCount = items.filter((i) => i.status === 'PENDING').length;
      if (badgeEl) {
        badgeEl.textContent = pendingCount;
        badgeEl.style.display = pendingCount ? 'inline-block' : 'none';
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

  btn.addEventListener('click', () => {
    panel.classList.toggle('show');
  });
  document.addEventListener('click', (e) => {
    if (!panel.contains(e.target) && e.target !== btn) panel.classList.remove('show');
  });

  await refresh();
}
