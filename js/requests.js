// File: /ui/js/requests.js
import { apiRequest } from './api.js';

const days = ['월', '화', '수', '목', '금', '토', '일'];
let shiftCache = null;
let selectedRequestSlot = null;
let selectedRequestKey = null;

function setShiftCache(shifts) {
  shiftCache = shifts;
}

async function ensureShifts() {
  if (!shiftCache) {
    shiftCache = await apiRequest('/schedule/shifts');
  }
  return shiftCache;
}

function shiftLabel(shiftId) {
  if (!shiftCache) return shiftId;
  const shift = shiftCache.find((s) => s.id === shiftId);
  return shift ? `${shift.weekday !== undefined ? days[shift.weekday] + ' ' : ''}${shift.start_time}~${shift.end_time}` : shiftId;
}

function typeLabel(type) {
  return type === 'ABSENCE' ? '결근' : '추가 근무';
}

function createSlotGrid(containerId, onSelect) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  const headerBlank = document.createElement('div');
  headerBlank.className = 'slot-header';
  container.appendChild(headerBlank);
  days.forEach((day) => {
    const h = document.createElement('div');
    h.className = 'slot-header';
    h.textContent = day;
    container.appendChild(h);
  });
  const hours = Array.from({ length: 15 }, (_, i) => 8 + i);
  hours.forEach((hour) => {
    const label = document.createElement('div');
    label.className = 'slot-header';
    label.textContent = `${hour}:00`;
    container.appendChild(label);
    days.forEach((_, weekday) => {
      const key = `${weekday}-${hour}`;
      const cell = document.createElement('div');
      cell.className = 'slot-cell';
      cell.title = `${days[weekday]} ${hour}:00-${hour + 1}:00`;
      cell.addEventListener('click', () => {
        if (selectedRequestKey === key) {
          selectedRequestKey = null;
          container.querySelectorAll('.slot-cell').forEach((c) => c.classList.remove('selected'));
          onSelect(null);
          return;
        }
        selectedRequestKey = key;
        container.querySelectorAll('.slot-cell').forEach((c) => c.classList.remove('selected'));
        cell.classList.add('selected');
        onSelect({ weekday, hour });
      });
      container.appendChild(cell);
    });
  });
}

async function ensureSlot(weekday, hour) {
  const payload = {
    weekday,
    start_time: `${hour.toString().padStart(2, '0')}:00`,
    end_time: `${(hour + 1).toString().padStart(2, '0')}:00`
  };
  const shift = await apiRequest('/schedule/slots/ensure', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (shiftCache) {
    const exists = shiftCache.find((s) => s.id === shift.id);
    if (!exists) shiftCache.push(shift);
  }
  return shift;
}

async function submitRequest(event) {
  event.preventDefault();
  const type = document.getElementById('req-type').value;
  const target_date = document.getElementById('req-date').value;
  const reason = (document.getElementById('req-reason').value || '').trim();
  const targetUserSelect = document.getElementById('req-user');
  const user_id = targetUserSelect && targetUserSelect.value ? targetUserSelect.value : null;

  if (!selectedRequestSlot) {
    alert('시간표에서 1시간 슬롯을 선택하세요.');
    return;
  }
  if (!reason) {
    alert('사유를 입력하세요.');
    return;
  }
  if (target_date) {
    const d = new Date(target_date);
    const weekdayFromDate = (d.getDay() + 6) % 7; // JS 일요일=0 -> 월요일=0 로 변환
    if (weekdayFromDate !== selectedRequestSlot.weekday) {
      alert('선택한 날짜의 요일과 시간표 슬롯의 요일이 다릅니다. 날짜를 다시 선택하세요.');
      return;
    }
  }
  try {
    const shift = await ensureSlot(selectedRequestSlot.weekday, selectedRequestSlot.hour);
    await apiRequest('/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, target_date, target_shift_id: shift.id, reason, user_id })
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
    li.innerHTML = `<strong>${typeLabel(r.type)}</strong> - ${r.target_date} · ${shiftLabel(r.target_shift_id)} <span class="badge">${r.status}</span>`;
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
    tr.innerHTML = `<td>${requester ? requester.name : r.user_id}</td><td>${typeLabel(r.type)}</td><td>${r.target_date}</td><td>${shiftLabel(r.target_shift_id)}</td><td>${r.reason || ''}</td><td>${r.status}</td>`;
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

async function loadRequestUsers() {
  const wrapper = document.getElementById('req-user-wrapper');
  const select = document.getElementById('req-user');
  if (!wrapper || !select) return;
  const users = await apiRequest('/users');
  wrapper.style.display = 'block';
  select.innerHTML = '<option value="">내 계정 선택</option>';
  users.forEach((u) => {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = `${u.name} (${u.identifier || u.role})`;
    select.appendChild(opt);
  });
}

function initSlotSelection() {
  createSlotGrid('req-slot-grid', (slot) => {
    selectedRequestSlot = slot;
    const preview = document.getElementById('req-slot-preview');
    if (preview) {
      preview.textContent = slot
        ? `${days[slot.weekday]} ${slot.hour}:00-${slot.hour + 1}:00 슬롯 선택됨`
        : '요일·시간을 클릭해 슬롯을 선택하세요.';
    }
  });
}

async function initRequestPage(currentUser) {
  await ensureShifts();
  initSlotSelection();
  if (currentUser && currentUser.role !== 'MEMBER') {
    await loadRequestUsers();
  }
  await loadMyRequests();
  const form = document.getElementById('request-form');
  if (form) form.addEventListener('submit', submitRequest);
}

export { submitRequest, loadMyRequests, loadPendingRequests, initRequestPage, setShiftCache };
