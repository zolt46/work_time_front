// File: /ui/js/admin.js
import { apiRequest } from './api.js';

const roleLabel = {
  MASTER: '마스터',
  OPERATOR: '운영자',
  MEMBER: '구성원'
};

async function loadMembers() {
  const tbody = document.getElementById('member-table-body');
  if (!tbody) return;
  const members = await apiRequest('/users');
  tbody.innerHTML = '';
  members.forEach((m) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${m.name}</td><td>${roleLabel[m.role] || m.role}</td><td>${m.identifier || ''}</td><td>${m.auth_account?.login_id || ''}</td><td>${m.active ? '활성' : '비활성'}</td>`;
    const actions = document.createElement('td');

    const credBtn = document.createElement('button');
    credBtn.textContent = '자격 변경';
    credBtn.className = 'btn tiny';
    credBtn.onclick = () => promptCredentialUpdate(m);
    actions.appendChild(credBtn);

    const delBtn = document.createElement('button');
    delBtn.textContent = '삭제';
    delBtn.className = 'btn tiny muted';
    delBtn.onclick = () => deleteMember(m);
    actions.appendChild(delBtn);

    tr.appendChild(actions);
    tbody.appendChild(tr);
  });
}

async function promptCredentialUpdate(member) {
  const newLogin = prompt(`새 로그인 ID 입력 (${member.auth_account?.login_id || '현재 없음'})`, member.auth_account?.login_id || '');
  const newPassword = prompt('새 비밀번호(변경하지 않을 경우 비워두세요)');
  if (!newLogin && !newPassword) return;
  try {
    await apiRequest(`/users/${member.id}/credentials`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_login_id: newLogin || null, new_password: newPassword || null })
    });
    await loadMembers();
  } catch (e) {
    alert(e.message);
  }
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

function weekdayLabel(num) {
  return ['월', '화', '수', '목', '금', '토', '일'][num] || num;
}

async function loadShiftTable() {
  const tbody = document.getElementById('shift-table-body');
  if (!tbody) return;
  const shifts = await apiRequest('/schedule/shifts');
  tbody.innerHTML = '';
  shifts.forEach((s) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${s.name}</td><td>${weekdayLabel(s.weekday)}</td><td>${s.start_time} ~ ${s.end_time}</td><td>${s.location || ''}</td>`;
    tbody.appendChild(tr);
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

let selectedAssignSlot = null;

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
      const cell = document.createElement('div');
      cell.className = 'slot-cell';
      cell.textContent = `${hour}:00-${hour + 1}:00`;
      cell.addEventListener('click', () => {
        grid.querySelectorAll('.slot-cell').forEach((c) => c.classList.remove('selected'));
        cell.classList.add('selected');
        selectedAssignSlot = { weekday, hour };
        if (preview) preview.textContent = `${days[weekday]} ${hour}:00-${hour + 1}:00 슬롯 선택됨`;
      });
      grid.appendChild(cell);
    });
  });
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
  await loadShiftTable();
  event.target.reset();
}

async function assignShift(event) {
  event.preventDefault();
  if (!selectedAssignSlot) {
    alert('요일·시간 슬롯을 선택하세요.');
    return;
  }
  const payload = {
    user_id: document.getElementById('assign-user').value,
    weekday: selectedAssignSlot.weekday,
    start_hour: selectedAssignSlot.hour,
    valid_from: document.getElementById('assign-from').value,
    valid_to: document.getElementById('assign-to').value || null
  };
  await apiRequest('/schedule/slots/assign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  alert('배정되었습니다');
  watchAssignmentPreview();
}

export { loadMembers, createMember, createShift, assignShift, loadUserOptions, loadShiftTable, buildAssignSlotGrid };
