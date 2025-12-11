// File: /ui/js/api.js
const API_BASE_URL = "https://work-time-back.onrender.com";

function getToken() {
  return localStorage.getItem('token');
}

async function apiRequest(path, options = {}) {
  const headers = options.headers ? { ...options.headers } : {};
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const resp = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  if (resp.status === 401) {
    window.location.href = '../index.html';
    return;
  }
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(text || 'Request failed');
  }
  if (resp.status === 204) return null;
  return await resp.json();
}

export { API_BASE_URL, apiRequest, getToken };
