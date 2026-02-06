// File: /ui/js/serials.js
import { apiRequest } from './api.js';
import { loadUser } from './auth.js';

const acquisitionLabels = {
  UNCLASSIFIED: '미분류',
  DONATION: '수증',
  SUBSCRIPTION: '구독'
};

let serials = [];
let selectedSerial = null;
let currentRole = null;
let layouts = [];
let shelfTypes = [];
let shelves = [];
let selectedShelf = null;
let highlightedShelfId = null;

// Canvas & Edit State
const GRID_SIZE = 20;
let editMode = 'select'; // 'select', 'wall', 'eraser'
let isDrawing = false;
let startPoint = null;
let tempWall = null;
let wallList = []; // Array of {x1, y1, x2, y2}
let draggedShelfType = null;

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
  const shelf = serial?.shelf_id ? getShelfById(serial.shelf_id) : null;
  if (shelf?.code) {
    parts.push(shelf.code);
  } else if (serial.shelf_section) {
    parts.push(serial.shelf_section);
  }
  if (serial.shelf_row && serial.shelf_column) {
    parts.push(`${serial.shelf_row}열 ${serial.shelf_column}칸`);
  } else if (serial.shelf_row) {
    parts.push(`${serial.shelf_row}열`);
  }
  return parts.join(' · ') || '-';
}

function getShelfTypeById(id) {
  return shelfTypes.find((type) => type.id === id) || null;
}

function getShelfById(id) {
  return shelves.find((shelf) => shelf.id === id) || null;
}

function formatShelfLabel(serial) {
  const shelf = serial?.shelf_id ? getShelfById(serial.shelf_id) : null;
  return shelf?.code || serial?.shelf_section || '-';
}

function getPublicationsForShelf(shelfId) {
  return serials.filter((item) => item.shelf_id === shelfId);
}

function clearShelfTooltip() {
  const tooltip = getElement('layout-tooltip');
  if (tooltip) tooltip.remove();
}

function showShelfTooltip(shelf, shelfType, svgBounds) {
  const container = getElement('layout-canvas');
  if (!container || !selectedLayout) return;
  clearShelfTooltip();
  const tooltip = document.createElement('div');
  tooltip.id = 'layout-tooltip';
  tooltip.className = 'layout-tooltip';
  const publications = getPublicationsForShelf(shelf.id);
  const listHtml = publications.length
    ? `<ul>${publications.map((item) => `<li>${item.title}</li>`).join('')}</ul>`
    : '<div class="muted">배치된 간행물이 없습니다.</div>';
  tooltip.innerHTML = `
    <h4>${shelf.code}</h4>
    <div class="muted">${shelfType?.name ?? '서가'}</div>
    ${listHtml}
  `;
  container.appendChild(tooltip);

  const scaleX = svgBounds.width / selectedLayout.width;
  const scaleY = svgBounds.height / selectedLayout.height;
  const offsetX = (shelf.x + (shelfType?.width ?? 80) / 2) * scaleX;
  const offsetY = (shelf.y + (shelfType?.height ?? 40) / 2) * scaleY;
  tooltip.style.left = `${offsetX + 16}px`;
  tooltip.style.top = `${offsetY + 16}px`;
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
    highlightedShelfId = null;
    renderLayout();
    return;
  }
  setText('detail-title', serial.title);
  setText('detail-issn', serial.issn || '-');
  setText('detail-type', formatAcquisition(serial.acquisition_type));
  setText('detail-shelf', formatShelfLabel(serial));
  setText('detail-location', formatLocation(serial));
  setText('detail-note', serial.shelf_note || serial.remark || '-');
  renderShelfMap(serial.shelf_row, serial.shelf_column);
  highlightedShelfId = serial.shelf_id || null;
  renderLayout();
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
  getElement('serial-type').value = serial?.acquisition_type || 'UNCLASSIFIED';
  getElement('serial-shelf').value = serial?.shelf_section || '';
  const shelfSelect = getElement('serial-shelf-id');
  if (shelfSelect) {
    shelfSelect.value = serial?.shelf_id || '';
  }
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

function renderLayoutLegend() {
  const legend = getElement('layout-legend');
  if (!legend) return;
  if (!shelfTypes.length) {
    legend.textContent = '서가 타입을 등록하면 범례가 표시됩니다.';
    return;
  }
  legend.innerHTML = '';
  shelfTypes.forEach((type) => {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `<span class="legend-swatch"></span>${type.name}`;
    legend.appendChild(item);
  });
}

function renderLayout() {
  const container = getElement('layout-canvas');
  if (!container) return;
  if (!selectedLayout) {
    container.innerHTML = '<div class="muted">배치도를 먼저 등록하세요.</div>';
    return;
  }
  container.innerHTML = '';
  // Force fixed size logic if not present
  const width = 800; // Fixed canvas width/height as per request (or make it responsive but fixed ratio)
  const height = 600;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  // Use fixed size for coordinate system
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.classList.add('layout-svg');
  // Make SVG fill the container but keep aspect ratio 

  renderGrid(svg, width, height);
  renderWalls(svg);

  container.appendChild(svg);
  clearShelfTooltip();

  const layoutShelves = shelves.filter((shelf) => shelf.layout_id === selectedLayout.id);
  let highlightedShelf = null;
  layoutShelves.forEach((shelf) => {
    const shelfType = getShelfTypeById(shelf.shelf_type_id);
    // New Size Logic: Unit based
    // Default 20px per unit (GRID_SIZE)
    const unitSize = GRID_SIZE;
    const width = (shelfType?.columns || 5) * unitSize;
    const height = (shelfType?.rows || 5) * unitSize;
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', shelf.x);
    rect.setAttribute('y', shelf.y);
    rect.setAttribute('width', width);
    rect.setAttribute('height', height);
    rect.classList.add('layout-shelf');
    if (selectedShelf?.id === shelf.id) rect.classList.add('selected');
    if (highlightedShelfId === shelf.id) {
      rect.classList.add('highlight');
      highlightedShelf = shelf;
    }

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', shelf.x + width / 2);
    label.setAttribute('y', shelf.y + height / 2 + 4);
    label.setAttribute('text-anchor', 'middle');
    label.classList.add('layout-label');
    label.textContent = shelf.code;

    if (shelf.rotation) {
      const cx = shelf.x + width / 2;
      const cy = shelf.y + height / 2;
      group.setAttribute('transform', `rotate(${shelf.rotation}, ${cx}, ${cy})`);
    }

    rect.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent canvas click
      highlightedShelfId = shelf.id;
      if (getElement('shelf-form')) {
        selectedShelf = shelf;
        setShelfForm(shelf);
        renderShelfTable();
      }
      renderLayout();
    });

    group.appendChild(rect);
    group.appendChild(label);
    svg.appendChild(group);
  });

  if (highlightedShelf) {
    const shelfType = getShelfTypeById(highlightedShelf.shelf_type_id);
    const bounds = svg.getBoundingClientRect();
    showShelfTooltip(highlightedShelf, shelfType, bounds);
  }

  // Draw Temp Wall
  if (tempWall) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', tempWall.x1);
    line.setAttribute('y1', tempWall.y1);
    line.setAttribute('x2', tempWall.x2);
    line.setAttribute('y2', tempWall.y2);
    line.classList.add('layout-wall', 'preview');
    svg.appendChild(line);
  }
}

function renderGrid(svg, width, height) {
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  group.classList.add('grid-layer');

  // Vertical lines
  for (let x = 0; x <= width; x += GRID_SIZE) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x);
    line.setAttribute('y1', 0);
    line.setAttribute('x2', x);
    line.setAttribute('y2', height);
    line.setAttribute('stroke', '#eee');
    line.setAttribute('stroke-width', '1');
    if (x % (GRID_SIZE * 5) === 0) line.setAttribute('stroke', '#ddd'); // Major line every 5 cells
    group.appendChild(line);
  }

  // Horizontal lines
  for (let y = 0; y <= height; y += GRID_SIZE) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', 0);
    line.setAttribute('y1', y);
    line.setAttribute('x2', width);
    line.setAttribute('y2', y);
    line.setAttribute('stroke', '#eee');
    line.setAttribute('stroke-width', '1');
    if (y % (GRID_SIZE * 5) === 0) line.setAttribute('stroke', '#ddd');
    group.appendChild(line);
  }
  svg.appendChild(group);
}

function renderWalls(svg) {
  if (!selectedLayout?.config?.walls) return;
  selectedLayout.config.walls.forEach(wall => {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', wall.x1);
    line.setAttribute('y1', wall.y1);
    line.setAttribute('x2', wall.x2);
    line.setAttribute('y2', wall.y2);
    line.classList.add('layout-wall');

    // Eraser interaction
    line.addEventListener('click', async (e) => {
      if (editMode === 'eraser') {
        e.stopPropagation();
        if (confirm('이 벽을 삭제하시겠습니까?')) {
          const idx = selectedLayout.config.walls.indexOf(wall);
          if (idx > -1) {
            selectedLayout.config.walls.splice(idx, 1);
            await saveLayoutConfig();
          }
        }
      }
    });

    svg.appendChild(line);
  });
}

function snapToGrid(val) {
  return Math.round(val / GRID_SIZE) * GRID_SIZE;
}

async function saveLayoutConfig() {
  if (!selectedLayout) return;
  try {
    await apiRequest(`/serials/layouts/${selectedLayout.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: selectedLayout.config
      })
    });
    renderLayout();
  } catch (e) {
    console.error("Config save failed", e);
  }
}

function renderLayoutSelect() {
  const select = getElement('layout-select');
  if (!select) return;
  select.innerHTML = '';
  layouts.forEach((layout) => {
    const option = document.createElement('option');
    option.value = layout.id;
    option.textContent = layout.name;
    if (selectedLayout?.id === layout.id) option.selected = true;
    select.appendChild(option);
  });
}

function renderShelfTypeSelects() {
  const select = getElement('shelf-type-select');
  if (!select) return;
  select.innerHTML = '';
  shelfTypes.forEach((type) => {
    const option = document.createElement('option');
    option.value = type.id;
    option.textContent = type.name;
    if (selectedShelf?.shelf_type_id === type.id) option.selected = true;
    select.appendChild(option);
  });
}

function renderShelfSelect() {
  const select = getElement('serial-shelf-id');
  if (!select) return;
  select.innerHTML = '<option value="">배치도에서 선택</option>';
  shelves.forEach((shelf) => {
    const option = document.createElement('option');
    option.value = shelf.id;
    option.textContent = shelf.code;
    select.appendChild(option);
  });
}

function renderShelfTypeTable() {
  const tbody = getElement('shelf-type-table')?.querySelector('tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  shelfTypes.forEach((type) => {
    const tr = document.createElement('tr');
    if (selectedShelfType?.id === type.id) tr.classList.add('selected');
    tr.innerHTML = `
      <td>${type.name}</td>
      <td>${type.rows}×${type.columns}</td>
      <td>
        <div class="draggable-handle" draggable="true" data-id="${type.id}">✋ 드래그</div>
      </td>
    `;
    const handle = tr.querySelector('.draggable-handle');
    handle.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', type.id);
      e.dataTransfer.effectAllowed = 'copy';
      draggedShelfType = type;
    });
    tr.addEventListener('click', () => {
      selectedShelfType = type;
      setShelfTypeForm(type);
      renderShelfTypeTable();
    });
    tbody.appendChild(tr);
  });
}

function renderShelfTable() {
  const tbody = getElement('shelf-table')?.querySelector('tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  const layoutShelves = selectedLayout
    ? shelves.filter((shelf) => shelf.layout_id === selectedLayout.id)
    : shelves;
  layoutShelves.forEach((shelf) => {
    const shelfType = getShelfTypeById(shelf.shelf_type_id);
    const tr = document.createElement('tr');
    if (selectedShelf?.id === shelf.id) tr.classList.add('selected');
    tr.innerHTML = `
      <td>${shelf.code}</td>
      <td>${shelfType?.name ?? '-'}</td>
      <td>${shelf.x}, ${shelf.y}</td>
    `;
    tr.addEventListener('click', () => {
      selectedShelf = shelf;
      setShelfForm(shelf);
      renderLayout();
      renderShelfTable();
    });
    tbody.appendChild(tr);
  });
}

function setLayoutForm(layout) {
  const form = getElement('layout-form');
  if (!form) return;
  form.dataset.layoutId = layout?.id || '';
  getElement('layout-name').value = layout?.name || '';
  getElement('layout-width').value = layout?.width ?? '';
  getElement('layout-height').value = layout?.height ?? '';
  getElement('layout-note').value = layout?.note || '';
}

function setShelfTypeForm(type) {
  const form = getElement('shelf-type-form');
  if (!form) return;
  form.dataset.shelfTypeId = type?.id || '';
  getElement('shelf-type-name').value = type?.name || '';
  getElement('shelf-type-width').value = type?.width ?? '';
  getElement('shelf-type-height').value = type?.height ?? '';
  getElement('shelf-type-rows').value = type?.rows ?? '';
  getElement('shelf-type-columns').value = type?.columns ?? '';
  getElement('shelf-type-note').value = type?.note || '';
}

function setShelfForm(shelf) {
  const form = getElement('shelf-form');
  if (!form) return;
  form.dataset.shelfId = shelf?.id || '';
  getElement('shelf-code').value = shelf?.code || '';
  getElement('shelf-type-select').value = shelf?.shelf_type_id || '';
  getElement('shelf-x').value = shelf?.x ?? '';
  getElement('shelf-y').value = shelf?.y ?? '';
  getElement('shelf-rotation').value = shelf?.rotation ?? '';
  getElement('shelf-note').value = shelf?.note || '';
}

async function loadLayouts() {
  layouts = await apiRequest('/serials/layouts');
  if (!selectedLayout && layouts.length) {
    selectedLayout = layouts[0];
  }
}

async function loadShelfTypes() {
  shelfTypes = await apiRequest('/serials/shelf-types');
}

async function loadShelves() {
  shelves = await apiRequest('/serials/shelves');
}

async function refreshLayoutData() {
  await Promise.all([loadLayouts(), loadShelfTypes(), loadShelves()]);
  setLayoutForm(selectedLayout);
  setShelfTypeForm(selectedShelfType);
  setShelfForm(selectedShelf);
  renderLayoutSelect();
  renderShelfTypeSelects();
  renderShelfSelect();
  renderLayoutLegend();
  renderLayout();
  renderShelfTypeTable();
  renderShelfTable();
}

async function saveLayout(event) {
  event.preventDefault();
  const form = getElement('layout-form');
  if (!form) return;
  const payload = {
    name: getElement('layout-name').value.trim(),
    note: getElement('layout-note').value.trim() || null,
    config: selectedLayout?.config || {}
  };
  if (!payload.name) {
    alert('배치도 이름을 입력하세요.');
    return;
  }
  if (form.dataset.layoutId) {
    await apiRequest(`/serials/layouts/${form.dataset.layoutId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } else {
    await apiRequest('/serials/layouts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }
  await refreshLayoutData();
}

async function deleteLayout() {
  if (!selectedLayout) return;
  if (!confirm('현재 배치도를 삭제하시겠습니까?\n포함된 모든 서가 배치가 함께 삭제됩니다.')) return;

  try {
    await apiRequest(`/serials/layouts/${selectedLayout.id}`, { method: 'DELETE' });
    alert('배치도가 삭제되었습니다.');
    selectedLayout = null;
    await refreshLayoutData();
  } catch (error) {
    console.error(error);
    alert('배치도 삭제 중 오류가 발생했습니다.');
  }
}

async function saveShelfType(event) {
  event.preventDefault();
  const form = getElement('shelf-type-form');
  if (!form) return;
  const payload = {
    name: getElement('shelf-type-name').value.trim(),
    width: parseInt(getElement('shelf-type-width').value, 10) || 80,
    height: parseInt(getElement('shelf-type-height').value, 10) || 40,
    rows: parseInt(getElement('shelf-type-rows').value, 10) || 5,
    columns: parseInt(getElement('shelf-type-columns').value, 10) || 5,
    note: getElement('shelf-type-note').value.trim() || null
  };
  if (!payload.name) {
    alert('서가 타입명을 입력하세요.');
    return;
  }
  if (form.dataset.shelfTypeId) {
    await apiRequest(`/serials/shelf-types/${form.dataset.shelfTypeId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } else {
    await apiRequest('/serials/shelf-types', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }
  await refreshLayoutData();
}

async function saveShelf(event) {
  event.preventDefault();
  const form = getElement('shelf-form');
  if (!form || !selectedLayout) return;
  const payload = {
    layout_id: selectedLayout.id,
    shelf_type_id: getElement('shelf-type-select').value,
    code: getElement('shelf-code').value.trim(),
    x: parseInt(getElement('shelf-x').value, 10) || 0,
    y: parseInt(getElement('shelf-y').value, 10) || 0,
    rotation: parseInt(getElement('shelf-rotation').value, 10) || 0,
    note: getElement('shelf-note').value.trim() || null
  };
  if (!payload.code) {
    alert('서가 명칭을 입력하세요.');
    return;
  }
  if (!payload.shelf_type_id) {
    alert('서가 타입을 선택하세요.');
    return;
  }
  if (form.dataset.shelfId) {
    await apiRequest(`/serials/shelves/${form.dataset.shelfId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } else {
    await apiRequest('/serials/shelves', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }
  await refreshLayoutData();
}

async function deleteShelf() {
  if (!selectedShelf) return;
  if (!confirm('선택한 서가를 삭제할까요?')) return;
  await apiRequest(`/serials/shelves/${selectedShelf.id}`, { method: 'DELETE' });
  selectedShelf = null;
  await refreshLayoutData();
}

function applyRoleGuard() {
  const forms = [
    getElement('serial-form'),
    getElement('layout-form'),
    getElement('shelf-type-form'),
    getElement('shelf-form')
  ].filter(Boolean);
  const warning = getElement('serials-permission');
  const isAllowed = currentRole === 'OPERATOR' || currentRole === 'MASTER';
  if (warning) warning.style.display = isAllowed ? 'none' : '';
  forms.forEach((form) => {
    form.querySelectorAll('button, input, select, textarea').forEach((el) => {
      el.disabled = !isAllowed;
    });
  });
}

async function saveSerial(event) {
  event.preventDefault();
  const shelfId = getElement('serial-shelf-id')?.value || null;
  const shelfFromSelect = shelfId ? getShelfById(shelfId) : null;
  const shelfSectionInput = getElement('serial-shelf').value.trim();
  const payload = {
    title: getElement('serial-title').value.trim(),
    issn: getElement('serial-issn').value.trim() || null,
    acquisition_type: getElement('serial-type').value,
    shelf_section: shelfSectionInput || shelfFromSelect?.code || '',
    shelf_id: shelfId || null,
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
    await apiRequest(`/serials/publications/${selectedSerial.id}`, {
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
  await apiRequest(`/serials/publications/${selectedSerial.id}`, { method: 'DELETE' });
  await loadSerials();
  clearSelection();
}

function bindEvents() {
  getElement('search-button')?.addEventListener('click', loadSerials);
  getElement('serials-logo')?.addEventListener('click', () => {
    window.location.href = 'serials_home.html';
  });
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
  getElement('layout-form')?.addEventListener('submit', saveLayout);
  getElement('layout-reset')?.addEventListener('click', () => {
    selectedLayout = null;
    setLayoutForm(null);
    renderLayoutSelect();
    renderLayout();
  });
  getElement('layout-select')?.addEventListener('change', (event) => {
    const next = layouts.find((layout) => layout.id === event.target.value);
    selectedLayout = next || null;
    setLayoutForm(selectedLayout);
    renderLayout();
    renderShelfTable();
  });
  getElement('shelf-type-form')?.addEventListener('submit', saveShelfType);
  getElement('shelf-type-reset')?.addEventListener('click', () => {
    selectedShelfType = null;
    setShelfTypeForm(null);
    renderShelfTypeTable();
  });
  getElement('shelf-form')?.addEventListener('submit', saveShelf);
  getElement('shelf-reset')?.addEventListener('click', () => {
    selectedShelf = null;
    setShelfForm(null);
    renderLayout();
    renderShelfTable();
  });
  getElement('shelf-delete')?.addEventListener('click', deleteShelf);

  // Tool Switching
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      editMode = btn.dataset.mode;
    });
  });

  // Init Canvas Interactions
  initCanvasEvents();
}

function initCanvasEvents() {
  const container = getElement('layout-canvas');
  if (!container) return;

  container.addEventListener('mousedown', (e) => {
    if (!selectedLayout) return;
    if (editMode === 'wall') {
      const svg = container.querySelector('svg');
      const pt = getCanvasCoordinates(e, svg);
      isDrawing = true;
      startPoint = pt;
    }
  });

  container.addEventListener('mousemove', (e) => {
    if (!selectedLayout) return;
    if (editMode === 'wall' && isDrawing && startPoint) {
      const svg = container.querySelector('svg');
      const pt = getCanvasCoordinates(e, svg);
      // Snap to grid for end point
      const x2 = snapToGrid(pt.x);
      const y2 = snapToGrid(pt.y);
      const x1 = snapToGrid(startPoint.x);
      const y1 = snapToGrid(startPoint.y);

      // Constrain to straight lines?
      // Let's allow free lines for now or snap to axis
      // Optional: Snap to axis
      // if (Math.abs(x2 - x1) < Math.abs(y2 - y1)) { x2 = x1; } else { y2 = y1; }

      tempWall = { x1, y1, x2, y2 };
      renderLayout();
    }
  });

  container.addEventListener('mouseup', async (e) => {
    if (!selectedLayout) return;
    if (editMode === 'wall' && isDrawing && tempWall) {
      if (!selectedLayout.config) selectedLayout.config = {};
      if (!selectedLayout.config.walls) selectedLayout.config.walls = [];

      // Only add if length > 0
      if (tempWall.x1 !== tempWall.x2 || tempWall.y1 !== tempWall.y2) {
        selectedLayout.config.walls.push({ ...tempWall });
        await saveLayoutConfig();
      }
    }
    isDrawing = false;
    startPoint = null;
    tempWall = null;
    renderLayout();
  });

  // Drag & Drop
  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });

  container.addEventListener('drop', async (e) => {
    e.preventDefault();
    const shelfTypeId = e.dataTransfer.getData('text/plain');
    if (!shelfTypeId || !selectedLayout) return;

    const svg = container.querySelector('svg');
    const pt = getCanvasCoordinates(e, svg);
    const x = snapToGrid(pt.x);
    const y = snapToGrid(pt.y);

    const shelfType = getShelfTypeById(shelfTypeId);
    if (!shelfType) return;

    // Auto-generate code
    const code = `S-${shelves.length + 1}`; // Simple auto-naming

    try {
      await apiRequest('/serials/shelves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          layout_id: selectedLayout.id,
          shelf_type_id: shelfTypeId,
          code: code,
          x, y,
          rotation: 0,
          note: null
        })
      });
      await refreshLayoutData();
    } catch (err) {
      console.error(err);
      alert('서가 배치에 실패했습니다.');
    }
  });
}

function getCanvasCoordinates(event, svg) {
  const pt = svg.createSVGPoint();
  pt.x = event.clientX;
  pt.y = event.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}

export async function initSerials() {
  const user = await loadUser();
  currentRole = user?.role || null;
  applyRoleGuard();
  bindEvents();
  await refreshLayoutData();
  await loadSerials();
  renderLayout();
}
