import { apiRequest } from './api.js';

const days = ['월', '화', '수', '목', '금', '토', '일'];
const hours = Array.from({ length: 9 }, (_, i) => 9 + i); // 09~18시

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientNetworkError(err) {
  const msg = (err?.message || '').toLowerCase();
  return err instanceof TypeError || msg.includes('failed to fetch') || msg.includes('network');
}

async function apiRequestWithRetry(path, options = {}, { retries = 1, delayMs = 500 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await apiRequest(path, options);
    } catch (err) {
      lastError = err;
      if (!isTransientNetworkError(err) || attempt === retries) throw err;
      await sleep(delayMs * (attempt + 1));
    }
  }
  throw lastError;
}

function parseDateValue(dateStr) {
  if (!dateStr) return new Date();
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function formatDateOnly(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

let shiftCache = null;
let slotCells = new Map();
let selectedSlots = new Set();
let assignedSlots = new Set();
let slotShiftMap = new Map();
let currentUser = null;

const statusLabel = {
  PENDING: '대기',
  APPROVED: '승인',
  REJECTED: '거절',
  CANCELLED: '취소'
};

function setShiftCache(shifts) {
  shiftCache = shifts;
}

async function ensureShifts() {
  if (!shiftCache) {
    shiftCache = await apiRequest('/schedule/shifts');
  }
  return shiftCache;
}

function getWeekStart(dateStr) {
  const d = parseDateValue(dateStr);
  const day = d.getDay(); // Sun=0
  const diff = (day + 6) % 7; // Mon=0
  const start = new Date(d);
  start.setDate(d.getDate() - diff);
  return formatDateOnly(start);
}

function shiftLabel(shiftId) {
  if (!shiftCache) return shiftId;
  const shift = shiftCache.find((s) => s.id === shiftId);
  return shift ? `${days[shift.weekday]} ${shift.start_time}~${shift.end_time}` : shiftId;
}

function formatRequestTime(req) {
  if (req.target_start_time && req.target_end_time) {
    const start = req.target_start_time.slice(0, 5);
    const end = req.target_end_time.slice(0, 5);
    return `${start}~${end}`;
  }
  return null;
}

function typeLabel(type) {
  return type === 'ABSENCE' ? '결근' : '추가 근무';
}

function slotsToRanges(requireShiftId = false) {
  const grouped = new Map();
  selectedSlots.forEach((key) => {
    const [weekday, hour] = key.split('-').map(Number);
    const shiftId = slotShiftMap.get(key);
    if (!grouped.has(weekday)) grouped.set(weekday, []);
    grouped.get(weekday).push({ hour, shiftId });
  });

  const ranges = [];
  grouped.forEach((entries, weekday) => {
    const sorted = entries.sort((a, b) => a.hour - b.hour);
    let start = sorted[0].hour;
    let prev = sorted[0].hour;
    let currentShift = requireShiftId ? sorted[0].shiftId : null;
    if (requireShiftId && !currentShift) throw new Error('배정되지 않은 시간은 결근으로 신청할 수 없습니다.');
    for (let i = 1; i < sorted.length; i++) {
      const { hour, shiftId } = sorted[i];
      if (requireShiftId && !shiftId) throw new Error('배정되지 않은 시간은 결근으로 신청할 수 없습니다.');
      const sameShift = !requireShiftId || shiftId === currentShift;
      if (hour === prev + 1 && sameShift) {
        prev = hour;
        continue;
      }
      ranges.push({ weekday, start_hour: start, end_hour: prev + 1, shift_id: currentShift });
      start = prev = hour;
      currentShift = requireShiftId ? shiftId : null;
    }
    ranges.push({ weekday, start_hour: start, end_hour: prev + 1, shift_id: requireShiftId ? currentShift : null });
  });
  return ranges;
}

function resetSelection() {
  selectedSlots.clear();
  slotCells.forEach((cell) => cell.classList.remove('selected'));
  updatePreview();
}

function updatePreview() {
  const preview = document.getElementById('req-slot-preview');
  if (!preview) return;
  if (!selectedSlots.size) {
    preview.textContent = '요일·시간 칸을 눌러 여러 슬롯을 선택하세요.';
    return;
  }
  const ranges = slotsToRanges(false);
  const texts = ranges.map((r) => `${days[r.weekday]} ${String(r.start_hour).padStart(2, '0')}:00~${String(r.end_hour).padStart(2, '0')}:00`);
  preview.textContent = `${ranges.length}개 구간: ${texts.join(', ')}`;
}

function applyDayDisable() {
  const dateStr = document.getElementById('req-date').value;
  const activeWeekday = dateStr ? (parseDateValue(dateStr).getDay() + 6) % 7 : null;
  slotCells.forEach((cell, key) => {
    const weekday = Number(key.split('-')[0]);
    const disabled = activeWeekday !== null && weekday !== activeWeekday;
    cell.classList.toggle('disabled', disabled);
  });
}

function onCellClick(key) {
  const cell = slotCells.get(key);
  if (!cell) return;
  if (cell.classList.contains('disabled')) {
    alert('선택한 날짜와 요일이 일치하는 칸만 선택할 수 있습니다.');
    return;
  }
  const type = document.getElementById('req-type').value;
  const isAssigned = assignedSlots.has(key);
  if (type === 'ABSENCE' && !isAssigned) {
    alert('결근 신청은 현재 배정된 시간에서만 가능합니다.');
    return;
  }
  if (type === 'EXTRA' && isAssigned) {
    alert('이미 배정된 시간은 추가 근무로 신청할 수 없습니다.');
    return;
  }
  if (selectedSlots.has(key)) {
    selectedSlots.delete(key);
    cell.classList.remove('selected');
  } else {
    selectedSlots.add(key);
    cell.classList.add('selected');
  }
  updatePreview();
}

function createSlotGrid(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  slotCells = new Map();
  const headerBlank = document.createElement('div');
  headerBlank.className = 'slot-header';
  container.appendChild(headerBlank);
  days.forEach((day) => {
    const h = document.createElement('div');
    h.className = 'slot-header';
    h.textContent = day;
    container.appendChild(h);
  });
  hours.forEach((hour) => {
    const label = document.createElement('div');
    label.className = 'slot-header slot-header-time';
    label.textContent = `${hour}:00`;
    container.appendChild(label);
    days.forEach((_, weekday) => {
      const key = `${weekday}-${hour}`;
      const cell = document.createElement('div');
      cell.className = 'slot-cell';
      cell.title = `${days[weekday]} ${hour}:00-${hour + 1}:00`;
      cell.addEventListener('click', () => onCellClick(key));
      slotCells.set(key, cell);
      container.appendChild(cell);
    });
  });
  applyDayDisable();
}

async function ensureSlotRange(weekday, startHour, endHour) {
  const payload = {
    weekday,
    start_time: `${startHour.toString().padStart(2, '0')}:00`,
    end_time: `${endHour.toString().padStart(2, '0')}:00`
  };
  const shift = await apiRequestWithRetry('/schedule/slots/ensure', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }, { retries: 2, delayMs: 400 });
  if (shiftCache) {
    const exists = shiftCache.find((s) => s.id === shift.id);
    if (!exists) shiftCache.push(shift);
  }
  return shift;
}

function getTargetUserId() {
  const select = document.getElementById('req-user');
  if (select && select.value) return select.value;
  return currentUser?.id;
}

async function refreshAssignedSlots() {
  assignedSlots.clear();
  slotShiftMap.clear();
  slotCells.forEach((cell) => {
    cell.classList.remove('assigned', 'selected');
  });
  selectedSlots.clear();
  updatePreview();

  const userId = getTargetUserId();
  const dateStr = document.getElementById('req-date').value || new Date().toISOString().slice(0, 10);
  if (!userId || !dateStr) {
    applyDayDisable();
    return true;
  }

  const params = new URLSearchParams({ start: getWeekStart(dateStr), user_id: userId });
  try {
    const events = await apiRequest(`/schedule/weekly_view?${params.toString()}`);
    events.forEach((ev) => {
      const dayIndex = (parseDateValue(ev.date).getDay() + 6) % 7;
      const startHour = parseInt(ev.start_time.split(':')[0], 10);
      const endHour = parseInt(ev.end_time.split(':')[0], 10);
      for (let h = Math.max(9, startHour); h < Math.min(18, endHour); h++) {
        const key = `${dayIndex}-${h}`;
        assignedSlots.add(key);
        slotShiftMap.set(key, ev.shift_id);
        const cell = slotCells.get(key);
        if (cell) cell.classList.add('assigned');
      }
    });
  } catch (e) {
    console.error('배정 슬롯 불러오기 실패', e);
    return false;
  }
  applyDayDisable();
  return true;
}

async function submitRequest(event) {
  event.preventDefault();
  const submitBtn = event.target.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.classList.add('loading');
    submitBtn.textContent = '제출 중...';
  }
  const type = document.getElementById('req-type').value;
  const target_date = document.getElementById('req-date').value;
  const reason = (document.getElementById('req-reason').value || '').trim();
  const targetUserSelect = document.getElementById('req-user');
  const user_id = targetUserSelect && targetUserSelect.value ? targetUserSelect.value : null;

  if (!target_date) {
    alert('신청 날짜를 선택하세요.');
    submitBtn?.classList.remove('loading');
    submitBtn && (submitBtn.disabled = false, submitBtn.textContent = '신청 제출');
    return;
  }
  if (!selectedSlots.size) {
    alert('시간표에서 최소 1개 이상의 슬롯을 선택하세요.');
    submitBtn?.classList.remove('loading');
    submitBtn && (submitBtn.disabled = false, submitBtn.textContent = '신청 제출');
    return;
  }
  if (!reason) {
    alert('사유를 입력하세요.');
    submitBtn?.classList.remove('loading');
    submitBtn && (submitBtn.disabled = false, submitBtn.textContent = '신청 제출');
    return;
  }

  const shiftIds = [];
  try {
    const ranges = slotsToRanges(type === 'ABSENCE');
    const targetRanges = [];
    if (type === 'ABSENCE') {
      ranges.forEach((r) => {
        if (!r.shift_id) throw new Error('배정되지 않은 시간은 결근으로 신청할 수 없습니다.');
        shiftIds.push(r.shift_id);
        targetRanges.push({ shift_id: r.shift_id, start_hour: r.start_hour, end_hour: r.end_hour });
      });
    } else {
      for (const r of ranges) {
        const shift = await ensureSlotRange(r.weekday, r.start_hour, r.end_hour);
        shiftIds.push(shift.id);
        targetRanges.push({
          shift_id: shift.id,
          start_hour: parseInt(shift.start_time.split(':')[0], 10),
          end_hour: parseInt(shift.end_time.split(':')[0], 10)
        });
      }
    }
    const uniqueShiftIds = [...new Set(shiftIds)];
    await apiRequestWithRetry('/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, target_date, target_shift_ids: uniqueShiftIds, target_ranges: targetRanges, reason, user_id })
    }, { retries: 2, delayMs: 600 });
    alert('요청이 접수되었습니다.');
    resetSelection();
    const [myLoaded, slotsLoaded] = await Promise.all([
      loadMyRequests(),
      refreshAssignedSlots()
    ]);
    if (!myLoaded || !slotsLoaded) {
      alert('요청은 접수되었으나 화면 갱신에 실패했습니다. 새로고침 후 다시 확인해주세요.');
    }
  } catch (e) {
    alert(e.message);
  } finally {
    if (submitBtn) {
      submitBtn.classList.remove('loading');
      submitBtn.disabled = false;
      submitBtn.textContent = '신청 제출';
    }
  }
}

async function cancelRequest(id) {
  await apiRequest(`/requests/${id}/cancel`, { method: 'POST' });
  await loadMyRequests();
  await refreshAssignedSlots();
}

async function loadMyRequests() {
  const list = document.getElementById('my-requests');
  if (!list) return true;
  const title = list.closest('.card')?.querySelector('.card-title');
  let data;
  const targetUserId = getTargetUserId();
  const params = new URLSearchParams();
  if (currentUser && targetUserId && targetUserId !== currentUser.id) {
    params.set('user_id', targetUserId);
    if (title) title.textContent = '신청 현황 (선택 대상 기준)';
  } else if (title) {
    title.textContent = '내 신청 현황';
  }
  try {
    const path = params.toString() ? `/requests/my?${params.toString()}` : '/requests/my';
    data = await apiRequestWithRetry(path);
  } catch (e) {
    console.error('내 신청 불러오기 실패', e);
    list.innerHTML = '';
    const error = document.createElement('div');
    error.className = 'error';
    error.textContent = `신청 내역을 불러오지 못했습니다. 새로고침 후 다시 시도하세요. (${e.message || e})`;
    list.appendChild(error);
    return false;
  }
  await ensureShifts();
  list.innerHTML = '';
  if (!data.length) {
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.textContent = '접수된 신청이 없습니다.';
    list.appendChild(empty);
    return true;
  }
  data.forEach((r) => {
    const container = document.createElement('div');
    container.className = 'request-row';
    const badge = document.createElement('span');
    badge.className = `badge ${r.status.toLowerCase()}`;
    badge.textContent = statusLabel[r.status] || r.status;
    const header = document.createElement('div');
    header.className = 'request-header';
    const timeLabel = requestTimeLabel(r);
    const shiftText = shiftLabel(r.target_shift_id);
    header.innerHTML = `<strong>${typeLabel(r.type)}</strong> · ${r.target_date} · ${shiftText}${timeLabel ? ' (' + timeLabel + ')' : ''}`;
    header.appendChild(badge);

    const reason = document.createElement('div');
    reason.className = 'small muted';
    const cancelNote = r.cancelled_after_approval ? ' (승인 후 취소됨)' : '';
    const rejectNote = r.status === 'REJECTED' ? ' (거절됨)' : '';
    reason.textContent = `사유: ${r.reason || '-'}${cancelNote || rejectNote}`;
    container.appendChild(header);
    container.appendChild(reason);

    if (r.status === 'PENDING' || r.status === 'APPROVED') {
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn tiny muted';
      cancelBtn.textContent = '신청 취소';
      cancelBtn.onclick = () => {
        if (confirm('해당 신청을 취소하고 기존 상태로 되돌리시겠습니까?')) cancelRequest(r.id);
      };
      container.appendChild(cancelBtn);
    }
    list.appendChild(container);
  });
  return true;
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
    const timeLabel = requestTimeLabel(r);
    const tr = document.createElement('tr');
    const timeText = formatRequestTime(r);
    const shiftText = `${shiftLabel(r.target_shift_id)}${timeText ? ` (${timeText})` : ''}`;
    const statusText = r.status === 'REJECTED' ? '거절/취소' : (statusLabel[r.status] || r.status);
    tr.innerHTML = `<td>${requester ? requester.name : r.user_id}</td><td>${typeLabel(r.type)}</td><td>${r.target_date}</td><td>${shiftText}</td><td>${r.reason || ''}</td><td>${statusText}</td>`;
    const tdAction = document.createElement('td');
    if (r.status === 'CANCELLED') {
      tdAction.textContent = '승인된 후 취소됨';
      tdAction.className = 'muted small';
    } else {
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
    }
    tr.appendChild(tdAction);
    tbody.appendChild(tr);
  });
}

async function act(id, action) {
  await apiRequest(`/requests/${id}/${action}`, { method: 'POST' });
  await loadPendingRequests();
  await loadRequestFeed();
}

async function loadRequestUsers(current) {
  const wrapper = document.getElementById('req-user-wrapper');
  const select = document.getElementById('req-user');
  if (!wrapper || !select) return;
  if (current.role === 'MEMBER') {
    wrapper.style.display = 'none';
    return;
  }
  const users = await apiRequest('/users');
  wrapper.style.display = 'block';
  select.innerHTML = '<option value="">내 계정 선택</option>';
  users
    .filter((u) => u.role === 'MEMBER')
    .forEach((u) => {
      const opt = document.createElement('option');
      opt.value = u.id;
      opt.textContent = `${u.name} (${u.identifier || '개인 ID 없음'})`;
      select.appendChild(opt);
    });
}

function bindFormEvents() {
  const dateInput = document.getElementById('req-date');
  const typeSelect = document.getElementById('req-type');
  const userSelect = document.getElementById('req-user');
  if (dateInput) dateInput.addEventListener('change', refreshAssignedSlots);
  if (typeSelect) typeSelect.addEventListener('change', () => {
    resetSelection();
  });
  if (userSelect) userSelect.addEventListener('change', async () => {
    await refreshAssignedSlots();
    await loadMyRequests();
  });
}

function initSlotSelection() {
  createSlotGrid('req-slot-grid');
  updatePreview();
}

async function initRequestPage(current) {
  currentUser = current;
  await ensureShifts();
  initSlotSelection();
  await refreshAssignedSlots();
  if (currentUser && currentUser.role !== 'MEMBER') {
    await loadRequestUsers(currentUser);
  }
  await loadMyRequests();
  bindFormEvents();
  const form = document.getElementById('request-form');
  if (form) form.addEventListener('submit', submitRequest);
}

async function loadRequestFeed() {
  const tbody = document.getElementById('request-feed-body');
  if (!tbody) return;
  const [data, users] = await Promise.all([
    apiRequest('/requests/feed'),
    apiRequest('/users')
  ]);
  await ensureShifts();
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
  tbody.innerHTML = '';
  data.forEach((r) => {
    const requester = userMap[r.user_id];
    const timeLabel = requestTimeLabel(r);
    const shiftText = `${shiftLabel(r.target_shift_id)}${timeLabel ? ` (${timeLabel})` : ''}`;
    const statusText = statusLabel[r.status] || r.status;
    const statusExtra = r.cancelled_after_approval ? ' (승인 후 취소됨)' : r.status === 'REJECTED' ? ' (거절)' : '';
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${requester ? requester.name : r.user_id}</td><td>${typeLabel(r.type)}</td><td>${r.target_date}</td><td>${shiftText}</td><td>${statusText}${statusExtra}</td><td>${r.reason || ''}</td>`;
    tbody.appendChild(tr);
  });
}

export { submitRequest, loadMyRequests, loadPendingRequests, loadRequestFeed, initRequestPage, setShiftCache };
