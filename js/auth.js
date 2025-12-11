// File: /ui/js/auth.js
import { apiRequest, API_BASE_URL } from './api.js';

async function login(event) {
  event.preventDefault();
  const login_id = document.getElementById('login_id').value;
  const password = document.getElementById('password').value;
  const form = new FormData();
  form.append('username', login_id);
  form.append('password', password);

  try {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      body: form
    });
    if (!res.ok) throw new Error('Login failed');
    const data = await res.json();
    localStorage.setItem('token', data.access_token);
    window.location.href = 'dashboard.html';
  } catch (err) {
    alert(err.message);
  }
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
  localStorage.removeItem('token');
  window.location.href = 'index.html';
}

export { login, loadUser, logout };
