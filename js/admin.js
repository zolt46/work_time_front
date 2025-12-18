// File: /ui/js/admin.js
import { apiRequest } from './api.js';

const roleLabel = {
  MASTER: '마스터',
  OPERATOR: '운영자',
  MEMBER: '구성원'
};

let selectedMember = null;

function setEditForm(member) {
  selectedMember = member;
  const idInput = document.getElementById('edit-id');
  const nameInput = document.getElementById('edit-name');
  const identInput = document.getElementById('edit-identifier');
  const roleSelect = document.getElementById('edit-role');
  const activeSelect = document.getElementById('edit-active');
  const saveBtn = document.getElementById('edit-save');
  if (idInput) idInput.value = member.id;
  if (nameInput) nameInput.value = member.name || '';
  if (identInput) identInput.value = member.identifier || '';
  if (roleSelect) roleSelect.value = member.role;
  if (activeSelect) activeSelect.value = member.active ? 'true' : 'false';
  if (saveBtn) saveBtn.disabled = false;
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
  if (roleSelect) roleSelect.value = 'MEMBER';
  if (activeSelect) activeSelect.value = 'true';
  if (saveBtn) saveBtn.disabled = true;
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
  const payload = {
    name: document.getElementById('member-name').value,
    identifier: document.getElementById('member-identifier').value,
    login_id: document.getElementById('member-login').value,
    password: document.getElementById('member-password').value,
    role: document.getElementById('member-role').value
  };
  await apiRequest('/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  await loadMembers();
  await loadUserOptions('assign-user');
  event.target.reset();
}

function initMemberEditor() {
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
    try {
      await apiRequest(`/users/${selectedMember.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      await loadMembers();
      clearEditForm();
    } catch (e) {
      alert(e.message);
    }
  });
}

async function loadUserOptions(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;
  const users = await apiRequest('/users');
  select.innerHTML = '<option value="">대상 선택</option>';
  users.forEach((u) => {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = `${u.name} (${roleLabel[u.role] || u.role})`;
    select.appendChild(opt);
  });
}

const selectedAssignSlots = new Set();

function buildAssignSlotGrid() {
  const grid = document.getElementById('assign-slot-grid');
  const preview = document.getElementById('assign-slot-preview');
  if (!grid) return;
  grid.innerHTML = '';
  const days = ['월', '화', '수', '목', '금', '토', '일'];
  const hours = Array.from({ length: 15 }, (_, i) => 8 + i);
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
      cell.textContent = `${hour}:00-${hour + 1}:00`;
      cell.addEventListener('click', () => {
        if (selectedAssignSlots.has(key)) {
          selectedAssignSlots.delete(key);
          cell.classList.remove('selected');
        } else {
          selectedAssignSlots.add(key);
          cell.classList.add('selected');
        }
        if (preview) {
          const selectedTexts = Array.from(selectedAssignSlots).map((k) => {
            const [w, h] = k.split('-').map(Number);
            return `${days[w]} ${h}:00-${h + 1}:00`;
          });
          preview.textContent = selectedTexts.length
            ? `${selectedTexts.length}개 슬롯 선택: ${selectedTexts.join(', ')}`
            : '요일·시간 칸을 터치하여 배정할 슬롯을 선택하세요.';
        }
      });
      grid.appendChild(cell);
    });
  });
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
  for (const key of selectedAssignSlots) {
    const [weekday, hour] = key.split('-').map(Number);
    const payload = { user_id, weekday, start_hour: hour, valid_from, valid_to };
    await apiRequest('/schedule/slots/assign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  }
  alert('선택한 슬롯이 배정되었습니다');
}

export { loadMembers, createMember, assignShift, loadUserOptions, buildAssignSlotGrid, initMemberEditor };
