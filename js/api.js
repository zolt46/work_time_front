// File: /ui/js/api.js
const API_BASE_URL = "https://work-time-back.onrender.com";

function buildLoginUrl() {
  const path = window.location.pathname;
  const base = path.includes('/html/')
    ? path.split('/html/')[0]
    : path.replace(/\/[^/]*$/, '/');
  const normalized = base.endsWith('/') ? base : `${base}/`;
  return `${window.location.origin}${normalized}index.html`;
}

function redirectToLogin() {
  clearToken();
  window.location.replace(buildLoginUrl());
}

function getToken() {
  return localStorage.getItem('token');
}

function clearToken() {
  localStorage.removeItem('token');
  localStorage.removeItem('token_exp');
}

async function apiRequest(path, options = {}) {
  const headers = options.headers ? { ...options.headers } : {};
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const resp = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  if (resp.status === 401) {
    redirectToLogin();
    return;
  }
  if (!resp.ok) {
    let message = '요청에 실패했습니다';
    try {
      const data = await resp.json();
      if (data?.detail) message = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
      else if (data?.message) message = data.message;
      else message = JSON.stringify(data);
    } catch (e) {
      const text = await resp.text();
      if (text) message = text;
    }
    throw new Error(message);
  }
  if (resp.status === 204) return null;
  return await resp.json();
}

export { API_BASE_URL, apiRequest, getToken, clearToken, redirectToLogin };
