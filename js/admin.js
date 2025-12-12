// File: /ui/js/admin.js
import { apiRequest } from './api.js';

async function loadMembers() {
  const tbody = document.getElementById('member-table-body');
  if (!tbody) return;
  const members = await apiRequest('/users');
  tbody.innerHTML = '';
  members.forEach(m => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${m.name}</td><td>${m.identifier || ''}</td><td>${m.role}</td><td>${m.active}</td>`;
    tbody.appendChild(tr);
  });
}

async function createMember(event) {
  event.preventDefault();
  const payload = {
    name: document.getElementById('member-name').value,
    identifier: document.getElementById('member-identifier').value,
    login_id: document.getElementById('member-login').value,
    password: document.getElementById('member-password').value,
    role: document.getElementById('member-role').value
  };
  await apiRequest('/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  await loadMembers();
}

async function createShift(event) {
  event.preventDefault();
  const payload = {
    name: document.getElementById('shift-name').value,
    weekday: parseInt(document.getElementById('shift-weekday').value, 10),
    start_time: document.getElementById('shift-start').value,
    end_time: document.getElementById('shift-end').value,
    location: document.getElementById('shift-location').value
  };
  await apiRequest('/schedule/shifts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  alert('근무가 생성되었습니다');
}

async function assignShift(event) {
  event.preventDefault();
  const payload = {
    user_id: document.getElementById('assign-user').value,
    shift_id: document.getElementById('assign-shift').value,
    valid_from: document.getElementById('assign-from').value,
    valid_to: document.getElementById('assign-to').value || null
  };
  await apiRequest('/schedule/assign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  alert('배정되었습니다');
}

export { loadMembers, createMember, createShift, assignShift };
