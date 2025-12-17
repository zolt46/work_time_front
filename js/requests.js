// File: /ui/js/requests.js
import { apiRequest } from './api.js';

let shiftCache = null;

async function ensureShifts() {
  if (!shiftCache) {
    shiftCache = await apiRequest('/schedule/shifts');
  }
  return shiftCache;
}

function shiftLabel(shiftId) {
  if (!shiftCache) return shiftId;
  const shift = shiftCache.find((s) => s.id === shiftId);
  return shift ? `${shift.name} (${shift.start_time}~${shift.end_time})` : shiftId;
}

async function submitRequest(event) {
  event.preventDefault();
  const type = document.getElementById('req-type').value;
  const target_date = document.getElementById('req-date').value;
  const target_shift_id = document.getElementById('req-shift').value;
  const reason = document.getElementById('req-reason').value;
  try {
    await apiRequest('/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, target_date, target_shift_id, reason })
    });
    alert('요청이 접수되었습니다');
    await loadMyRequests();
  } catch (e) {
    alert(e.message);
  }
}

async function populateShiftSelect(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;
  const shifts = await ensureShifts();
  select.innerHTML = '';
  shifts.forEach((s) => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `${s.name} (${s.start_time}~${s.end_time})`;
    select.appendChild(opt);
  });
}

async function loadMyRequests() {
  const list = document.getElementById('my-requests');
  if (!list) return;
  const data = await apiRequest('/requests/my');
  await ensureShifts();
  list.innerHTML = '';
  data.forEach((r) => {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${r.type}</strong> - ${r.target_date} · ${shiftLabel(r.target_shift_id)} <span class="badge">${r.status}</span>`;
    if (r.reason) {
      const reason = document.createElement('div');
      reason.className = 'muted small';
      reason.textContent = r.reason;
      li.appendChild(reason);
    }
    list.appendChild(li);
  });
}

async function loadPendingRequests() {
  const tbody = document.getElementById('pending-requests-body');
  if (!tbody) return;
  const [data, users] = await Promise.all([
    apiRequest('/requests/pending'),
    apiRequest('/users')
  ]);
  await ensureShifts();
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
  tbody.innerHTML = '';
  data.forEach((r) => {
    const requester = userMap[r.user_id];
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${requester ? requester.name : r.user_id}</td><td>${r.type}</td><td>${r.target_date}</td><td>${shiftLabel(r.target_shift_id)}</td><td>${r.status}</td>`;
    const tdAction = document.createElement('td');
    const approve = document.createElement('button');
    approve.textContent = '승인';
    approve.className = 'btn secondary tiny';
    approve.onclick = () => act(r.id, 'approve');
    const reject = document.createElement('button');
    reject.textContent = '거절';
    reject.className = 'btn muted tiny';
    reject.onclick = () => act(r.id, 'reject');
    tdAction.appendChild(approve);
    tdAction.appendChild(reject);
    tr.appendChild(tdAction);
    tbody.appendChild(tr);
  });
}

async function act(id, action) {
  await apiRequest(`/requests/${id}/${action}`, { method: 'POST' });
  await loadPendingRequests();
}

export { submitRequest, loadMyRequests, loadPendingRequests, populateShiftSelect };
