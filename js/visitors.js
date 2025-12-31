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
  const deleteBtn = getElement('delete-entry');
  if (deleteBtn) deleteBtn.style.display = 'none';
  updateEntryPreview();
}

function updateYearSummary() {
  const label = getElement('year-label');
  const range = getElement('year-range');
  const initial = getElement('year-initial-total');
  const initialInput = getElement('edit-initial-total');
  if (!currentYear) {
    if (label) label.textContent = '-';
    if (range) range.textContent = '-';
    if (initial) initial.textContent = '-';
    if (initialInput) initialInput.value = '';
    return;
  }
  if (label) label.textContent = currentYear.label;
  if (range) range.textContent = formatDateRange(currentYear.start_date, currentYear.end_date);
  if (initial) initial.textContent = formatNumber(currentYear.initial_total);
  if (initialInput) initialInput.value = String(currentYear.initial_total ?? 0);
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
  const deleteBtn = getElement('delete-entry');
  if (deleteBtn) deleteBtn.style.display = '';
  updateEntryPreview(entry);
  renderEntries();
}

function findPreviousTotalForDate(visitDate) {
  if (!currentYear) return 0;
  const dateValue = new Date(visitDate);
  const list = [...entries].sort((a, b) => new Date(a.visit_date) - new Date(b.visit_date));
  let prev = currentYear.initial_total || 0;
  for (const entry of list) {
    if (new Date(entry.visit_date) >= dateValue) break;
    prev = entry.total_count;
  }
  return prev;
}

function updateEntryPreview(entry) {
  const count1 = parseInt(getElement('count1')?.value || '0', 10);
  const count2 = parseInt(getElement('count2')?.value || '0', 10);
  const total = count1 + count2;
  let prevTotal = currentYear?.initial_total || 0;
  const visitDate = getElement('visit-date')?.value;
  if (entry?.previous_total !== undefined) {
    prevTotal = entry.previous_total;
  } else if (visitDate) {
    prevTotal = findPreviousTotalForDate(visitDate);
  }
  const daily = total - prevTotal;
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
  updateYearSummary();
  renderEntries();
  updateSummary(data.summary);
  renderMonthly(data.summary);
  renderPeriodStats(data.summary);
  updatePeriodForm();
  updateEntryPreview();
}

async function loadYears() {
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
    select.value = years[0].id;
    await loadYearDetail(years[0].id);
  } else {
    currentYear = null;
    entries = [];
    periods = [];
    updateYearSummary();
    renderEntries();
    updateSummary({ open_days: 0, total_visitors: 0, monthly: [], periods: [] });
    renderMonthly({ monthly: [] });
    renderPeriodStats({ periods: [] });
  }
}

function bindEvents() {
  getElement('year-select')?.addEventListener('change', async (event) => {
    const value = event.target.value;
    await loadYearDetail(value);
  });

  getElement('create-year')?.addEventListener('click', async () => {
    const yearInput = parseInt(getElement('new-year-input')?.value || '0', 10);
    if (!yearInput) {
      alert('학년도 숫자를 입력하세요.');
      return;
    }
    const initialTotal = parseInt(getElement('new-initial-total')?.value || '0', 10) || 0;
    await apiRequest('/visitors/years', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ academic_year: yearInput, initial_total: initialTotal })
    });
    getElement('new-year-input').value = '';
    await loadYears();
  });

  getElement('update-initial-total')?.addEventListener('click', async () => {
    if (!currentYear) return;
    const value = parseInt(getElement('edit-initial-total')?.value || '0', 10) || 0;
    await apiRequest(`/visitors/years/${currentYear.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initial_total: value })
    });
    await loadYearDetail(currentYear.id);
  });

  getElement('save-entry')?.addEventListener('click', async () => {
    if (!currentYear) return;
    const visitDate = getElement('visit-date')?.value;
    if (!visitDate) {
      alert('날짜를 선택하세요.');
      return;
    }
    const count1 = parseInt(getElement('count1')?.value || '0', 10) || 0;
    const count2 = parseInt(getElement('count2')?.value || '0', 10) || 0;
    await apiRequest(`/visitors/years/${currentYear.id}/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visit_date: visitDate, count1, count2 })
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

  ['visit-date', 'count1', 'count2'].forEach((id) => {
    getElement(id)?.addEventListener('input', () => updateEntryPreview());
    getElement(id)?.addEventListener('change', () => updateEntryPreview());
  });

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
        period_type: 'SEMESTER_2',
        name: periodTypes.SEMESTER_2,
        start_date: getElement('period-semester2-start')?.value || null,
        end_date: getElement('period-semester2-end')?.value || null
      },
      {
        period_type: 'SUMMER_BREAK',
        name: periodTypes.SUMMER_BREAK,
        start_date: getElement('period-summer-start')?.value || null,
        end_date: getElement('period-summer-end')?.value || null
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
