// File: /ui/js/auth.js
import { apiRequest, API_BASE_URL, clearToken } from './api.js';

let countdownInterval;

function parseTokenExp(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const base = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base));
    if (payload.exp) return payload.exp * 1000;
  } catch (e) {
    console.error('Failed to parse token exp', e);
  }
  return null;
}

async function login(event) {
  event.preventDefault();
  const login_id = document.getElementById('login_id').value;
  const password = document.getElementById('password').value;
  const button = event.target.querySelector('button[type="submit"]');
  const loadingBar = document.getElementById('login-loading');
  const statusText = document.getElementById('login-progress');
  if (button) button.disabled = true;
  if (loadingBar) loadingBar.classList.add('show');
  if (statusText) statusText.textContent = '서버 응답 대기 중...';
  const form = new FormData();
  form.append('username', login_id);
  form.append('password', password);

  try {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      body: form
    });
    if (!res.ok) throw new Error('로그인에 실패했습니다');
    const data = await res.json();
    localStorage.setItem('token', data.access_token);
    const exp = parseTokenExp(data.access_token);
    if (exp) localStorage.setItem('token_exp', String(exp));
    window.location.href = 'dashboard.html';
  } catch (err) {
    alert(err.message);
    if (statusText) statusText.textContent = '로그인에 실패했습니다. 다시 시도해주세요.';
  }
  if (loadingBar) loadingBar.classList.remove('show');
  if (button) button.disabled = false;
}

async function loadUser() {
  try {
    const user = await apiRequest('/auth/me');
    const nameNode = document.getElementById('user-name');
    if (nameNode) nameNode.innerText = user.name;
    const roleNode = document.getElementById('user-role');
    if (roleNode) roleNode.innerText = user.role;
    return user;
  } catch (e) {
    console.error(e);
  }
}

function logout() {
  clearToken();
  window.location.href = 'index.html';
}

function startSessionCountdown(el) {
  if (!el) return;
  const exp = parseInt(localStorage.getItem('token_exp') || '0', 10) || parseTokenExp(localStorage.getItem('token'));
  if (countdownInterval) clearInterval(countdownInterval);
  if (!exp) {
    el.textContent = '';
    return;
  }
  const tick = () => {
    const remaining = exp - Date.now();
    if (remaining <= 0) {
      el.textContent = '세션 만료됨';
      logout(true);
      return;
    }
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    el.textContent = `자동 로그아웃까지 ${mins}분 ${secs.toString().padStart(2, '0')}초`;
  };
  tick();
  countdownInterval = setInterval(tick, 1000);
}

export { login, loadUser, logout, startSessionCountdown };
