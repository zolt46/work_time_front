// File: /ui/js/admin.js
import { apiRequest } from './api.js';

const roleLabel = {
  MASTER: '마스터',
  OPERATOR: '운영자',
  MEMBER: '구성원'
};

const days = ['월', '화', '수', '목', '금', '토', '일'];
const hours = Array.from({ length: 9 }, (_, i) => 9 + i); // 09~17시(끝은 18시)

let members = [];
let selectedMember = null;
let currentUser = null;
let editorOptions = { allowCredentialEdit: false };

const assignGridCells = new Map();
let assignedSlots = new Set();
let selectedAssignSlots = new Set();

// ---------------------- 공통 유틸 ----------------------
function setButtonLoading(btn, isLoading, text) {
  if (!btn) return;
  btn.disabled = isLoading;
  btn.classList.toggle('loading', isLoading);
  if (text) btn.textContent = text;
}

function formatDate(dateStr) {
  if (!dateStr) return '기록 없음';
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? dateStr : date.toLocaleString();
}

// ---------------------- 구성원 관리 ----------------------
function applyMemberFilters(list) {
  const keyword = (document.getElementById('member-search')?.value || '').toLowerCase();
  const roleFilter = document.getElementById('member-filter-role')?.value || '';
  const activeFilter = document.getElementById('member-filter-active')?.value || '';
  return list.filter((m) => {
    const matchesKeyword =
      !keyword ||
      m.name.toLowerCase().includes(keyword) ||
      (m.identifier || '').toLowerCase().includes(keyword) ||
      (m.auth_account?.login_id || '').toLowerCase().includes(keyword);
    const matchesRole = !roleFilter || m.role === roleFilter;
    const matchesActive =
      !activeFilter ||
      (activeFilter === 'active' && m.active) ||
      (activeFilter === 'inactive' && !m.active);
    return matchesKeyword && matchesRole && matchesActive;
  });
}

function renderMembers() {
  const tbody = document.getElementById('member-table-body');
  const count = document.getElementById('member-count');
  if (!tbody) return;
  tbody.innerHTML = '';
  const filtered = applyMemberFilters(members);
  filtered.forEach((m) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${m.name}</td><td>${roleLabel[m.role] || m.role}</td><td>${m.identifier || '-'}</td><td>${m.auth_account?.login_id || '-'}</td><td>${m.active ? '활성' : '비활성'}</td><td>${formatDate(m.auth_account?.last_login_at)}</td>`;
    if (selectedMember?.id === m.id) tr.classList.add('selected');
    tr.addEventListener('click', () => setMemberForm(m));
    tbody.appendChild(tr);
  });
  if (count) count.textContent = `${filtered.length}명 표시 / 전체 ${members.length}명`;
}

function configureRoleSelect() {
  const roleSelect = document.getElementById('edit-role');
  if (!roleSelect || !currentUser) return;
  const isMaster = currentUser.role === 'MASTER';
  roleSelect.querySelectorAll('option').forEach((opt) => {
    const allowed = isMaster || opt.value === 'MEMBER';
    opt.disabled = !allowed;
  });
  roleSelect.disabled = !isMaster;
}

function updateCredentialInputs() {
  const loginInput = document.getElementById('edit-login');
  const pwInput = document.getElementById('edit-password');
  const hint = document.getElementById('member-hint');
  const canEditCredential = editorOptions.allowCredentialEdit || !selectedMember;
  if (loginInput) loginInput.disabled = selectedMember ? !canEditCredential : false;
  if (pwInput) {
    pwInput.disabled = selectedMember ? !canEditCredential : false;
    pwInput.required = !selectedMember; // 신규 생성 시에는 필수
  }
  if (hint) {
    hint.textContent = canEditCredential
      ? '저장된 비밀번호는 보이지 않습니다. 필요할 때 새 임시 비밀번호로 재설정하세요.'
      : '로그인 ID/비밀번호 수정은 마스터만 가능합니다. 신규 생성 시에는 입력 가능합니다.';
  }
}

function renderMemberDetail(member) {
  const detail = document.getElementById('member-detail');
  const modeLabel = document.getElementById('member-form-mode');
  if (!detail || !modeLabel) return;
  if (!member) {
    modeLabel.textContent = '신규 구성원 추가';
    detail.textContent = '선택된 구성원이 없습니다. 새 입력을 진행하세요.';
    return;
  }
  modeLabel.textContent = `선택됨: ${member.name}`;
  const lastLogin = formatDate(member.auth_account?.last_login_at);
  detail.innerHTML = `
    <strong>${member.name}</strong> · ${roleLabel[member.role] || member.role}<br />
    개인 ID: ${member.identifier || '-'} · 로그인 ID: ${member.auth_account?.login_id || '-'}<br />
    상태: ${member.active ? '활성' : '비활성'} · 최근 로그인: ${lastLogin}
  `;
}

function resetMemberForm() {
  selectedMember = null;
  const form = document.getElementById('member-combined-form');
  if (!form) return;
  form.reset();
  const activeSelect = document.getElementById('edit-active');
  if (activeSelect) activeSelect.value = 'true';
  configureRoleSelect();
  updateCredentialInputs();
  renderMemberDetail(null);
  renderMembers();
}

function setMemberForm(member) {
  selectedMember = member;
  const idInput = document.getElementById('edit-id');
  const nameInput = document.getElementById('edit-name');
  const identInput = document.getElementById('edit-identifier');
  const roleSelect = document.getElementById('edit-role');
  const activeSelect = document.getElementById('edit-active');
  const loginInput = document.getElementById('edit-login');
  const pwInput = document.getElementById('edit-password');
  if (idInput) idInput.value = member.id;
  if (nameInput) nameInput.value = member.name || '';
  if (identInput) identInput.value = member.identifier || '';
  if (roleSelect) roleSelect.value = member.role;
  if (activeSelect) activeSelect.value = member.active ? 'true' : 'false';
  if (loginInput) loginInput.value = member.auth_account?.login_id || '';
  if (pwInput) pwInput.value = '';
  configureRoleSelect();
  updateCredentialInputs();
  renderMemberDetail(member);
  renderMembers();
}

async function loadMembers() {
  members = await apiRequest('/users');
  const selected = selectedMember ? members.find((m) => m.id === selectedMember.id) : null;
  if (selected) {
    setMemberForm(selected);
  } else {
    renderMembers();
  }
}

async function saveMember(event) {
  event.preventDefault();
  const submitBtn = document.getElementById('edit-save');
  setButtonLoading(submitBtn, true, '저장 중...');
  const payload = {
    name: document.getElementById('edit-name').value,
    identifier: document.getElementById('edit-identifier').value,
    role: document.getElementById('edit-role').value,
    active: document.getElementById('edit-active').value === 'true'
  };
  const login_id = document.getElementById('edit-login').value;
  const new_password = document.getElementById('edit-password').value;

  try {
    let saved;
    if (!selectedMember) {
      if (!new_password) {
        throw new Error('신규 구성원 비밀번호를 입력하세요.');
      }
      saved = await apiRequest('/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, login_id, password: new_password })
      });
      alert('구성원이 생성되었습니다. 임시 비밀번호를 전달하세요.');
    } else {
      saved = await apiRequest(`/users/${selectedMember.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (editorOptions.allowCredentialEdit && (login_id || new_password)) {
        saved = await apiRequest(`/users/${selectedMember.id}/credentials`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            new_login_id: login_id || null,
            new_password: new_password || null
          })
        });
      }
      alert('구성원 정보가 업데이트되었습니다.');
    }
    await loadMembers();
    const latest = members.find((m) => m.id === saved.id);
    if (latest) setMemberForm(latest);
  } catch (e) {
    alert(e.message || '처리에 실패했습니다.');
  } finally {
    setButtonLoading(submitBtn, false, '저장');
  }
}

function bindMemberEvents() {
  document.getElementById('member-combined-form')?.addEventListener('submit', saveMember);
  document.getElementById('member-new')?.addEventListener('click', resetMemberForm);
  document.getElementById('member-refresh')?.addEventListener('click', loadMembers);
  document.getElementById('edit-cancel')?.addEventListener('click', resetMemberForm);
  ['member-search', 'member-filter-role', 'member-filter-active'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', renderMembers);
  });
}

async function initMemberPage(user) {
  currentUser = user;
  editorOptions.allowCredentialEdit = user?.role === 'MASTER';
  configureRoleSelect();
  updateCredentialInputs();
  bindMemberEvents();
  resetMemberForm();
  await loadMembers();
}

// ---------------------- 근무 배정 ----------------------
function slotsToRanges(slotKeys) {
  const grouped = new Map();
  slotKeys.forEach((key) => {
    const [weekday, hour] = key.split('-').map(Number);
    if (!grouped.has(weekday)) grouped.set(weekday, []);
    grouped.get(weekday).push(hour);
  });
  const ranges = [];
  grouped.forEach((hoursList, weekday) => {
    const sorted = hoursList.sort((a, b) => a - b);
    let start = sorted[0];
    let prev = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === prev + 1) {
        prev = sorted[i];
        continue;
      }
      ranges.push({ weekday, start_hour: start, end_hour: prev + 1 });
      start = prev = sorted[i];
    }
    ranges.push({ weekday, start_hour: start, end_hour: prev + 1 });
  });
  return ranges;
}

function clearAssignSelection() {
  selectedAssignSlots.clear();
  assignGridCells.forEach((cell) => cell.classList.remove('selected'));
  const preview = document.getElementById('assign-slot-preview');
  if (preview) preview.textContent = '요일·시간 칸을 눌러 근무 시간을 선택하세요.';
}

function updateAssignPreview() {
  const preview = document.getElementById('assign-slot-preview');
  if (!preview) return;
  if (!selectedAssignSlots.size) {
    preview.textContent = '요일·시간 칸을 눌러 근무 시간을 선택하세요.';
    return;
  }
  const ranges = slotsToRanges(selectedAssignSlots);
  const texts = ranges.map((r) => `${days[r.weekday]} ${String(r.start_hour).padStart(2, '0')}:00~${String(r.end_hour).padStart(2, '0')}:00`);
  preview.textContent = `${ranges.length}개 구간: ${texts.join(', ')}`;
}

function buildAssignSlotGrid() {
  const grid = document.getElementById('assign-slot-grid');
  if (!grid) return;
  grid.innerHTML = '';
  assignGridCells.clear();

  const headerBlank = document.createElement('div');
  headerBlank.className = 'slot-header';
  grid.appendChild(headerBlank);
  days.forEach((day) => {
    const h = document.createElement('div');
    h.className = 'slot-header';
    h.textContent = day;
    grid.appendChild(h);
  });
  hours.forEach((hour) => {
    const label = document.createElement('div');
    label.className = 'slot-header slot-header-time';
    label.textContent = `${hour}:00`;
    grid.appendChild(label);
    days.forEach((_, weekday) => {
      const key = `${weekday}-${hour}`;
      const cell = document.createElement('div');
      cell.className = 'slot-cell';
      cell.title = `${days[weekday]} ${hour}:00-${hour + 1}:00`;
      cell.addEventListener('click', () => {
        if (selectedAssignSlots.has(key)) {
          selectedAssignSlots.delete(key);
          cell.classList.remove('selected', 'assigned');
        } else {
          selectedAssignSlots.add(key);
          cell.classList.add('selected');
          if (assignedSlots.has(key)) cell.classList.add('assigned');
        }
        updateAssignPreview();
      });
      grid.appendChild(cell);
      assignGridCells.set(key, cell);
    });
  });
  updateAssignPreview();
}

async function loadUserOptions(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;
  const users = members.length ? members : await apiRequest('/users');
  select.innerHTML = '<option value="">대상 선택</option>';
  users
    .filter((u) => u.role === 'MEMBER')
    .forEach((u) => {
      const opt = document.createElement('option');
      opt.value = u.id;
      opt.textContent = `${u.name} (${u.identifier || '개인 ID 없음'})`;
      select.appendChild(opt);
    });
}

function applyAssignedState() {
  assignGridCells.forEach((cell) => cell.classList.remove('assigned', 'selected'));
  selectedAssignSlots.forEach((key) => {
    const cell = assignGridCells.get(key);
    if (cell) {
      cell.classList.add('assigned');
      cell.classList.add('selected');
    }
  });
  updateAssignPreview();
}

async function refreshAssignedSlotsForUser() {
  assignedSlots = new Set();
  selectedAssignSlots = new Set();
  applyAssignedState();
  const user_id = document.getElementById('assign-user')?.value;
  if (!user_id) {
    clearAssignSelection();
    return;
  }
  const from = document.getElementById('assign-from')?.value || new Date().toISOString().slice(0, 10);
  const params = new URLSearchParams({ start: weekStart(from), user_id });
  try {
    const events = await apiRequest(`/schedule/weekly_view?${params.toString()}`);
    events.forEach((ev) => {
      const weekday = (new Date(ev.date).getDay() + 6) % 7;
      const startHour = parseInt(ev.start_time.split(':')[0], 10);
      const endHour = parseInt(ev.end_time.split(':')[0], 10);
      for (let h = Math.max(9, startHour); h < Math.min(18, endHour); h++) {
        const key = `${weekday}-${h}`;
        assignedSlots.add(key);
        selectedAssignSlots.add(key);
      }
    });
    applyAssignedState();
  } catch (e) {
    console.error('배정 슬롯 불러오기 실패', e);
  }
}

function weekStart(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const diff = (d.getDay() + 6) % 7;
  const start = new Date(d);
  start.setDate(d.getDate() - diff);
  return start.toISOString().slice(0, 10);
}

async function assignShift(event) {
  event.preventDefault();
  if (!selectedAssignSlots.size) {
    alert('요일·시간 슬롯을 최소 1개 이상 선택하세요.');
    return;
  }
  const user_id = document.getElementById('assign-user').value;
  const valid_from = document.getElementById('assign-from').value;
  const valid_to = document.getElementById('assign-to').value || null;
  if (!user_id) {
    alert('근무를 배정할 구성원을 선택하세요.');
    return;
  }
  if (!valid_from) {
    alert('적용 시작일을 입력하세요.');
    return;
  }
  const submitBtn = event.target.querySelector('button[type="submit"]');
  setButtonLoading(submitBtn, true, '배정 중...');
  const slots = slotsToRanges(selectedAssignSlots).map((r) => ({
    weekday: r.weekday,
    start_hour: r.start_hour,
    end_hour: r.end_hour
  }));
  try {
    await apiRequest('/schedule/slots/bulk_assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id, valid_from, valid_to, slots })
    });
    alert('선택한 근무 시간이 저장되었습니다.');
    await refreshAssignedSlotsForUser();
  } catch (e) {
    alert(e.message || '근무 배정 중 오류가 발생했습니다.');
  } finally {
    setButtonLoading(submitBtn, false, '선택 슬롯 배정');
  }
}

export { initMemberPage, assignShift, loadUserOptions, buildAssignSlotGrid, refreshAssignedSlotsForUser };
