// File: /ui/js/schedule.js
import { apiRequest } from './api.js';

function renderGlobalSchedule(assignments, targetId = 'schedule-container') {
  const container = document.getElementById(targetId);
  if (!container) return;
  container.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'schedule-grid';
  const days = ['월','화','수','목','금','토','일'];
  grid.appendChild(cell('','header'));
  days.forEach(d=>grid.appendChild(cell(d,'header')));
  const timeSlots = ['오전','오후','야간'];
  timeSlots.forEach(slot=>{
    grid.appendChild(cell(slot,'header'));
    for (let i=0;i<7;i++) {
      const box = cell('', 'cell');
      const matches = assignments.filter(a=>a.shift.weekday===i);
      matches.forEach(m=>{
        const div = document.createElement('div');
        div.textContent = `${m.shift.name} (${m.shift.start_time.slice(0,5)}-${m.shift.end_time.slice(0,5)}) - ${m.user.name}`;
        div.className = 'badge role';
        box.appendChild(div);
      });
      grid.appendChild(box);
    }
  });
  container.appendChild(grid);
}

function cell(text, cls) {
  const div = document.createElement('div');
  div.className = `cell ${cls}`;
  div.textContent = text;
  return div;
}

async function loadGlobalSchedule(targetId = 'schedule-container') {
  const data = await apiRequest('/schedule/global');
  renderGlobalSchedule(data.assignments, targetId);
  return data.assignments;
}

function renderCompactSchedule(assignments, targetId = 'schedule-summary', limit = 5) {
  const container = document.getElementById(targetId);
  if (!container) return;
  container.innerHTML = '';
  if (!assignments || assignments.length === 0) {
    container.textContent = '배정된 일정이 없습니다.';
    return;
  }
  const list = document.createElement('ul');
  list.className = 'compact-list';
  assignments.slice(0, limit).forEach((item) => {
    const li = document.createElement('li');
    const day = ['월','화','수','목','금','토','일'][item.shift.weekday] || '-';
    li.textContent = `${day} ${item.shift.name} (${item.shift.start_time.slice(0,5)}-${item.shift.end_time.slice(0,5)}) · ${item.user.name}`;
    list.appendChild(li);
  });
  container.appendChild(list);
}

async function loadMySchedule() {
  const listEl = document.getElementById('my-schedule');
  if (!listEl) return;
  const data = await apiRequest('/schedule/me');
  listEl.innerHTML = '';
  data.forEach(item => {
    const li = document.createElement('li');
    li.textContent = `${item.shift_id} | ${item.valid_from}${item.valid_to ? ' ~ '+item.valid_to : ''}`;
    listEl.appendChild(li);
  });
}

export { loadGlobalSchedule, loadMySchedule, renderCompactSchedule };
