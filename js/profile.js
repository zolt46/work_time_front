// File: /ui/js/profile.js
import { apiRequest } from './api.js';

const roleLabel = {
  MASTER: '마스터',
  OPERATOR: '운영자',
  MEMBER: '구성원'
};

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value ?? '-';
}

function renderProfile(user) {
  setText('profile-name', user?.name || '-');
  setText('profile-role', user ? `${roleLabel[user.role] || user.role} (${user.role})` : '-');
  setText('profile-identifier', user?.identifier || '-');
  setText('profile-login', user?.auth_account?.login_id || '-');
  setText('profile-active', user?.active ? '활성' : '비활성');
  setText('profile-last-login', user?.auth_account?.last_login_at ? new Date(user.auth_account.last_login_at).toLocaleString() : '기록 없음');
}

async function loadVisibleUsers() {
  const tbody = document.getElementById('visible-users-body');
  if (!tbody) return;
  const users = await apiRequest('/users');
  tbody.innerHTML = '';
  users.forEach((u) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${u.name}</td><td>${roleLabel[u.role] || u.role}</td><td>${u.identifier || ''}</td><td>${u.auth_account?.login_id || ''}</td><td>${u.active ? '활성' : '비활성'}</td>`;
    tbody.appendChild(tr);
  });
}

function bindAccountForm() {
  const form = document.getElementById('account-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      current_password: document.getElementById('current-password')?.value,
      new_login_id: document.getElementById('new-login')?.value || null,
      new_password: document.getElementById('new-password')?.value || null
    };
    if (!payload.new_login_id && !payload.new_password) {
      alert('변경할 로그인 ID나 비밀번호를 입력하세요.');
      return;
    }
    try {
      const updated = await apiRequest('/auth/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      renderProfile(updated);
      form.reset();
      alert('계정 정보가 업데이트되었습니다. 다시 로그인해야 할 수 있습니다.');
    } catch (err) {
      alert(err.message);
    }
  });
}

function bindResetButtons(role) {
  const buttons = document.querySelectorAll('[data-reset-scope]');
  const allowedByRole = {
    MASTER: ['members', 'operators_members', 'all'],
    OPERATOR: ['members'],
    MEMBER: []
  };
  buttons.forEach((btn) => {
    const scope = btn.dataset.resetScope;
    const isAllowed = allowedByRole[role]?.includes(scope);
    btn.style.display = isAllowed ? '' : 'none';
    if (!isAllowed) return;
    btn.addEventListener('click', async () => {
      const confirmMsg = `정말로 ${btn.textContent.trim()} 작업을 진행하시겠습니까?`;
      if (!confirm(confirmMsg)) return;
      try {
        const result = await apiRequest('/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scope })
        });
        const label = document.getElementById('reset-result');
        if (label) label.textContent = `${new Date().toLocaleTimeString()} · ${result.detail}`;
        await loadVisibleUsers();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

async function attachProfilePage(user) {
  if (!user) return;
  renderProfile(user);
  bindAccountForm();
  bindResetButtons(user.role);
  await loadVisibleUsers();
}

export { attachProfilePage };
