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
let entryMonthCursor = null;

function formatNumber(value) {
  if (value === null || value === undefined) return '-';
  return Number(value).toLocaleString('ko-KR');
}

function parseNumberInput(value) {
  if (value === null || value === undefined) return null;
  if (value === '') return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function setFormMessage(elementId, message) {
  const el = getElement(elementId);
  if (!el) return;
  if (message) {
    el.textContent = message;
    el.classList.add('show');
  } else {
    el.textContent = '';
    el.classList.remove('show');
  }
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
  if (visitDate) visitDate.value = resolveDefaultVisitDate();
  const count1 = getElement('count1');
  const count2 = getElement('count2');
  if (count1) count1.value = '0';
  if (count2) count2.value = '0';
  const deleteBtn = getElement('delete-entry');
  if (deleteBtn) deleteBtn.style.display = 'none';
  setFormMessage('entry-message', '');
  updateEntryPreview();
}

function resetBulkEntryForm() {
  selectedEntryId = null;
  const visitDate = getElement('bulk-visit-date');
  if (visitDate) visitDate.value = resolveDefaultVisitDate();
  const baseline = getElement('bulk-baseline-total');
  if (baseline) baseline.value = '';
  const dailyInput = getElement('bulk-daily-visitors');
  if (dailyInput) dailyInput.value = '';
  const deleteBtn = getElement('delete-bulk-entry');
  if (deleteBtn) deleteBtn.style.display = 'none';
  setFormMessage('bulk-entry-message', '');
  updateBulkEntryPreview();
}

function formatMonthLabel(dateObj) {
  if (!dateObj) return '-';
  return `${dateObj.getFullYear()}년 ${dateObj.getMonth() + 1}월`;
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
  const label = getElement('entry-month-label');
  if (!tbody) return;
  const cursor = resolveEntryMonthCursor();
  if (label) label.textContent = formatMonthLabel(cursor);
  tbody.innerHTML = '';
  if (!entries.length) {
    if (status) status.textContent = '아직 기록된 데이터가 없습니다.';
    return;
  }
  const filtered = entries.filter((entry) => {
    const entryDate = new Date(entry.visit_date);
    return entryDate.getFullYear() === cursor.getFullYear() && entryDate.getMonth() === cursor.getMonth();
  });
  if (status) status.textContent = `${formatMonthLabel(cursor)} · ${filtered.length}건`;
  filtered.forEach((entry) => {
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

function isDateWithinYear(year, targetDate) {
  if (!year || !targetDate) return false;
  const start = new Date(year.start_date);
  const end = new Date(year.end_date);
  return targetDate >= start && targetDate <= end;
}

function resolveDefaultVisitDate() {
  if (!currentYear) return '';
  const today = new Date();
  if (isDateWithinYear(currentYear, today)) {
    return today.toISOString().slice(0, 10);
  }
  return '';
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

function resolveEntryMonthCursor() {
  if (entryMonthCursor) return entryMonthCursor;
  const today = new Date();
  if (currentYear && isDateWithinYear(currentYear, today)) {
    entryMonthCursor = new Date(today.getFullYear(), today.getMonth(), 1);
    return entryMonthCursor;
  }
  if (entries.length) {
    const firstEntry = entries[0];
    const dateObj = new Date(firstEntry.visit_date);
    entryMonthCursor = new Date(dateObj.getFullYear(), dateObj.getMonth(), 1);
    return entryMonthCursor;
  }
  if (currentYear) {
    const start = new Date(currentYear.start_date);
    entryMonthCursor = new Date(start.getFullYear(), start.getMonth(), 1);
    return entryMonthCursor;
  }
  entryMonthCursor = new Date(today.getFullYear(), today.getMonth(), 1);
  return entryMonthCursor;
}

function moveEntryMonth(monthOffset) {
  const cursor = resolveEntryMonthCursor();
  let next = new Date(cursor.getFullYear(), cursor.getMonth() + monthOffset, 1);
  if (currentYear) {
    const start = new Date(currentYear.start_date);
    const end = new Date(currentYear.end_date);
    const startMonth = new Date(start.getFullYear(), start.getMonth(), 1);
    const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
    if (next < startMonth) {
      next = startMonth;
    } else if (next > endMonth) {
      next = endMonth;
    }
  }
  entryMonthCursor = next;
  renderEntries();
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

function getPreviousTotal(visitDate) {
  if (!currentYear || !visitDate) return 0;
  const { prev } = findEntryNeighbors(visitDate);
  if (prev) return prev.total_count;
  return currentYear.initial_total || 0;
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
    const isToday = dateStr === new Date().toISOString().slice(0, 10);
    cell.className = 'calendar-cell';
    if (isToday) cell.classList.add('is-today');
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
  const entryDate = new Date(entry.visit_date);
  entryMonthCursor = new Date(entryDate.getFullYear(), entryDate.getMonth(), 1);
  const visitDate = getElement('visit-date');
  const count1 = getElement('count1');
  const count2 = getElement('count2');
  if (visitDate) visitDate.value = entry.visit_date;
  if (count1) count1.value = entry.count1 ?? '';
  if (count2) count2.value = entry.count2 ?? '';
  const deleteBtn = getElement('delete-entry');
  if (deleteBtn) deleteBtn.style.display = '';

  const bulkVisit = getElement('bulk-visit-date');
  if (bulkVisit) bulkVisit.value = entry.visit_date;
  const bulkBaseline = getElement('bulk-baseline-total');
  if (bulkBaseline) bulkBaseline.value = entry.baseline_total ?? '';
  const bulkDaily = getElement('bulk-daily-visitors');
  if (bulkDaily) bulkDaily.value = entry.daily_override ?? '';
  const bulkDelete = getElement('delete-bulk-entry');
  if (bulkDelete) bulkDelete.style.display = '';

  updateEntryPreview(entry);
  updateBulkEntryPreview(entry);
  renderEntries();
}

function updateEntryPreview(entry) {
  if (!getElement('preview-prev-total')) return;
  const visitDate = getElement('visit-date')?.value;
  const count1 = parseNumberInput(getElement('count1')?.value);
  const count2 = parseNumberInput(getElement('count2')?.value);
  const hasCounts = count1 !== null || count2 !== null;
  const prevTotal = entry?.previous_total ?? (visitDate ? getPreviousTotal(visitDate) : currentYear?.initial_total || 0);
  const total = hasCounts ? (count1 || 0) + (count2 || 0) : null;
  const daily = total !== null ? total - prevTotal : null;
  const prevEl = getElement('preview-prev-total');
  const totalEl = getElement('preview-total');
  const dailyEl = getElement('preview-daily');
  const updaterEl = getElement('preview-updater');
  if (prevEl) prevEl.textContent = formatNumber(prevTotal);
  if (totalEl) totalEl.textContent = formatNumber(total);
  if (dailyEl) dailyEl.textContent = formatNumber(daily);
  if (updaterEl) updaterEl.textContent = entry?.updated_by_name || entry?.created_by_name || '-';
}

function updateBulkEntryPreview(entry) {
  if (!getElement('bulk-preview-prev-total')) return;
  const visitDate = getElement('bulk-visit-date')?.value;
  const baselineTotal = parseNumberInput(getElement('bulk-baseline-total')?.value);
  const dailyInput = parseNumberInput(getElement('bulk-daily-visitors')?.value);
  const prevTotal = entry?.previous_total ?? (baselineTotal ?? (visitDate ? getPreviousTotal(visitDate) : currentYear?.initial_total || 0));
  const total = dailyInput !== null ? prevTotal + dailyInput : (entry?.total_count ?? null);
  const prevEl = getElement('bulk-preview-prev-total');
  const totalEl = getElement('bulk-preview-total');
  const dailyEl = getElement('bulk-preview-daily');
  const updaterEl = getElement('bulk-preview-updater');
  if (prevEl) prevEl.textContent = formatNumber(prevTotal);
  if (totalEl) totalEl.textContent = formatNumber(total);
  if (dailyEl) dailyEl.textContent = formatNumber(dailyInput ?? entry?.daily_visitors ?? null);
  if (updaterEl) updaterEl.textContent = entry?.updated_by_name || entry?.created_by_name || '-';
}

async function loadYearDetail(yearId) {
  if (!yearId) return;
  const data = await apiRequest(`/visitors/years/${yearId}`);
  currentYear = data.year;
  entries = data.entries || [];
  periods = data.periods || [];
  calendarCursor = null;
  entryMonthCursor = null;
  updateYearSummary();
  renderEntries();
  updateSummary(data.summary);
  renderMonthly(data.summary);
  renderPeriodStats(data.summary);
  updatePeriodForm();
  resetEntryForm();
  resetBulkEntryForm();
  renderCalendar();
}

function resolveYearByDate(years, targetDate) {
  if (!targetDate) return null;
  return years.find((year) => isDateWithinYear(year, targetDate)) || null;
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
    const today = new Date();
    const datedYear = resolveYearByDate(years, today);
    const activeYear = preferred || datedYear || years[0];
    select.value = activeYear.id;
    await loadYearDetail(activeYear.id);
  } else {
    currentYear = null;
    entries = [];
    periods = [];
    entryMonthCursor = null;
    updateYearSummary();
    renderEntries();
    updateSummary({ open_days: 0, total_visitors: 0, monthly: [], periods: [] });
    renderMonthly({ monthly: [] });
    renderPeriodStats({ periods: [] });
    renderCalendar();
    resetEntryForm();
    resetBulkEntryForm();
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
      setFormMessage('entry-message', '날짜를 선택하세요.');
      return;
    }
    const count1 = parseNumberInput(getElement('count1')?.value);
    const count2 = parseNumberInput(getElement('count2')?.value);
    if (count1 === null && count2 === null) {
      setFormMessage('entry-message', 'Count 1과 Count 2를 입력하세요.');
      return;
    }
    if (count1 === null || count2 === null) {
      setFormMessage('entry-message', 'Count 1과 Count 2를 모두 입력하세요.');
      return;
    }
    setFormMessage('entry-message', '');
    try {
      await apiRequest(`/visitors/years/${currentYear.id}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visit_date: visitDate,
          count1,
          count2,
          baseline_total: null,
          daily_override: null
        })
      });
      await loadYearDetail(currentYear.id);
      resetEntryForm();
    } catch (error) {
      setFormMessage('entry-message', error.message || '저장에 실패했습니다.');
    }
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

  getElement('save-bulk-entry')?.addEventListener('click', async () => {
    if (!currentYear) return;
    const visitDate = getElement('bulk-visit-date')?.value;
    if (!visitDate) {
      setFormMessage('bulk-entry-message', '날짜를 선택하세요.');
      return;
    }
    const baselineTotal = parseNumberInput(getElement('bulk-baseline-total')?.value);
    const dailyVisitors = parseNumberInput(getElement('bulk-daily-visitors')?.value);
    if (baselineTotal === null && dailyVisitors === null) {
      setFormMessage('bulk-entry-message', '전일 합산 기준값 또는 금일 출입자를 입력하세요.');
      return;
    }
    setFormMessage('bulk-entry-message', '');
    try {
      await apiRequest(`/visitors/years/${currentYear.id}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visit_date: visitDate,
          count1: null,
          count2: null,
          baseline_total: baselineTotal,
          daily_override: dailyVisitors
        })
      });
      await loadYearDetail(currentYear.id);
      resetBulkEntryForm();
    } catch (error) {
      setFormMessage('bulk-entry-message', error.message || '저장에 실패했습니다.');
    }
  });

  getElement('reset-bulk-entry')?.addEventListener('click', resetBulkEntryForm);

  getElement('delete-bulk-entry')?.addEventListener('click', async () => {
    if (!currentYear || !selectedEntryId) return;
    if (!confirm('선택한 기록을 삭제할까요?')) return;
    await apiRequest(`/visitors/years/${currentYear.id}/entries/${selectedEntryId}`, {
      method: 'DELETE'
    });
    await loadYearDetail(currentYear.id);
    resetBulkEntryForm();
  });

  ['visit-date', 'count1', 'count2'].forEach((id) => {
    getElement(id)?.addEventListener('input', () => updateEntryPreview());
    getElement(id)?.addEventListener('change', () => updateEntryPreview());
  });

  ['bulk-visit-date', 'bulk-baseline-total', 'bulk-daily-visitors'].forEach((id) => {
    getElement(id)?.addEventListener('input', () => updateBulkEntryPreview());
    getElement(id)?.addEventListener('change', () => updateBulkEntryPreview());
  });

  getElement('entry-month-prev')?.addEventListener('click', () => moveEntryMonth(-1));
  getElement('entry-month-next')?.addEventListener('click', () => moveEntryMonth(1));

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
    const message = error?.message || '데이터를 불러오지 못했습니다.';
    if (status) status.textContent = message;
    setFormMessage('entry-message', message);
    setFormMessage('bulk-entry-message', message);
  });
}
