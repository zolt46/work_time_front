// File: /ui/js/serials.js
import { apiRequest } from './api.js';
import { loadUser } from './auth.js';

const acquisitionLabels = {
  DONATION: '수증',
  SUBSCRIPTION: '구독'
};

let serials = [];
let selectedSerial = null;
let currentRole = null;

function getElement(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const el = getElement(id);
  if (el) el.textContent = value;
}

function formatAcquisition(type) {
  return acquisitionLabels[type] || '-';
}

function formatLocation(serial) {
  const parts = [];
  if (serial.shelf_section) parts.push(serial.shelf_section);
  if (serial.shelf_row && serial.shelf_column) {
    parts.push(`${serial.shelf_row}열 ${serial.shelf_column}칸`);
  } else if (serial.shelf_row) {
    parts.push(`${serial.shelf_row}열`);
  }
  return parts.join(' · ') || '-';
}

function renderShelfMap(row, column) {
  const map = getElement('shelf-map');
  if (!map) return;
  map.innerHTML = '';
  for (let r = 1; r <= 5; r += 1) {
    for (let c = 1; c <= 5; c += 1) {
      const cell = document.createElement('div');
      cell.className = 'shelf-cell';
      if (row === r && column === c) {
        cell.classList.add('active');
      }
      cell.textContent = `${r}-${c}`;
      map.appendChild(cell);
    }
  }
}

function updateDetail(serial) {
  if (!getElement('detail-title')) {
    return;
  }
  if (!serial) {
    setText('detail-title', '-');
    setText('detail-issn', '-');
    setText('detail-type', '-');
    setText('detail-shelf', '-');
    setText('detail-location', '-');
    setText('detail-note', '-');
    renderShelfMap(null, null);
    return;
  }
  setText('detail-title', serial.title);
  setText('detail-issn', serial.issn || '-');
  setText('detail-type', formatAcquisition(serial.acquisition_type));
  setText('detail-shelf', serial.shelf_section || '-');
  setText('detail-location', formatLocation(serial));
  setText('detail-note', serial.shelf_note || serial.remark || '-');
  renderShelfMap(serial.shelf_row, serial.shelf_column);
}

function renderList() {
  const tbody = getElement('serials-table')?.querySelector('tbody');
  const status = getElement('serials-status');
  if (!tbody || !status) return;
  tbody.innerHTML = '';
  if (!serials.length) {
    status.textContent = '표시할 연속 간행물이 없습니다.';
    return;
  }
  status.textContent = `${serials.length}건 표시 중`;
  serials.forEach((serial) => {
    const tr = document.createElement('tr');
    if (selectedSerial?.id === serial.id) tr.classList.add('selected');
    tr.innerHTML = `
      <td>${serial.title}</td>
      <td>${serial.issn || '-'}</td>
      <td>${formatAcquisition(serial.acquisition_type)}</td>
      <td>${formatLocation(serial)}</td>
    `;
    tr.addEventListener('click', () => selectSerial(serial));
    tbody.appendChild(tr);
  });
}

function setForm(serial) {
  const title = getElement('serial-title');
  if (!title) return;
  title.value = serial?.title || '';
  getElement('serial-issn').value = serial?.issn || '';
  getElement('serial-type').value = serial?.acquisition_type || 'SUBSCRIPTION';
  getElement('serial-shelf').value = serial?.shelf_section || '';
  getElement('serial-row').value = serial?.shelf_row ?? '';
  getElement('serial-column').value = serial?.shelf_column ?? '';
  getElement('serial-note').value = serial?.shelf_note || '';
  getElement('serial-remark').value = serial?.remark || '';
}

function selectSerial(serial) {
  selectedSerial = serial;
  updateDetail(serial);
  setForm(serial);
  renderList();
}

function clearSelection() {
  selectedSerial = null;
  updateDetail(null);
  setForm(null);
  renderList();
}

function buildQuery() {
  const params = new URLSearchParams();
  const keyword = getElement('search-keyword')?.value?.trim() ?? '';
  const issn = getElement('search-issn')?.value?.trim() ?? '';
  const shelf = getElement('search-shelf')?.value?.trim() ?? '';
  const type = getElement('search-type')?.value ?? '';
  if (keyword) params.set('q', keyword);
  if (issn) params.set('issn', issn);
  if (shelf) params.set('shelf_section', shelf);
  if (type) params.set('acquisition_type', type);
  return params.toString();
}

async function loadSerials() {
  const query = buildQuery();
  const url = query ? `/serials?${query}` : '/serials';
  serials = await apiRequest(url);
  if (selectedSerial) {
    selectedSerial = serials.find((item) => item.id === selectedSerial.id) || null;
  }
  updateDetail(selectedSerial);
  renderList();
  const totalEl = getElement('serials-total-count');
  if (totalEl) {
    totalEl.textContent = serials.length.toLocaleString('ko-KR');
  }
  const donationEl = getElement('serials-donation-count');
  if (donationEl) {
    const count = serials.filter((item) => item.acquisition_type === 'DONATION').length;
    donationEl.textContent = count.toLocaleString('ko-KR');
  }
  const subscriptionEl = getElement('serials-subscription-count');
  if (subscriptionEl) {
    const count = serials.filter((item) => item.acquisition_type === 'SUBSCRIPTION').length;
    subscriptionEl.textContent = count.toLocaleString('ko-KR');
  }
}

function applyRoleGuard() {
  const form = getElement('serial-form');
  const buttons = form?.querySelectorAll('button, input, select, textarea');
  const warning = getElement('serials-permission');
  const isAllowed = currentRole === 'OPERATOR' || currentRole === 'MASTER';
  if (!form) return;
  if (warning) warning.style.display = isAllowed ? 'none' : '';
  if (buttons) {
    buttons.forEach((el) => {
      el.disabled = !isAllowed;
    });
  }
}

async function saveSerial(event) {
  event.preventDefault();
  const payload = {
    title: getElement('serial-title').value.trim(),
    issn: getElement('serial-issn').value.trim() || null,
    acquisition_type: getElement('serial-type').value,
    shelf_section: getElement('serial-shelf').value.trim(),
    shelf_row: parseInt(getElement('serial-row').value, 10) || null,
    shelf_column: parseInt(getElement('serial-column').value, 10) || null,
    shelf_note: getElement('serial-note').value.trim() || null,
    remark: getElement('serial-remark').value.trim() || null
  };
  if (!payload.title) {
    alert('서적명을 입력하세요.');
    return;
  }
  if (!payload.shelf_section) {
    alert('배치서가를 입력하세요.');
    return;
  }
  if (payload.shelf_row && (payload.shelf_row < 1 || payload.shelf_row > 5)) {
    alert('서가 위치(열)는 1~5 사이로 입력하세요.');
    return;
  }
  if (payload.shelf_column && (payload.shelf_column < 1 || payload.shelf_column > 5)) {
    alert('서가 위치(칸)는 1~5 사이로 입력하세요.');
    return;
  }
  if (selectedSerial) {
    await apiRequest(`/serials/${selectedSerial.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } else {
    await apiRequest('/serials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }
  await loadSerials();
  clearSelection();
}

async function deleteSerial() {
  if (!selectedSerial) return;
  if (!confirm('선택한 연속 간행물을 삭제할까요?')) return;
  await apiRequest(`/serials/${selectedSerial.id}`, { method: 'DELETE' });
  await loadSerials();
  clearSelection();
}

function bindEvents() {
  getElement('search-button')?.addEventListener('click', loadSerials);
  getElement('search-reset')?.addEventListener('click', () => {
    getElement('search-keyword').value = '';
    getElement('search-issn').value = '';
    getElement('search-shelf').value = '';
    getElement('search-type').value = '';
    loadSerials();
  });
  getElement('serial-form')?.addEventListener('submit', saveSerial);
  getElement('serial-new')?.addEventListener('click', () => clearSelection());
  getElement('serial-delete')?.addEventListener('click', deleteSerial);
}

export async function initSerials() {
  const user = await loadUser();
  currentRole = user?.role || null;
  applyRoleGuard();
  bindEvents();
  await loadSerials();
}
