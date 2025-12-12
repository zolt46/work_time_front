// File: /ui/js/schedule.js
import { apiRequest } from './api.js';

const days = ['월', '화', '수', '목', '금', '토', '일'];

function toMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function deriveHourWindow(assignments) {
  if (!assignments || assignments.length === 0) return { startHour: 8, endHour: 20 };
  const mins = assignments.flatMap((a) => [toMinutes(a.shift.start_time), toMinutes(a.shift.end_time)]);
  const startHour = Math.max(0, Math.min(...mins) / 60 >> 0);
  const endHour = Math.min(24, Math.ceil(Math.max(...mins) / 60));
  return {
    startHour: Math.min(startHour, 8),
    endHour: Math.max(endHour, 18)
  };
}

function createHeaderRow() {
  const header = document.createElement('div');
  header.className = 'timetable-header';
  header.appendChild(headerCell('시간'));
  days.forEach((day) => header.appendChild(headerCell(day)));
  return header;
}

function headerCell(text) {
  const div = document.createElement('div');
  div.className = 'day-label';
  div.textContent = text;
  return div;
}

function createTimelineColumns(hours, startHour) {
  const hourCount = hours.length;
  const times = document.createElement('div');
  times.className = 'timetable-times';
  times.style.setProperty('--hour-rows', hourCount);
  hours.forEach((h) => {
    const label = document.createElement('div');
    label.className = 'time-label';
    label.textContent = `${h}:00`;
    times.appendChild(label);
  });
  const dayCols = days.map(() => {
    const col = document.createElement('div');
    col.className = 'timetable-column';
    col.style.setProperty('--hour-rows', hourCount);
    return col;
  });
  return { times, dayCols };
}

function placeAssignments(dayCols, assignments, startHour, hourHeight = 44) {
  const colors = ['#cce5ff', '#d7f0ff', '#d8ffe2', '#fff1d0', '#fbe4ff', '#ffe4e6', '#e7f2ff'];
  assignments.forEach((assign, idx) => {
    const dayIndex = assign.shift.weekday;
    const target = dayCols[dayIndex];
    if (!target) return;
    const startMinutes = toMinutes(assign.shift.start_time);
    const endMinutes = toMinutes(assign.shift.end_time);
    const top = (startMinutes - startHour * 60) / 60 * hourHeight;
    const height = Math.max(28, (endMinutes - startMinutes) / 60 * hourHeight);
    const block = document.createElement('div');
    block.className = 'timetable-event';
    block.style.top = `${top}px`;
    block.style.height = `${height}px`;
    block.style.background = colors[idx % colors.length];
    block.innerHTML = `
      <div class="event-title">${assign.shift.name}</div>
      <div class="event-time">${assign.shift.start_time.slice(0,5)} - ${assign.shift.end_time.slice(0,5)}</div>
      <div class="event-members">${assign.user ? `<span class="chip">${assign.user.name}</span>` : ''}</div>
    `;
    target.appendChild(block);
  });
}

function renderTimeline(assignments, targetId, { hourHeight = 44 } = {}) {
  const container = document.getElementById(targetId);
  if (!container) return;
  container.innerHTML = '';
  if (!assignments || assignments.length === 0) {
    container.classList.remove('timetable');
    container.textContent = '배정된 일정이 없습니다.';
    return;
  }

  const { startHour, endHour } = deriveHourWindow(assignments);
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const wrapper = document.createElement('div');
  wrapper.className = 'timetable';
  wrapper.style.setProperty('--hour-rows', hours.length);
  wrapper.style.setProperty('--hour-height', `${hourHeight}px`);

  const header = createHeaderRow();
  const body = document.createElement('div');
  body.className = 'timetable-body';
  body.style.setProperty('--hour-rows', hours.length);
  body.style.setProperty('--hour-height', `${hourHeight}px`);

  const { times, dayCols } = createTimelineColumns(hours, startHour);
  placeAssignments(dayCols, assignments, startHour, hourHeight);

  body.appendChild(times);
  dayCols.forEach((col) => body.appendChild(col));

  wrapper.appendChild(header);
  wrapper.appendChild(body);
  container.appendChild(wrapper);
}

async function loadGlobalSchedule(targetId = 'schedule-container', options = {}) {
  const data = await apiRequest('/schedule/global');
  renderTimeline(data.assignments, targetId, options);
  return data.assignments;
}

function renderCompactSchedule(assignments, targetId = 'schedule-summary') {
  renderTimeline(assignments, targetId, { hourHeight: 38 });
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
