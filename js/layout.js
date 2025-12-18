// File: /ui/js/layout.js
import { loadUser, logout, startSessionCountdown, refreshSession } from './auth.js';
import { checkSystemStatus } from './status.js';
import { API_BASE_URL } from './api.js';

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

function applyNavVisibility(role) {
  document.querySelectorAll('.nav-link').forEach((link) => {
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
    link.style.display = visible ? '' : 'none';
  });
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
  if (user) applyNavVisibility(user.role);
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
  await checkSystemStatus(
    document.getElementById('server-status'),
    document.getElementById('db-status'),
    document.getElementById('status-meta')
  );

  // keep-alive ping to 줄여서 서버 지연 방지
  setInterval(() => {
    fetch(`${API_BASE_URL}/health`, { cache: 'no-store' }).catch(() => {});
  }, 120000);
  return user;
}

export async function initLoginShell() {
  setupSidebar();
  const loginProgress = document.getElementById('login-progress');
  await checkSystemStatus(
    document.getElementById('server-status'),
    document.getElementById('db-status'),
    document.getElementById('status-meta'),
    {
      autoRetry: true,
      maxRetries: 10,
      retryDelay: 1800,
      onRecover: () => window.location.reload(),
      onRetry: (nextAttempt, maxRetries) => {
        if (loginProgress) {
          loginProgress.textContent = `서버 준비 중... 자동 재시도 (${nextAttempt}/${maxRetries}회)`;
        }
      }
    }
  );
  if (loginProgress) loginProgress.textContent = '로그인 정보를 입력하세요';
}
