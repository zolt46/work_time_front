// File: /ui/js/schedule.js
import { apiRequest } from './api.js';

function renderGlobalSchedule(assignments) {
  const container = document.getElementById('schedule-container');
  if (!container) return;
  container.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'schedule-grid';
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  grid.appendChild(cell('','header'));
  days.forEach(d=>grid.appendChild(cell(d,'header')));
  const timeSlots = ['Morning','Afternoon','Evening'];
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

async function loadGlobalSchedule() {
  const data = await apiRequest('/schedule/global');
  renderGlobalSchedule(data.assignments);
}

async function loadMySchedule() {
  const listEl = document.getElementById('my-schedule');
  if (!listEl) return;
  const data = await apiRequest('/schedule/me');
  listEl.innerHTML = '';
  data.forEach(item => {
    const li = document.createElement('li');
    li.textContent = `${item.shift_id} | from ${item.valid_from} ${item.valid_to ? 'to '+item.valid_to : ''}`;
    listEl.appendChild(li);
  });
}

export { loadGlobalSchedule, loadMySchedule };
