// File: /ui/js/schedule.js
import { apiRequest } from './api.js';

const days = ['월', '화', '수', '목', '금', '토', '일'];

function toMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function getWeekStart(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const diff = (d.getDay() + 6) % 7;
  const start = new Date(d);
  start.setDate(d.getDate() - diff);
  return start.toISOString().slice(0, 10);
}

function normalizeEvents(assignments = []) {
  if (!assignments.length) return [];
  if (assignments[0].shift) return assignments;
  return assignments.map((ev) => {
    const weekday = (new Date(ev.date).getDay() + 6) % 7;
    return {
      shift: {
        weekday,
        start_time: ev.start_time,
        end_time: ev.end_time,
        name: ev.shift_name || '',
      },
      user: { name: ev.user_name },
      source: ev.source || 'BASE',
    };
  });
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

function createTimelineColumns(hours) {
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
    hours.forEach((h) => {
      const cell = document.createElement('div');
      cell.className = 'timetable-cell';
      cell.dataset.hour = String(h);
      col.appendChild(cell);
    });
    return col;
  });
  return { times, dayCols };
}

function placeAssignments(dayCols, hours, assignments) {
  const colorPool = ['#1d4ed8', '#0f766e', '#b45309', '#be185d', '#7c3aed', '#2563eb'];
  const sourceColor = { EXTRA: '#0f766e', BASE: '#2563eb' };
  const userColor = new Map();

  const overlapsHour = (start, end, hour) => {
    const hourStart = hour * 60;
    const hourEnd = hourStart + 60;
    return end > hourStart && start < hourEnd;
  };

  assignments.forEach((assign) => {
    const dayIndex = assign.shift.weekday;
    const col = dayCols[dayIndex];
    if (!col) return;
    const startMinutes = toMinutes(assign.shift.start_time);
    const endMinutes = toMinutes(assign.shift.end_time);
    const memberName = assign.user?.name || assign.shift.name || '미정';
    const color = sourceColor[assign.source] || userColor.get(memberName) || colorPool[userColor.size % colorPool.length];
    if (!userColor.has(memberName)) userColor.set(memberName, color);

    hours.forEach((hour) => {
      if (!overlapsHour(startMinutes, endMinutes, hour)) return;
      const cell = col.querySelector(`.timetable-cell[data-hour="${hour}"]`);
      if (!cell) return;
      const pill = document.createElement('span');
      pill.className = 'timetable-pill';
      pill.textContent = memberName;
      pill.style.setProperty('--pill-color', color);
      if (assign.source === 'EXTRA') pill.classList.add('pill-extra');
      cell.appendChild(pill);
    });
  });

  dayCols.forEach((col) => {
    col.querySelectorAll('.timetable-cell').forEach((cell) => {
      if (!cell.childElementCount) {
        cell.classList.add('timetable-empty-slot');
        cell.textContent = '—';
      }
    });
  });
}

function renderTimeline(assignments, targetId, { hourHeight = 44 } = {}) {
  const container = document.getElementById(targetId);
  if (!container) return;
  container.innerHTML = '';
  const normalized = normalizeEvents(assignments);
  if (!assignments || assignments.length === 0) {
    container.classList.remove('timetable');
    container.textContent = '배정된 일정이 없습니다.';
    return;
  }

  const { startHour, endHour } = deriveHourWindow(normalized);
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

  const { times, dayCols } = createTimelineColumns(hours);
  placeAssignments(dayCols, hours, normalized);

  body.appendChild(times);
  dayCols.forEach((col) => body.appendChild(col));

  wrapper.appendChild(header);
  wrapper.appendChild(body);
  container.appendChild(wrapper);
}

async function loadGlobalSchedule(targetId = 'schedule-container', options = {}) {
  const start = getWeekStart();
  const params = new URLSearchParams({ start });
  const events = await apiRequest(`/schedule/weekly_view?${params.toString()}`);
  renderTimeline(events, targetId, options);
  return events;
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
