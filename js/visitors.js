// File: /ui/js/visitors.js
import { apiRequest } from './api.js';

const periodTypes = {
  SEMESTER_1: '1학기',
  SEMESTER_2: '2학기',
  SUMMER_BREAK: '여름방학',
  WINTER_BREAK: '겨울방학'
};

let currentYear = null;
let entries = [];
let periods = [];
let selectedEntryId = null;
let calendarCursor = null;

function formatNumber(value) {
  if (value === null || value === undefined) return '-';
  return Number(value).toLocaleString('ko-KR');
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleDateString('ko-KR');
  } catch {
    return dateStr;
  }
}

function formatDateRange(start, end) {
  if (!start || !end) return '-';
  return `${formatDate(start)} ~ ${formatDate(end)}`;
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleString('ko-KR');
  } catch {
    return dateStr;
  }
}
function getElement(id) {
  return document.getElementById(id);
}

function resetEntryForm() {
  selectedEntryId = null;
  const visitDate = getElement('visit-date');
  if (visitDate) visitDate.value = '';
  const count1 = getElement('count1');
  const count2 = getElement('count2');
  if (count1) count1.value = '0';
  if (count2) count2.value = '0';
  const baseline = getElement('baseline-total');
  if (baseline) baseline.value = '';
  const dailyInput = getElement('daily-visitors');
  if (dailyInput) dailyInput.value = '';
  const deleteBtn = getElement('delete-entry');
  if (deleteBtn) deleteBtn.style.display = 'none';
  updateEntryPreview();
}

function updateYearSummary() {
  const label = getElement('year-label');
  const academic = getElement('year-academic');
  const range = getElement('year-range');
  if (!currentYear) {
    if (label) label.textContent = '-';
    if (academic) academic.textContent = '-';
    if (range) range.textContent = '-';
    return;
  }
  if (label) label.textContent = currentYear.label;
  if (academic) academic.textContent = `${currentYear.academic_year}학년도`;
  if (range) range.textContent = formatDateRange(currentYear.start_date, currentYear.end_date);
}

function renderEntries() {
  const tbody = getElement('entry-table')?.querySelector('tbody');
  const status = getElement('entry-status');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!entries.length) {
    if (status) status.textContent = '아직 기록된 데이터가 없습니다.';
    return;
  }
  if (status) status.textContent = `총 ${entries.length}건의 기록`;
  entries.forEach((entry) => {
    const tr = document.createElement('tr');
    if (entry.id === selectedEntryId) tr.classList.add('selected');
    const updater = entry.updated_by_name || entry.created_by_name || '-';
    tr.innerHTML = `
      <td>${formatDate(entry.visit_date)}</td>
      <td>${formatNumber(entry.count1)}</td>
      <td>${formatNumber(entry.count2)}</td>
      <td>${formatNumber(entry.total_count)}</td>
      <td>${formatNumber(entry.previous_total)}</td>
      <td>${formatNumber(entry.daily_visitors)}</td>
      <td>${updater}</td>
      <td>${formatDateTime(entry.updated_at)}</td>
    `;
    tr.addEventListener('click', () => selectEntry(entry));
    tbody.appendChild(tr);
  });
}

function renderMonthly(summary) {
  const tbody = getElement('monthly-table')?.querySelector('tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!summary?.monthly?.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="muted">표시할 데이터가 없습니다.</td></tr>';
    return;
  }
  summary.monthly.forEach((month) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${month.label}</td>
      <td>${formatNumber(month.open_days)}</td>
      <td>${formatNumber(month.total_visitors)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderPeriodStats(summary) {
  const tbody = getElement('period-table')?.querySelector('tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!summary?.periods?.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="muted">표시할 데이터가 없습니다.</td></tr>';
    return;
  }
  summary.periods.forEach((period) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${period.name}</td>
      <td>${formatDateRange(period.start_date, period.end_date)}</td>
      <td>${formatNumber(period.open_days)}</td>
      <td>${formatNumber(period.total_visitors)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function updateSummary(summary) {
  const totalDays = getElement('total-days');
  const totalVisitors = getElement('total-visitors');
  if (totalDays) totalDays.textContent = formatNumber(summary?.open_days ?? 0);
  if (totalVisitors) totalVisitors.textContent = formatNumber(summary?.total_visitors ?? 0);
}

function resolveCalendarCursor() {
  if (calendarCursor) return calendarCursor;
  const today = new Date();
  if (currentYear) {
    const start = new Date(currentYear.start_date);
    const end = new Date(currentYear.end_date);
    if (today >= start && today <= end) {
      calendarCursor = new Date(today.getFullYear(), today.getMonth(), 1);
      return calendarCursor;
    }
    calendarCursor = new Date(start.getFullYear(), start.getMonth(), 1);
    return calendarCursor;
  }
  calendarCursor = new Date(today.getFullYear(), today.getMonth(), 1);
  return calendarCursor;
}

function buildEntriesMap() {
  const map = new Map();
  entries.forEach((entry) => {
    map.set(entry.visit_date, entry);
  });
  return map;
}

function getSortedEntries() {
  return [...entries].sort((a, b) => new Date(a.visit_date) - new Date(b.visit_date));
}

function findEntryNeighbors(visitDate) {
  const sorted = getSortedEntries();
  const target = new Date(visitDate);
  let prev = null;
  let next = null;
  for (const entry of sorted) {
    const entryDate = new Date(entry.visit_date);
    if (entryDate < target) {
      prev = entry;
    } else if (entryDate > target) {
      next = entry;
      break;
    }
  }
  return { prev, next };
}

function renderCalendar() {
  const grid = getElement('calendar-grid');
  const label = getElement('calendar-label');
  const meta = getElement('calendar-meta');
  if (!grid || !label || !meta) return;
  if (!currentYear) {
    grid.innerHTML = '';
    label.textContent = '-';
    meta.textContent = '-';
    return;
  }
  const cursor = resolveCalendarCursor();
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  label.textContent = `${year}년 ${month + 1}월`;
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startWeekday = firstDay.getDay();
  const totalDays = lastDay.getDate();
  const entriesMap = buildEntriesMap();
  let monthTotal = 0;
  let openDays = 0;
  entries.forEach((entry) => {
    const entryDate = new Date(entry.visit_date);
    if (entryDate.getFullYear() === year && entryDate.getMonth() === month) {
      monthTotal += entry.daily_visitors;
      openDays += 1;
    }
  });
  meta.textContent = `개관일수 ${formatNumber(openDays)}일 · 출입자 ${formatNumber(monthTotal)}명`;
  grid.innerHTML = '';
  for (let i = 0; i < startWeekday; i += 1) {
    const cell = document.createElement('div');
    cell.className = 'calendar-cell muted';
    cell.textContent = '';
    grid.appendChild(cell);
  }
  for (let day = 1; day <= totalDays; day += 1) {
    const cell = document.createElement('div');
    const dateStr = new Date(year, month, day).toISOString().slice(0, 10);
    const entry = entriesMap.get(dateStr);
    const author = entry?.updated_by_name || entry?.created_by_name || '-';
    cell.className = 'calendar-cell';
    cell.innerHTML = `
      <div class="calendar-date">${day}</div>
      <div class="calendar-value">${entry ? formatNumber(entry.daily_visitors) : '-'}</div>
      <div class="calendar-author">${entry ? author : ''}</div>
    `;
    if (entry) {
      cell.classList.add('has-entry');
      cell.title = `${formatDate(dateStr)}: ${formatNumber(entry.daily_visitors)}명 (${author})`;
      cell.addEventListener('click', () => selectEntry(entry));
    }
    grid.appendChild(cell);
  }
}

function moveCalendar(monthOffset) {
  const cursor = resolveCalendarCursor();
  const next = new Date(cursor.getFullYear(), cursor.getMonth() + monthOffset, 1);
  if (currentYear) {
    const start = new Date(currentYear.start_date);
    const end = new Date(currentYear.end_date);
    const startMonth = new Date(start.getFullYear(), start.getMonth(), 1);
    const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
    if (next < startMonth) {
      calendarCursor = startMonth;
    } else if (next > endMonth) {
      calendarCursor = endMonth;
    } else {
      calendarCursor = next;
    }
  } else {
    calendarCursor = next;
  }
  renderCalendar();
}

function updatePeriodForm() {
  const mapping = {
    SEMESTER_1: { start: 'period-semester1-start', end: 'period-semester1-end' },
    SEMESTER_2: { start: 'period-semester2-start', end: 'period-semester2-end' },
    SUMMER_BREAK: { start: 'period-summer-start', end: 'period-summer-end' },
    WINTER_BREAK: { start: 'period-winter-start', end: 'period-winter-end' }
  };
  periods.forEach((period) => {
    const fields = mapping[period.period_type];
    if (!fields) return;
    const startEl = getElement(fields.start);
    const endEl = getElement(fields.end);
    if (startEl) startEl.value = period.start_date || '';
    if (endEl) endEl.value = period.end_date || '';
  });
}

function selectEntry(entry) {
  selectedEntryId = entry.id;
  const visitDate = getElement('visit-date');
  const count1 = getElement('count1');
  const count2 = getElement('count2');
  if (visitDate) visitDate.value = entry.visit_date;
  if (count1) count1.value = entry.count1;
  if (count2) count2.value = entry.count2;
  const baseline = getElement('baseline-total');
  const dailyInput = getElement('daily-visitors');
  if (baseline) baseline.value = entry.baseline_total ?? '';
  if (dailyInput) dailyInput.value = entry.daily_override ?? '';
  const deleteBtn = getElement('delete-entry');
  if (deleteBtn) deleteBtn.style.display = '';
  updateEntryPreview(entry);
  renderEntries();
}

function findPreviousTotalForDate(visitDate) {
  if (!currentYear) return 0;
  const { prev } = findEntryNeighbors(visitDate);
  if (prev) return prev.total_count;
  return currentYear.initial_total || 0;
}

function updateEntryPreview(entry) {
  const count1 = parseInt(getElement('count1')?.value || '0', 10);
  const count2 = parseInt(getElement('count2')?.value || '0', 10);
  const baselineRaw = getElement('baseline-total')?.value;
  const baselineTotal = baselineRaw === '' || baselineRaw === undefined ? null : parseInt(baselineRaw, 10);
  const dailyRaw = getElement('daily-visitors')?.value;
  const dailyInput = dailyRaw === '' || dailyRaw === undefined ? null : parseInt(dailyRaw, 10);
  let total = count1 + count2;
  let prevTotal = currentYear?.initial_total || 0;
  const visitDate = getElement('visit-date')?.value;
  if (entry?.previous_total !== undefined) {
    prevTotal = entry.previous_total;
  } else if (baselineTotal !== null && !Number.isNaN(baselineTotal)) {
    prevTotal = baselineTotal;
  } else if (visitDate) {
    const { prev, next } = findEntryNeighbors(visitDate);
    if (prev) {
      prevTotal = prev.total_count;
    } else if (dailyInput !== null && !Number.isNaN(dailyInput) && next) {
      prevTotal = next.previous_total - dailyInput;
    } else {
      prevTotal = currentYear?.initial_total || 0;
    }
  }
  if (dailyInput !== null && !Number.isNaN(dailyInput) && total === 0) {
    total = prevTotal + dailyInput;
    if (visitDate && prevTotal === 0) {
      const { next } = findEntryNeighbors(visitDate);
      if (next) total = next.previous_total;
    }
  }
  const daily = dailyInput !== null && !Number.isNaN(dailyInput) ? dailyInput : total - prevTotal;
  const prevEl = getElement('preview-prev-total');
  const totalEl = getElement('preview-total');
  const dailyEl = getElement('preview-daily');
  const updaterEl = getElement('preview-updater');
  if (prevEl) prevEl.textContent = formatNumber(prevTotal);
  if (totalEl) totalEl.textContent = formatNumber(total);
  if (dailyEl) dailyEl.textContent = formatNumber(daily);
  if (updaterEl) updaterEl.textContent = entry?.updated_by_name || entry?.created_by_name || '-';
}

async function loadYearDetail(yearId) {
  if (!yearId) return;
  const data = await apiRequest(`/visitors/years/${yearId}`);
  currentYear = data.year;
  entries = data.entries || [];
  periods = data.periods || [];
  calendarCursor = null;
  updateYearSummary();
  renderEntries();
  updateSummary(data.summary);
  renderMonthly(data.summary);
  renderPeriodStats(data.summary);
  updatePeriodForm();
  updateEntryPreview();
  renderCalendar();
}

async function loadYears(preferredAcademicYear = null) {
  const select = getElement('year-select');
  const years = await apiRequest('/visitors/years');
  if (!select) return;
  select.innerHTML = '';
  years.forEach((year) => {
    const option = document.createElement('option');
    option.value = year.id;
    option.textContent = year.label;
    select.appendChild(option);
  });
  if (years.length) {
    const preferred = preferredAcademicYear
      ? years.find((year) => year.academic_year === preferredAcademicYear)
      : null;
    const activeYear = preferred || years[0];
    select.value = activeYear.id;
    await loadYearDetail(activeYear.id);
  } else {
    currentYear = null;
    entries = [];
    periods = [];
    updateYearSummary();
    renderEntries();
    updateSummary({ open_days: 0, total_visitors: 0, monthly: [], periods: [] });
    renderMonthly({ monthly: [] });
    renderPeriodStats({ periods: [] });
    renderCalendar();
  }
}

function bindEvents() {
  getElement('year-select')?.addEventListener('change', async (event) => {
    const value = event.target.value;
    await loadYearDetail(value);
  });

  getElement('apply-year')?.addEventListener('click', async () => {
    const yearInput = parseInt(getElement('new-year-input')?.value || '0', 10);
    if (!yearInput) {
      alert('학년도 숫자를 입력하세요.');
      return;
    }
    try {
      await apiRequest('/visitors/years', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ academic_year: yearInput })
      });
    } catch (error) {
      if (!String(error.message).includes('이미 등록된 학년도')) {
        alert(error.message);
        return;
      }
    }
    getElement('new-year-input').value = '';
    await loadYears(yearInput);
  });

  getElement('save-entry')?.addEventListener('click', async () => {
    if (!currentYear) return;
    const visitDate = getElement('visit-date')?.value;
    if (!visitDate) {
      alert('날짜를 선택하세요.');
      return;
    }
    let count1 = parseInt(getElement('count1')?.value || '0', 10) || 0;
    let count2 = parseInt(getElement('count2')?.value || '0', 10) || 0;
    const baselineRaw = getElement('baseline-total')?.value;
    const baselineTotal = baselineRaw === '' || baselineRaw === undefined ? null : parseInt(baselineRaw, 10);
    const dailyRaw = getElement('daily-visitors')?.value;
    const dailyInput = dailyRaw === '' || dailyRaw === undefined ? null : parseInt(dailyRaw, 10);
    if (dailyInput !== null && !Number.isNaN(dailyInput) && count1 + count2 === 0) {
      let prevTotal = baselineTotal !== null && !Number.isNaN(baselineTotal)
        ? baselineTotal
        : findPreviousTotalForDate(visitDate);
      if (prevTotal === 0) {
        const { next } = findEntryNeighbors(visitDate);
        if (next) {
          prevTotal = next.previous_total - dailyInput;
        }
      }
      const computedTotal = prevTotal + dailyInput;
      count1 = computedTotal;
      count2 = 0;
      const count1El = getElement('count1');
      const count2El = getElement('count2');
      if (count1El) count1El.value = String(count1);
      if (count2El) count2El.value = String(count2);
    }
    await apiRequest(`/visitors/years/${currentYear.id}/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        visit_date: visitDate,
        count1,
        count2,
        baseline_total: baselineTotal,
        daily_override: dailyInput
      })
    });
    await loadYearDetail(currentYear.id);
    resetEntryForm();
  });

  getElement('reset-entry')?.addEventListener('click', resetEntryForm);

  getElement('delete-entry')?.addEventListener('click', async () => {
    if (!currentYear || !selectedEntryId) return;
    if (!confirm('선택한 기록을 삭제할까요?')) return;
    await apiRequest(`/visitors/years/${currentYear.id}/entries/${selectedEntryId}`, {
      method: 'DELETE'
    });
    await loadYearDetail(currentYear.id);
    resetEntryForm();
  });

  ['visit-date', 'count1', 'count2', 'baseline-total', 'daily-visitors'].forEach((id) => {
    getElement(id)?.addEventListener('input', () => updateEntryPreview());
    getElement(id)?.addEventListener('change', () => updateEntryPreview());
  });

  getElement('calendar-prev')?.addEventListener('click', () => moveCalendar(-1));
  getElement('calendar-next')?.addEventListener('click', () => moveCalendar(1));

  getElement('save-periods')?.addEventListener('click', async () => {
    if (!currentYear) return;
    const payload = [
      {
        period_type: 'SEMESTER_1',
        name: periodTypes.SEMESTER_1,
        start_date: getElement('period-semester1-start')?.value || null,
        end_date: getElement('period-semester1-end')?.value || null
      },
      {
        period_type: 'SUMMER_BREAK',
        name: periodTypes.SUMMER_BREAK,
        start_date: getElement('period-summer-start')?.value || null,
        end_date: getElement('period-summer-end')?.value || null
      },
      {
        period_type: 'SEMESTER_2',
        name: periodTypes.SEMESTER_2,
        start_date: getElement('period-semester2-start')?.value || null,
        end_date: getElement('period-semester2-end')?.value || null
      },
      {
        period_type: 'WINTER_BREAK',
        name: periodTypes.WINTER_BREAK,
        start_date: getElement('period-winter-start')?.value || null,
        end_date: getElement('period-winter-end')?.value || null
      }
    ];
    await apiRequest(`/visitors/years/${currentYear.id}/periods`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    await loadYearDetail(currentYear.id);
  });
}

export function initVisitorStats() {
  bindEvents();
  loadYears().catch((error) => {
    console.error(error);
    const status = getElement('entry-status');
    if (status) status.textContent = '데이터를 불러오지 못했습니다.';
  });
}
