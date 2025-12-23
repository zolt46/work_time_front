// File: /ui/js/layout.js
import { loadUser, logout, startSessionCountdown, refreshSession } from './auth.js';
import { checkSystemStatus } from './status.js';
import { API_BASE_URL } from './api.js';
import { initNotifications } from './notifications.js';

function setupSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const toggle = document.getElementById('sidebar-toggle');
  const page = document.querySelector('.page');
  if (page) page.classList.add('sidebar-closed');
  if (!sidebar || !overlay || !toggle) return;
  const close = () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('show');
    if (page) page.classList.add('sidebar-closed');
    toggle.classList.remove('active');
  };
  toggle.addEventListener('click', () => {
    const willOpen = !sidebar.classList.contains('open');
    sidebar.classList.toggle('open', willOpen);
    overlay.classList.toggle('show', willOpen);
    if (page) page.classList.toggle('sidebar-closed', !willOpen);
    toggle.classList.toggle('active', willOpen);
  });
  overlay.addEventListener('click', close);
}

function highlightNav(activePage) {
  document.querySelectorAll('.nav-link').forEach((link) => {
    if (link.dataset.page === activePage) {
      link.classList.add('active');
    }
  });
}

const roleOrder = { MEMBER: 1, OPERATOR: 2, MASTER: 3 };

function isLinkAllowed(link, role) {
  const allowedRoles = (link.dataset.roles || '')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);
  const minRole = link.dataset.minRole;
  let visible = true;
  if (allowedRoles.length) {
    visible = allowedRoles.includes(role);
  }
  if (visible && minRole) {
    visible = roleOrder[role] >= roleOrder[minRole];
  }
  return visible;
}

function applyNavVisibility(role) {
  document.querySelectorAll('.nav-link').forEach((link) => {
    link.style.display = isLinkAllowed(link, role) ? '' : 'none';
  });
}

function enforcePageAccess(activePage, role) {
  const activeLink = document.querySelector(`.nav-link[data-page="${activePage}"]`);
  if (!activeLink) return true;
  return isLinkAllowed(activeLink, role);
}

function wireCommonActions() {
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.onclick = () => logout(true);
  const home = document.querySelector('.logo');
  if (home) {
    home.style.cursor = 'pointer';
    home.addEventListener('click', () => {
      window.location.href = 'dashboard.html';
    });
  }
}

export async function initAppLayout(activePage) {
  highlightNav(activePage);
  setupSidebar();
  wireCommonActions();
  const user = await loadUser();
  if (user) {
    applyNavVisibility(user.role);
    if (!enforcePageAccess(activePage, user.role) && activePage !== 'dashboard') {
      alert('해당 페이지에 대한 접근 권한이 없습니다. 대시보드로 이동합니다.');
      window.location.href = 'dashboard.html';
      return user;
    }
  }
  startSessionCountdown(
    document.getElementById('session-countdown'),
    document.getElementById('extend-session')
  );
  const extendBtn = document.getElementById('extend-session');
  if (extendBtn) {
    extendBtn.addEventListener('click', async () => {
      extendBtn.disabled = true;
      extendBtn.textContent = '연장 중...';
      try {
        await refreshSession();
        startSessionCountdown(
          document.getElementById('session-countdown'),
          extendBtn
        );
        extendBtn.textContent = '세션 연장됨';
      } catch (e) {
        extendBtn.textContent = '연장 실패';
      } finally {
        setTimeout(() => { extendBtn.textContent = '세션 연장'; extendBtn.disabled = false; }, 1500);
      }
    });
  }
  checkSystemStatus(
    document.getElementById('server-status'),
    document.getElementById('db-status'),
    document.getElementById('status-meta'),
    { timeoutMs: 4000 }
  );

  await initNotifications(user);

  // keep-alive ping to 줄여서 서버 지연 방지
  setInterval(() => {
    fetch(`${API_BASE_URL}/health`, { cache: 'no-store' }).catch(() => {});
  }, 120000);
  return user;
}

export async function initLoginShell() {
  setupSidebar();
  const loginProgress = document.getElementById('login-progress');
  checkSystemStatus(
    document.getElementById('server-status'),
    document.getElementById('db-status'),
    document.getElementById('status-meta'),
    {
      autoRetry: true,
      maxRetries: Infinity,
      retryDelay: 900,
      timeoutMs: 3500,
      onRecover: () => window.location.reload(),
      onRetry: (nextAttempt, maxRetries) => {
        if (loginProgress) {
          const attemptLabel = Number.isFinite(maxRetries) ? `${nextAttempt}/${maxRetries}회` : `${nextAttempt}회째`;
          loginProgress.textContent = `서버 준비 중... 자동 재시도 (${attemptLabel})`;
        }
      }
    }
  );
  if (loginProgress) loginProgress.textContent = '로그인 정보를 입력하세요';
}
