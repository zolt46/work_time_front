// File: /ui/js/layout.js
import { loadUser, logout, startSessionCountdown } from './auth.js';
import { checkDbStatus, checkSystemStatus } from './status.js';

function setupSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const toggle = document.getElementById('sidebar-toggle');
  if (!sidebar || !overlay || !toggle) return;
  const close = () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('show');
  };
  toggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('show');
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
  startSessionCountdown(document.getElementById('session-countdown'));
  await checkDbStatus(document.getElementById('db-status'));
  return user;
}

export async function initLoginShell() {
  setupSidebar();
  await checkSystemStatus(
    document.getElementById('server-status'),
    document.getElementById('db-status')
  );
  const loginProgress = document.getElementById('login-progress');
  if (loginProgress) loginProgress.textContent = '로그인 정보를 입력하세요';
}
