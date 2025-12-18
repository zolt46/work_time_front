// File: /ui/js/admin.js
import { apiRequest } from './api.js';

const roleLabel = {
  MASTER: '마스터',
  OPERATOR: '운영자',
  MEMBER: '구성원'
};

let selectedMember = null;
let editorOptions = { allowCredentialEdit: false };
const assignGridCells = new Map();
let assignedSlots = new Set();
let selectedAssignSlots = new Set();
const days = ['월', '화', '수', '목', '금', '토', '일'];
const hours = Array.from({ length: 15 }, (_, i) => 8 + i);

function weekStart(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const diff = (d.getDay() + 6) % 7;
  const start = new Date(d);
  start.setDate(d.getDate() - diff);
  return start.toISOString().slice(0, 10);
}

function setButtonLoading(btn, isLoading, text) {
  if (!btn) return;
  btn.disabled = isLoading;
  btn.classList.toggle('loading', isLoading);
  if (text) btn.textContent = text;
}

function setEditForm(member) {
  selectedMember = member;
  const idInput = document.getElementById('edit-id');
  const nameInput = document.getElementById('edit-name');
  const identInput = document.getElementById('edit-identifier');
  const roleSelect = document.getElementById('edit-role');
  const activeSelect = document.getElementById('edit-active');
  const saveBtn = document.getElementById('edit-save');
  const loginInput = document.getElementById('edit-login');
  const pwInput = document.getElementById('edit-password');
  if (idInput) idInput.value = member.id;
  if (nameInput) nameInput.value = member.name || '';
  if (identInput) identInput.value = member.identifier || '';
  if (roleSelect) roleSelect.value = member.role;
  if (activeSelect) activeSelect.value = member.active ? 'true' : 'false';
  if (loginInput) loginInput.value = member.auth_account?.login_id || '';
  if (pwInput) pwInput.value = '';
  if (pwInput) pwInput.disabled = !editorOptions.allowCredentialEdit;
  if (saveBtn) saveBtn.disabled = false;
  const detail = document.getElementById('member-detail');
  if (detail) {
    const lastLogin = member.auth_account?.last_login_at ? new Date(member.auth_account.last_login_at).toLocaleString() : '기록 없음';
    detail.innerHTML = `
      <strong>선택됨:</strong> ${member.name} / ${roleLabel[member.role] || member.role}<br />
      개인 ID: ${member.identifier || '-'} · 로그인 ID: ${member.auth_account?.login_id || '-'}<br />
      상태: ${member.active ? '활성' : '비활성'} · 최근 로그인: ${lastLogin}<br />
      비밀번호는 해시로 저장되어 조회할 수 없습니다. 필요 시 새 임시 비밀번호로 재설정해 전달하세요.
    `;
  }
}

function clearEditForm() {
  selectedMember = null;
  ['edit-id', 'edit-name', 'edit-identifier'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const roleSelect = document.getElementById('edit-role');
  const activeSelect = document.getElementById('edit-active');
  const saveBtn = document.getElementById('edit-save');
  const loginInput = document.getElementById('edit-login');
  const pwInput = document.getElementById('edit-password');
  if (roleSelect) roleSelect.value = 'MEMBER';
  if (activeSelect) activeSelect.value = 'true';
  if (loginInput) loginInput.value = '';
  if (pwInput) pwInput.value = '';
  if (saveBtn) saveBtn.disabled = true;
  const detail = document.getElementById('member-detail');
  if (detail) detail.textContent = '테이블에서 구성원을 선택하면 상세 정보가 표시됩니다.';
}

async function loadMembers() {
  const tbody = document.getElementById('member-table-body');
  if (!tbody) return;
  const members = await apiRequest('/users');
  tbody.innerHTML = '';
  members.forEach((m) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${m.name}</td><td>${roleLabel[m.role] || m.role}</td><td>${m.identifier || ''}</td><td>${m.auth_account?.login_id || ''}</td><td>${m.active ? '활성' : '비활성'}</td>`;
    const actions = document.createElement('td');

    const editBtn = document.createElement('button');
    editBtn.textContent = '선택';
    editBtn.className = 'btn tiny';
    editBtn.onclick = () => setEditForm(m);
    actions.appendChild(editBtn);

    const delBtn = document.createElement('button');
    delBtn.textContent = '삭제';
    delBtn.className = 'btn tiny muted';
    delBtn.onclick = () => deleteMember(m);
    actions.appendChild(delBtn);

    tr.appendChild(actions);
    tr.addEventListener('click', () => setEditForm(m));
    tbody.appendChild(tr);
  });
}

async function deleteMember(member) {
  if (!confirm(`${member.name} 계정을 삭제하시겠습니까?`)) return;
  await apiRequest(`/users/${member.id}`, { method: 'DELETE' });
  await loadMembers();
}

async function createMember(event) {
  event.preventDefault();
  const submitBtn = event.target.querySelector('button[type="submit"]');
  setButtonLoading(submitBtn, true, '생성 중...');
  const payload = {
    name: document.getElementById('member-name').value,
    identifier: document.getElementById('member-identifier').value,
    login_id: document.getElementById('member-login').value,
    password: document.getElementById('member-password').value || 'Temp123!@',
    role: document.getElementById('member-role').value
  };
  try {
    await apiRequest('/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    await loadMembers();
    await loadUserOptions('assign-user');
    event.target.reset();
    alert('구성원이 생성되었습니다. 임시 비밀번호를 전달하세요.');
  } catch (e) {
    alert(e.message || '구성원 생성 중 오류가 발생했습니다.');
  } finally {
    setButtonLoading(submitBtn, false, '구성원 생성');
  }
}

function initMemberEditor(currentUser) {
  editorOptions.allowCredentialEdit = currentUser?.role === 'MASTER';
  const form = document.getElementById('member-edit-form');
  const cancelBtn = document.getElementById('edit-cancel');
  if (cancelBtn) cancelBtn.addEventListener('click', () => clearEditForm());
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedMember) {
      alert('수정할 구성원을 먼저 선택하세요.');
      return;
    }
    const payload = {
      name: document.getElementById('edit-name').value,
      identifier: document.getElementById('edit-identifier').value,
      role: document.getElementById('edit-role').value,
      active: document.getElementById('edit-active').value === 'true'
    };
    const login_id = document.getElementById('edit-login')?.value;
    const new_password = document.getElementById('edit-password')?.value;
    try {
      setButtonLoading(document.getElementById('edit-save'), true, '저장 중...');
      await apiRequest(`/users/${selectedMember.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (editorOptions.allowCredentialEdit && (login_id || new_password)) {
        await apiRequest(`/users/${selectedMember.id}/credentials`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ new_login_id: login_id || null, new_password: new_password || null })
        });
      }
      await loadMembers();
      clearEditForm();
    } catch (e) {
      alert(e.message);
    } finally {
      setButtonLoading(document.getElementById('edit-save'), false, '수정 내용 저장');
    }
  });
}

async function loadUserOptions(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;
  const users = await apiRequest('/users');
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

function buildAssignSlotGrid() {
  const grid = document.getElementById('assign-slot-grid');
  const preview = document.getElementById('assign-slot-preview');
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
    label.className = 'slot-header';
    label.textContent = `${hour}:00`;
    grid.appendChild(label);
    days.forEach((_, weekday) => {
      const key = `${weekday}-${hour}`;
      const cell = document.createElement('div');
      cell.className = 'slot-cell';
      cell.title = `${days[weekday]} ${hour}:00-${hour + 1}:00`;
      cell.addEventListener('click', () => {
        if (assignedSlots.has(key)) {
          alert('이미 배정된 슬롯입니다. 먼저 기존 배정을 정리하거나 다른 시간대를 선택하세요.');
          return;
        }
        if (selectedAssignSlots.has(key)) {
          selectedAssignSlots.delete(key);
          cell.classList.remove('selected');
        } else {
          selectedAssignSlots.add(key);
          cell.classList.add('selected');
        }
        updateAssignPreview();
      });
      grid.appendChild(cell);
      assignGridCells.set(key, cell);
    });
  });
  updateAssignPreview();
}

function clearAssignSelection() {
  selectedAssignSlots.clear();
  assignGridCells.forEach((cell) => cell.classList.remove('selected'));
  const preview = document.getElementById('assign-slot-preview');
  if (preview) preview.textContent = '요일·시간 칸을 터치하여 배정할 슬롯을 선택하세요.';
}

function updateAssignPreview() {
  const preview = document.getElementById('assign-slot-preview');
  if (!preview) return;
  if (!selectedAssignSlots.size) {
    preview.textContent = '요일·시간 칸을 터치하여 배정할 슬롯을 선택하세요.';
    return;
  }
  const selectedTexts = Array.from(selectedAssignSlots).map((k) => {
    const [w, h] = k.split('-').map(Number);
    return `${days[w]} ${h}:00-${h + 1}:00`;
  });
  preview.textContent = `${selectedTexts.length}개 슬롯 선택: ${selectedTexts.join(', ')}`;
}

async function refreshAssignedSlotsForUser() {
  assignedSlots.clear();
  assignGridCells.forEach((cell) => cell.classList.remove('assigned'));
  clearAssignSelection();
  const user_id = document.getElementById('assign-user')?.value;
  if (!user_id) return;
  const from = document.getElementById('assign-from')?.value || new Date().toISOString().slice(0, 10);
  const params = new URLSearchParams({ start: weekStart(from), user_id });
  try {
    const events = await apiRequest(`/schedule/weekly_view?${params.toString()}`);
    events.forEach((ev) => {
      const weekday = (new Date(ev.date).getDay() + 6) % 7;
      const startHour = parseInt(ev.start_time.split(':')[0], 10);
      const endHour = parseInt(ev.end_time.split(':')[0], 10);
      for (let h = startHour; h < endHour; h++) {
        const key = `${weekday}-${h}`;
        assignedSlots.add(key);
        const cell = assignGridCells.get(key);
        if (cell) cell.classList.add('assigned');
      }
    });
  } catch (e) {
    console.error('배정 슬롯 불러오기 실패', e);
  }
}

async function assignShift(event) {
  event.preventDefault();
  if (!selectedAssignSlots.size) {
    alert('요일·시간 슬롯을 선택하세요.');
    return;
  }
  const user_id = document.getElementById('assign-user').value;
  const valid_from = document.getElementById('assign-from').value;
  const valid_to = document.getElementById('assign-to').value || null;
  const submitBtn = event.target.querySelector('button[type="submit"]');
  setButtonLoading(submitBtn, true, '배정 중...');
  for (const key of selectedAssignSlots) {
    const [weekday, hour] = key.split('-').map(Number);
    const payload = { user_id, weekday, start_hour: hour, valid_from, valid_to };
    try {
      await apiRequest('/schedule/slots/assign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    } catch (e) {
      alert(e.message);
      break;
    }
  }
  alert('선택한 슬롯이 배정되었습니다');
  await refreshAssignedSlotsForUser();
  clearAssignSelection();
  setButtonLoading(submitBtn, false, '선택 슬롯 배정');
}

export { loadMembers, createMember, assignShift, loadUserOptions, buildAssignSlotGrid, initMemberEditor, refreshAssignedSlotsForUser };
