// File: /ui/js/layout.js
import { loadUser, logout, startSessionCountdown, refreshSession, shouldShowPasswordUpdatePrompt, snoozePasswordUpdate, markPasswordUpdated } from './auth.js';
import { checkSystemStatus } from './status.js';
import { API_BASE_URL } from './api.js';
import { initNotifications } from './notifications.js';
import { initNoticeOverlays } from './notices.js';

// 중복 로드 시에도 동일 인스턴스를 재사용하도록 전역에 저장
if (!globalThis.__worktimeLayout) {
  const roleOrder = { MEMBER: 1, OPERATOR: 2, MASTER: 3 };

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
      if (link.dataset.page === activePage) link.classList.add('active');
    });
  }

  function isLinkAllowed(link, role) {
    const allowedRoles = (link.dataset.roles || '')
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);
    const minRole = link.dataset.minRole;
    let visible = true;
    if (allowedRoles.length) visible = allowedRoles.includes(role);
    if (visible && minRole) visible = roleOrder[role] >= roleOrder[minRole];
    return visible;
  }

  function applyNavVisibility(role) {
    document.querySelectorAll('.nav-link').forEach((link) => {
      link.style.display = isLinkAllowed(link, role) ? '' : 'none';
    });
  }

  function isPageAllowed(activePage, role) {
    const activeLink = document.querySelector(`.nav-link[data-page="${activePage}"]`);
    if (!activeLink) return true;
    return isLinkAllowed(activeLink, role);
  }

  function showAppShellLoader() {
    let loader = document.getElementById('app-shell-loader');
    if (!loader) {
      loader = document.createElement('div');
      loader.id = 'app-shell-loader';
      loader.className = 'app-shell-loader';
      loader.innerHTML = `<div class="spinner" aria-label="로딩 중"></div><div class="muted">필요한 정보를 불러오는 중...</div>`;
      document.body.appendChild(loader);
    }
    document.body.classList.add('app-loading');
  }

  function hideAppShellLoader() {
    document.body.classList.remove('app-loading');
  }

  function showWeakPasswordPrompt(user) {
    if (!shouldShowPasswordUpdatePrompt()) return;
    if (!user || (user.role !== 'OPERATOR' && user.role !== 'MEMBER')) return;
    if (document.getElementById('password-warning-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'password-warning-modal';
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3>비밀번호를 안전하게 변경하세요</h3>
        </div>
        <div class="modal-body">
          <p>임시 비밀번호로 추정되는 약한 비밀번호로 로그인했습니다. 보안을 위해 새 비밀번호로 변경하세요.</p>
          <p class="muted small">규칙: 8자 이상, 숫자와 특수문자 각 1자 이상 포함</p>
        </div>
        <div class="modal-footer">
          <button class="btn" id="pw-change-now">지금 변경</button>
          <button class="btn secondary" id="pw-change-later">다음에 변경</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('pw-change-now')?.addEventListener('click', () => {
      markPasswordUpdated();
      window.location.href = 'member_profile.html';
    });
    document.getElementById('pw-change-later')?.addEventListener('click', () => {
      snoozePasswordUpdate(12);
      modal.remove();
    });
  }

  function wireCommonActions() {
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.onclick = () => logout(true);
    const home = document.querySelector('.logo');
    if (home) {
      home.style.cursor = 'pointer';
      home.addEventListener('click', () => { window.location.href = 'dashboard.html'; });
    }
  }

  async function initAppLayout(activePage) {
    showAppShellLoader();
    highlightNav(activePage);
    setupSidebar();
    wireCommonActions();
    let user;
    try {
      user = await loadUser();
      if (user) {
        applyNavVisibility(user.role);
        if (!isPageAllowed(activePage, user.role) && activePage !== 'dashboard') {
          alert('해당 페이지에 대한 접근 권한이 없습니다. 대시보드로 이동합니다.');
          window.location.href = 'dashboard.html';
          return user;
        }
      }
    } catch (e) {
      console.error('사용자 정보를 불러오지 못했습니다.', e);
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

    try {
      await initNotifications(user);
      await initNoticeOverlays(user);
    } finally {
      hideAppShellLoader();
    }
    showWeakPasswordPrompt(user);

    setInterval(() => {
      fetch(`${API_BASE_URL}/health`, { cache: 'no-store' }).catch(() => {});
    }, 120000);
    return user;
  }

  async function initLoginShell() {
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

  globalThis.__worktimeLayout = { initAppLayout, initLoginShell };
}

export const initAppLayout = globalThis.__worktimeLayout.initAppLayout;
export const initLoginShell = globalThis.__worktimeLayout.initLoginShell;
