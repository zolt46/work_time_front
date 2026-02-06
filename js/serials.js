// File: /ui/js/serials.js
import { apiRequest } from './api.js';
import { loadUser } from './auth.js';

// --- Global State ---
let currentRole = null;
let serials = [];
let layouts = [];
let shelfTypes = [];
let shelves = [];

// Edit State (Manage Page)
let editingSerialId = null;

// Editor State (Layout Page)
let currentLayout = null;
let currentMode = 'view'; // 'view'|'select'|'wall'
let editorScale = 1.0;
let editorPan = { x: 0, y: 0 };
const UNIT_SIZE = 20;
const GRID_SIZE = 10;

let selectedElement = null; // { type: 'shelf'|'wall', ... }
let dragOffset = { x: 0, y: 0 };
let panStart = { x: 0, y: 0 };

const acquisitionLabels = {
  UNCLASSIFIED: '미분류',
  DONATION: '수증',
  SUBSCRIPTION: '구독'
};

// --- Initialization ---
export async function initSerials() {
  try {
    const user = await loadUser();
    currentRole = user?.role || null;
    applyRoleGuard();

    const isEditor = !!document.getElementById('editor-toolbar');
    const isManage = !!document.getElementById('serial-form');
    const isHomeOrList = !isEditor && !isManage && (!!document.getElementById('serials-total-count') || !!document.getElementById('serials-table'));

    // Use Promise.allSettled to prevent one failure from blocking everything
    await Promise.allSettled([loadLayouts(), loadShelfTypes()]);

    if (isHomeOrList || isManage) {
      await loadSerials().catch(console.error);
      if (layouts.length > 0) {
        await loadShelves(layouts[0].id).catch(console.error);
      }
    }

    if (isHomeOrList) {
      if (layouts.length > 0) await selectLayout(layouts[0].id, false);
      bindListEvents();
      renderStats();
      renderList();
      renderLayoutLegend();
    }

    if (isManage) {
      renderStats();
      renderList();
      renderShelfOptions();
      bindManageEvents();
    }

    if (isEditor) {
      currentMode = 'select';
      renderLayoutSelect(); // Render immediately after load
      renderShelfPalette(); // Render immediately after load

      if (layouts.length > 0) {
        await selectLayout(layouts[0].id, true);
      } else {
        showEmptyState();
      }
      bindToolbarEvents();
      bindDialogEvents();

      document.querySelectorAll('dialog').forEach(d => {
        try { d.close(); } catch (e) { }
        d.style.display = 'none';
      });
    }

    bindCanvasEvents(isEditor);
    bindSidebarEvents();

  } catch (err) {
    console.warn("Init error (likely listener timeout):", err);
  }
}

function applyRoleGuard() {
  const isOperator = currentRole === 'OPERATOR' || currentRole === 'MASTER';
  document.body.classList.toggle('role-operator', isOperator);

  const protectedBtns = document.querySelectorAll('#layout-create-btn, #layout-delete-btn, #save-layout-btn, #manage-types-btn, .action-btn');
  protectedBtns.forEach(btn => btn.disabled = !isOperator);

  const form = document.getElementById('serial-form');
  if (form && !isOperator) {
    form.querySelectorAll('input, select, textarea, button').forEach(el => el.disabled = true);
    document.getElementById('serials-permission').style.display = 'block';
  }
}

// --- Data Loading ---
async function loadLayouts() {
  layouts = await apiRequest('/serials/layouts');
}

async function loadShelfTypes() {
  shelfTypes = await apiRequest('/serials/shelf-types');
}

async function loadShelves(layoutId) {
  if (!layoutId) return [];
  shelves = await apiRequest(`/serials/shelves?layout_id=${layoutId}`);
}

async function loadSerials() {
  const query = buildQuery();
  const url = query ? `/serials?${query}` : '/serials';
  serials = await apiRequest(url);
}

function buildQuery() {
  const params = new URLSearchParams();
  const keyword = document.getElementById('search-keyword')?.value?.trim() ?? '';
  const issn = document.getElementById('search-issn')?.value?.trim() ?? '';
  const shelf = document.getElementById('search-shelf')?.value?.trim() ?? '';
  const type = document.getElementById('search-type')?.value ?? '';
  if (keyword) params.set('q', keyword);
  if (issn) params.set('issn', issn);
  if (shelf) params.set('shelf_section', shelf);
  if (type) params.set('acquisition_type', type);
  return params.toString();
}

// --- Manage Page Logic ---
function renderShelfOptions() {
  const select = document.getElementById('serial-shelf-id');
  if (!select) return;
  // We should ideally fetch ALL shelves or group by layout. 
  // Using current loaded shelves (likely layout[0])
  select.innerHTML = '<option value="">배치도에서 선택 (또는 직접 입력)</option>' +
    shelves.map(s => `<option value="${s.id}">${s.code} (Layout ${s.layout_id})</option>`).join('');
}

function bindManageEvents() {
  const form = document.getElementById('serial-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      title: document.getElementById('serial-title').value,
      issn: document.getElementById('serial-issn').value,
      acquisition_type: document.getElementById('serial-type').value,
      shelf_section: document.getElementById('serial-shelf').value,
      shelf_id: document.getElementById('serial-shelf-id').value || null,
      shelf_row: parseInt(document.getElementById('serial-row').value) || null,
      shelf_column: parseInt(document.getElementById('serial-column').value) || null,
      note: document.getElementById('serial-note').value,
      remark: document.getElementById('serial-remark').value
    };

    const url = editingSerialId ? `/serials/${editingSerialId}` : '/serials';
    const method = editingSerialId ? 'PUT' : 'POST';

    try {
      await apiRequest(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      alert('저장되었습니다.');
      await loadSerials();
      renderList();
      resetManageForm();
    } catch (err) {
      console.error(err);
      alert('오류: ID가 유효하지 않거나 이미 삭제되었을 수 있습니다.');
    }
  });

  document.getElementById('serial-new')?.addEventListener('click', resetManageForm);
  document.getElementById('serial-delete')?.addEventListener('click', async () => {
    if (!editingSerialId) return;
    if (confirm('삭제하시겠습니까?')) {
      try {
        await apiRequest(`/serials/${editingSerialId}`, { method: 'DELETE' });
        await loadSerials();
        renderList();
        resetManageForm();
      } catch (err) {
        console.error(err);
        alert('오류: ' + err.message);
      }
    }
  });
}

function resetManageForm() {
  editingSerialId = null;
  document.getElementById('serial-form').reset();
  document.getElementById('serial-delete').style.display = 'none';

  // Clear selection
  document.querySelectorAll('#serials-table tbody tr').forEach(r => r.classList.remove('active', 'selected'));
}

function populateManageForm(serial) {
  editingSerialId = serial.id;
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };

  setVal('serial-title', serial.title);
  setVal('serial-issn', serial.issn);
  setVal('serial-type', serial.acquisition_type);
  setVal('serial-shelf', serial.shelf_section);
  setVal('serial-shelf-id', serial.shelf_id);
  setVal('serial-row', serial.shelf_row);
  setVal('serial-column', serial.shelf_column);
  setVal('serial-note', serial.note);
  setVal('serial-remark', serial.remark);

  document.getElementById('serial-delete').style.display = 'inline-block';
}


// --- List & Stats ---
function renderStats() {
  if (!document.getElementById('serials-total-count')) return;
  document.getElementById('serials-total-count').textContent = serials.length.toLocaleString();
  document.getElementById('serials-donation-count').textContent = serials.filter(s => s.acquisition_type === 'DONATION').length.toLocaleString();
  document.getElementById('serials-subscription-count').textContent = serials.filter(s => s.acquisition_type === 'SUBSCRIPTION').length.toLocaleString();
}

function renderList() {
  const tbody = document.getElementById('serials-table')?.querySelector('tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (serials.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="muted center">데이터가 없습니다.</td></tr>';
    return;
  }

  const isManage = !!document.getElementById('serial-form');

  serials.forEach(s => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
         <td>${s.title}</td>
         <td>${s.issn || '-'}</td>
         <td>${acquisitionLabels[s.acquisition_type]}</td>
         <td>${formatShelfLabel(s)}</td>
       `;
    tr.addEventListener('click', () => {
      // Highlight logic
      tbody.querySelectorAll('tr').forEach(r => r.classList.remove('active', 'selected'));
      tr.classList.add('active', 'selected'); // Add 'selected' for styling

      if (isManage) {
        populateManageForm(s);
      } else {
        showSerialDetail(s);
      }
    });
    tbody.appendChild(tr);
  });

  const status = document.getElementById('serials-status');
  if (status) status.textContent = `${serials.length}건 표시 중`;
}

function showSerialDetail(serial) {
  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setText('detail-title', serial.title);
  setText('detail-issn', serial.issn || '-');
  setText('detail-type', acquisitionLabels[serial.acquisition_type]);
  setText('detail-shelf', formatShelfLabel(serial));
  setText('detail-location', serial.shelf_section || '-');
  setText('detail-note', serial.note || '-');

  if (serial.shelf_id) {
    const shelf = shelves.find(s => s.id === serial.shelf_id);
    if (shelf) selectElement('shelf', shelf);
  }
}

function formatShelfLabel(serial) {
  if (serial.shelf_code) return serial.shelf_code;
  const shelf = shelves.find(s => s.id === serial.shelf_id);
  return shelf ? shelf.code : (serial.shelf_section || '-');
}

function bindListEvents() {
  document.getElementById('search-button')?.addEventListener('click', async () => {
    await loadSerials(); renderList();
  });
  document.getElementById('search-reset')?.addEventListener('click', async () => {
    ['search-keyword', 'search-issn', 'search-shelf'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const typeEl = document.getElementById('search-type'); if (typeEl) typeEl.value = '';
    await loadSerials(); renderList();
  });
}

function renderLayoutLegend() {
  const legend = document.getElementById('layout-legend');
  if (!legend) return;
  legend.innerHTML = shelfTypes.map(t => `<div class="legend-item"><span class="legend-swatch"></span>${t.name}</div>`).join('');
}


// --- Canvas Rendering (Shared) ---
function renderCanvas() {
  const canvasEl = document.getElementById('layout-canvas');
  if (!canvasEl) return;
  if (!currentLayout) {
    canvasEl.innerHTML = '<div class="muted center-message">배치도가 없습니다.</div>';
    return;
  }

  canvasEl.innerHTML = '';

  const width = 800;
  const height = 600;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  // svg.setAttribute('viewBox', `0 0 ${width} ${height}`); // viewbox conflicts with pan/zoom if naive
  // We use a root Group for Pan/Zoom, so viewBox can stay or be removed. 
  // Better to use no viewBox and let SVG fill container, with rootGroup doing the work.

  const rootGroup = document.createElementNS(ns, 'g');
  rootGroup.setAttribute('transform', `translate(${editorPan.x}, ${editorPan.y}) scale(${editorScale})`);
  rootGroup.id = 'canvas-root';

  // Grid Pattern
  const defs = document.createElementNS(ns, 'defs');
  const pattern = document.createElementNS(ns, 'pattern');
  pattern.id = 'grid';
  pattern.setAttribute('width', GRID_SIZE);
  pattern.setAttribute('height', GRID_SIZE);
  pattern.setAttribute('patternUnits', 'userSpaceOnUse');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', `M ${GRID_SIZE} 0 L 0 0 0 ${GRID_SIZE}`);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', '#e2e8f0');
  path.setAttribute('stroke-width', '0.5');
  pattern.appendChild(path);
  defs.appendChild(pattern);
  svg.appendChild(defs);

  // Huge Grid Rect to cover 'infinite' space
  const gridRect = document.createElementNS(ns, 'rect');
  gridRect.setAttribute('x', -2000);
  gridRect.setAttribute('y', -2000);
  gridRect.setAttribute('width', 4000);
  gridRect.setAttribute('height', 4000);
  gridRect.setAttribute('fill', 'url(#grid)');
  rootGroup.appendChild(gridRect);

  const contentGroup = document.createElementNS(ns, 'g');
  contentGroup.id = 'canvas-content';

  // Layout Bounds (optional visual guide)
  const border = document.createElementNS(ns, 'rect');
  border.setAttribute('x', 0); border.setAttribute('y', 0);
  border.setAttribute('width', currentLayout.width || 800);
  border.setAttribute('height', currentLayout.height || 600);
  border.setAttribute('fill', 'none');
  border.setAttribute('stroke', '#cbd5e1');
  border.setAttribute('stroke-dasharray', '5,5');
  contentGroup.appendChild(border);

  (currentLayout.walls || []).forEach((wall, idx) => {
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', wall.x1);
    line.setAttribute('y1', wall.y1);
    line.setAttribute('x2', wall.x2);
    line.setAttribute('y2', wall.y2);
    line.classList.add('wall-line');
    if (selectedElement?.type === 'wall' && selectedElement.index === idx) line.classList.add('selected');
    line.dataset.index = idx;
    contentGroup.appendChild(line);
  });

  shelves.forEach(shelf => {
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('transform', `translate(${shelf.x}, ${shelf.y}) rotate(${shelf.rotation || 0})`);
    g.classList.add('shelf-group');
    if (selectedElement?.type === 'shelf' && selectedElement.id === shelf.id) g.classList.add('selected');
    g.dataset.id = shelf.id;

    const type = shelfTypes.find(t => t.id === shelf.shelf_type_id) || { width: 80, height: 40 };
    const rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('width', type.width);
    rect.setAttribute('height', type.height);
    const text = document.createElementNS(ns, 'text');
    text.setAttribute('x', type.width / 2);
    text.setAttribute('y', type.height / 2 + 4);
    text.setAttribute('text-anchor', 'middle');
    text.textContent = shelf.code;

    g.appendChild(rect);
    g.appendChild(text);
    contentGroup.appendChild(g);
  });

  // Drag Preview (Ghost)
  if (isDraggingShelf && draggingShelf) {
    // Already rendered as shelf-group? No, we might be dragging a NEW shelf from palette.
    // Or moving existing. 
    // If moving existing, it's already updated in render loop if we allow live update.
  }

  if (previewShelf) {
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('transform', `translate(${previewShelf.x}, ${previewShelf.y})`);
    g.style.opacity = '0.5';
    g.style.pointerEvents = 'none';

    const rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('width', previewShelf.width);
    rect.setAttribute('height', previewShelf.height);
    rect.setAttribute('fill', '#3b82f6');
    g.appendChild(rect);
    contentGroup.appendChild(g);
  }

  // Selection Rect
  if (isSelectingArea && selectionRect) {
    const r = document.createElementNS(ns, 'rect');
    r.setAttribute('x', selectionRect.x);
    r.setAttribute('y', selectionRect.y);
    r.setAttribute('width', selectionRect.width);
    r.setAttribute('height', selectionRect.height);
    r.setAttribute('fill', 'rgba(59, 130, 246, 0.2)');
    r.setAttribute('stroke', '#3b82f6');
    contentGroup.appendChild(r);
  }

  rootGroup.appendChild(contentGroup);
  svg.appendChild(rootGroup);
  canvasEl.appendChild(svg);
}


// --- Interaction Logic ---
let isDrawing = false;
let isPanning = false;
let isSelectingArea = false;
let startPoint = null;
let activeLine = null;
let isDraggingShelf = false;
let draggingShelf = null;
let previewShelf = null; // { x, y, width, height, typeId }
let selectionRect = null; // { x, y, width, height }

function bindCanvasEvents(isEditor) {
  const canvasEl = document.getElementById('layout-canvas');
  if (!canvasEl) return;

  // Wheel Zoom
  canvasEl.addEventListener('wheel', (e) => {
    if (!isEditor) return;
    e.preventDefault();
    const delta = e.deltaY;
    const zoomStep = 0.1;
    const newScale = editorScale + (delta > 0 ? -zoomStep : zoomStep);
    setZoom(newScale);
  });

  canvasEl.addEventListener('mousedown', (e) => {
    if (!currentLayout) return;

    // Right click (2) for Area Selection
    if (e.button === 2 && isEditor) {
      isSelectingArea = true;
      const pt = getWorldCoordinates(e, canvasEl);
      startPoint = pt;
      selectionRect = { x: pt.x, y: pt.y, width: 0, height: 0 };
      return;
    }

    // Middle Click (1) for Pan
    const pt = getCanvasCoordinates(e, canvasEl);
    const target = e.target.closest('.wall-line, .shelf-group');

    if (e.button === 1 || (currentMode === 'select' && !target && e.button === 0)) {
      isPanning = true;
      panStart = { x: e.clientX, y: e.clientY };
      canvasEl.style.cursor = 'grabbing';
      return;
    }

    if (isEditor && e.button === 0) {
      if (currentMode === 'wall') {
        isDrawing = true;
        const worldPt = getWorldCoordinates(e, canvasEl);
        const snapX = Math.round(worldPt.x / GRID_SIZE) * GRID_SIZE;
        const snapY = Math.round(worldPt.y / GRID_SIZE) * GRID_SIZE;
        startPoint = { x: snapX, y: snapY };
        activeLine = createSVGLine(snapX, snapY, snapX, snapY, ['wall-line', 'preview']);
        document.querySelector('#canvas-content').appendChild(activeLine);
      } else if (currentMode === 'select') {
        if (target) {
          if (target.classList.contains('wall-line')) {
            selectElement('wall', { index: parseInt(target.dataset.index), data: currentLayout.walls[parseInt(target.dataset.index)] });
          } else if (target.classList.contains('shelf-group')) {
            const shelf = shelves.find(s => s.id === target.dataset.id);
            selectElement('shelf', shelf);
            startShelfDrag(e, shelf, canvasEl);
          }
        } else {
          selectElement(null);
        }
      }
    }
    // Read-only logic..
  });

  canvasEl.addEventListener('mousemove', (e) => {
    if (isPanning) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      editorPan.x += dx;
      editorPan.y += dy;
      panStart = { x: e.clientX, y: e.clientY };
      renderCanvas();
      return;
    }

    if (isSelectingArea) {
      const pt = getWorldCoordinates(e, canvasEl);
      const x = Math.min(startPoint.x, pt.x);
      const y = Math.min(startPoint.y, pt.y);
      const w = Math.abs(pt.x - startPoint.x);
      const h = Math.abs(pt.y - startPoint.y);
      selectionRect = { x, y, width: w, height: h };
      renderCanvas();
      return;
    }

    if (!isEditor) return;
    const worldPt = getWorldCoordinates(e, canvasEl);
    const storedPt = {
      x: Math.round(worldPt.x / GRID_SIZE) * GRID_SIZE,
      y: Math.round(worldPt.y / GRID_SIZE) * GRID_SIZE
    };

    const coordEl = document.getElementById('cursor-coords');
    if (coordEl) coordEl.textContent = `${storedPt.x}, ${storedPt.y}`;

    if (isDrawing && activeLine) {
      const dx = Math.abs(storedPt.x - startPoint.x);
      const dy = Math.abs(storedPt.y - startPoint.y);

      if (dx > dy) {
        activeLine.setAttribute('x2', storedPt.x);
        activeLine.setAttribute('y2', startPoint.y);
      } else {
        activeLine.setAttribute('x2', startPoint.x);
        activeLine.setAttribute('y2', storedPt.y);
      }
    }

    if (isDraggingShelf && draggingShelf) {
      updateShelfDrag(e, canvasEl);
    }
  });

  canvasEl.addEventListener('mouseup', () => {
    if (isPanning) {
      isPanning = false;
      canvasEl.style.cursor = '';
      return;
    }

    if (isSelectingArea) {
      isSelectingArea = false;
      // Select elements in rect
      // (Ignoring multi-select for now, just cleanup rect)
      selectionRect = null;
      renderCanvas();
      return;
    }

    if (!isEditor) return;
    if (isDrawing && activeLine) {
      const x1 = parseFloat(activeLine.getAttribute('x1'));
      const y1 = parseFloat(activeLine.getAttribute('y1'));
      const x2 = parseFloat(activeLine.getAttribute('x2'));
      const y2 = parseFloat(activeLine.getAttribute('y2'));

      if (Math.abs(x1 - x2) > 0 || Math.abs(y1 - y2) > 0) {
        currentLayout.walls = currentLayout.walls || [];
        currentLayout.walls.push({ x1, y1, x2, y2 });
      }
      activeLine.remove();
      isDrawing = false;
      activeLine = null;
      renderCanvas();
    }
    if (isDraggingShelf) finishShelfDrag();
  });

  // Disable Context Menu for Right Click
  canvasEl.addEventListener('contextmenu', (e) => e.preventDefault());

  if (isEditor) {
    canvasEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';

      // Show Ghost
      const typeId = e.dataTransfer.types.find(t => t !== 'text/plain'); // Hack or store in variable
      // Actually we need to pass data via dragStart. 
      // Browser doesn't give data in dragover.
      // But we can store global 'draggingType'
    });
    canvasEl.addEventListener('drop', (e) => handleShelfDrop(e, canvasEl));
  }
}


// --- Editor Helpers ---
function createSVGLine(x1, y1, x2, y2, classes) {
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', x1); line.setAttribute('y1', y1);
  line.setAttribute('x2', x2); line.setAttribute('y2', y2);
  classes.forEach(c => line.classList.add(c));
  return line;
}

function getCanvasCoordinates(e, canvasEl) {
  const rect = canvasEl.querySelector('svg').getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function getWorldCoordinates(e, canvasEl) {
  const pt = getCanvasCoordinates(e, canvasEl);
  return {
    x: (pt.x - editorPan.x) / editorScale,
    y: (pt.y - editorPan.y) / editorScale
  };
}

function setZoom(scale) {
  editorScale = Math.max(0.1, Math.min(5.0, scale));
  renderCanvas();
  const el = document.getElementById('canvas-status-text');
  if (el) el.textContent = `Zoom: ${Math.round(editorScale * 100)}%`;
}

function selectElement(type, data) {
  if (type === null) {
    selectedElement = null;
  } else {
    selectedElement = { type, ...data };
  }
  renderCanvas();
  renderPropertiesPanel();
}


// --- Layout Management & Dialogs ---
async function selectLayout(layoutId, isEditor) {
  const layout = layouts.find(l => l.id === layoutId);
  if (!layout) return;

  currentLayout = layout;

  if (isEditor) {
    const select = document.getElementById('layout-select');
    if (select) select.value = layout.id;
    const delBtn = document.getElementById('layout-delete-btn');
    if (delBtn) delBtn.style.display = 'inline-block';

    selectedElement = null;
    currentMode = 'select'; // Reset mode
    updateToolbarUI();
    renderPropertiesPanel();
  }

  await loadShelves(layout.id);
  renderCanvas();
}

function showEmptyState() {
  const canvas = document.getElementById('layout-canvas');
  if (canvas) canvas.innerHTML = '<div class="muted center-message">배치도를 선택하거나 새로 만드세요.</div>';
  const delBtn = document.getElementById('layout-delete-btn');
  if (delBtn) delBtn.style.display = 'none';
}

async function createLayout(name, note) {
  const payload = { name, note, width: 800, height: 600, walls: [] };
  const newLayout = await apiRequest('/serials/layouts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  await loadLayouts();
  renderLayoutSelect();
  selectLayout(newLayout.id, true);
}

async function updateCurrentLayout() {
  if (!currentLayout) return;
  const payload = { name: currentLayout.name, note: currentLayout.note, walls: currentLayout.walls };
  await apiRequest(`/serials/layouts/${currentLayout.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  alert('배치도가 저장되었습니다.');
}

async function deleteCurrentLayout() {
  if (!currentLayout || !confirm(`'${currentLayout.name}' 삭제하시겠습니까?`)) return;
  await apiRequest(`/serials/layouts/${currentLayout.id}`, { method: 'DELETE' });
  currentLayout = null;
  await loadLayouts();
  renderLayoutSelect();

  if (layouts.length > 0) selectLayout(layouts[0].id, true);
  else showEmptyState();
}


// --- Event Bindings ---
function bindToolbarEvents() {
  const toolbar = document.getElementById('editor-toolbar');
  if (!toolbar) return;

  document.querySelectorAll('.tool-btn[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentMode = btn.dataset.mode;
      updateToolbarUI();
    });
  });

  document.getElementById('save-layout-btn')?.addEventListener('click', updateCurrentLayout);
  document.getElementById('zoom-in')?.addEventListener('click', () => setZoom(editorScale + 0.1));
  document.getElementById('zoom-out')?.addEventListener('click', () => setZoom(editorScale - 0.1));
  document.getElementById('zoom-reset')?.addEventListener('click', () => {
    editorPan = { x: 0, y: 0 };
    setZoom(1.0);
  });
  document.getElementById('layout-create-btn')?.addEventListener('click', () => {
    const d = document.getElementById('layout-meta-dialog');
    d.style.display = 'block';
    d.showModal();
  });
  document.getElementById('layout-delete-btn')?.addEventListener('click', deleteCurrentLayout);
  document.getElementById('manage-types-btn')?.addEventListener('click', () => {
    const d = document.getElementById('shelf-type-dialog');
    d.style.display = 'block';
    d.showModal();
    renderShelfTypeList();
  });
}

function updateToolbarUI() {
  const statusText = document.getElementById('canvas-status-text');
  // We can update status text here
}

function bindDialogEvents() {
  const closeBtns = document.querySelectorAll('[data-action="close"]');
  closeBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const d = e.target.closest('dialog');
      d.close();
      d.style.display = 'none';
    });
  });

  const metaForm = document.getElementById('layout-meta-form');
  if (metaForm) metaForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    await createLayout(data.get('name'), data.get('note'));
    const d = document.getElementById('layout-meta-dialog');
    d.close(); d.style.display = 'none';
    e.target.reset();
  });

  const typeForm = document.getElementById('shelf-type-form');
  if (typeForm) typeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const id = form.querySelector('[name="id"]').value;
    const payload = {
      name: form.querySelector('[name="name"]').value,
      rows: parseInt(form.querySelector('[name="rows"]').value),
      columns: parseInt(form.querySelector('[name="columns"]').value),
      width: parseInt(form.querySelector('[name="columns"]').value) * UNIT_SIZE,
      height: parseInt(form.querySelector('[name="rows"]').value) * UNIT_SIZE * 0.8
    };

    const url = id ? `/serials/shelf-types/${id}` : '/serials/shelf-types';
    const method = id ? 'PUT' : 'POST';
    await apiRequest(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

    await loadShelfTypes();
    renderShelfPalette();
    renderShelfTypeList();
    form.reset();
    form.querySelector('[name="id"]').value = '';
  });
}

function renderShelfTypeList() {
  const list = document.getElementById('shelf-type-list');
  if (!list) return;
  list.innerHTML = shelfTypes.map(t => `
      <div class="list-item">
        <span>${t.name}</span>
        <button class="btn-icon delete-type" data-id="${t.id}">🗑️</button>
      </div>`).join('');

  list.querySelectorAll('.delete-type').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm('삭제하시겠습니까?')) {
        await apiRequest(`/serials/shelf-types/${btn.dataset.id}`, { method: 'DELETE' });
        await loadShelfTypes();
        renderShelfPalette();
        renderShelfTypeList();
      }
    });
  });
}

function bindSidebarEvents() {
  document.getElementById('layout-select')?.addEventListener('change', (e) => selectLayout(e.target.value, true));
}

function renderLayoutSelect() {
  const select = document.getElementById('layout-select');
  if (select) select.innerHTML = layouts.map(l => `<option value="${l.id}">${l.name}</option>`).join('');
}

function renderPropertiesPanel() {
  const panel = document.getElementById('properties-content');
  if (!panel) return;

  if (!selectedElement) {
    panel.innerHTML = '<div class="muted center-message">선택된 요소가 없습니다.</div>';
    return;
  }

  if (selectedElement.type === 'shelf') {
    const shelf = selectedElement;
    panel.innerHTML = `
          <div class="form-row"><label>명칭</label><input id="prop-code" value="${shelf.code}"></div>
          <div class="form-row"><label>X</label><input id="prop-x" type="number" value="${shelf.x}"></div>
          <div class="form-row"><label>Y</label><input id="prop-y" type="number" value="${shelf.y}"></div>
          <div class="form-row"><label>회전</label><input id="prop-rot" type="number" value="${shelf.rotation}"></div>
          <div class="stack tight" style="margin-top:10px">
            <button class="btn primary small" id="prop-update">수정</button>
            <button class="btn danger small" id="prop-delete">삭제</button>
          </div>
        `;
    document.getElementById('prop-update').addEventListener('click', async () => {
      const updates = {
        code: document.getElementById('prop-code').value,
        x: parseInt(document.getElementById('prop-x').value),
        y: parseInt(document.getElementById('prop-y').value),
        rotation: parseInt(document.getElementById('prop-rot').value)
      };
      await apiRequest(`/serials/shelves/${shelf.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) });
      Object.assign(shelf, updates);
      renderCanvas();
    });
    document.getElementById('prop-delete').addEventListener('click', async () => {
      if (confirm('삭제?')) {
        await apiRequest(`/serials/shelves/${shelf.id}`, { method: 'DELETE' });
        shelves = shelves.filter(s => s.id !== shelf.id);
        selectElement(null);
        renderCanvas();
      }
    });
  } else if (selectedElement.type === 'wall') {
    const idx = selectedElement.index;
    panel.innerHTML = `<div class="stack tight"><button class="btn danger small" id="prop-wall-delete">벽 삭제</button></div>`;
    document.getElementById('prop-wall-delete').addEventListener('click', () => {
      currentLayout.walls.splice(idx, 1);
      selectElement(null);
      renderCanvas();
    });
  }
}

// --- Drag Helpers ---
function startShelfDrag(e, shelf, canvasEl) {
  isDraggingShelf = true;
  draggingShelf = shelf;
  const pt = getWorldCoordinates(e, canvasEl);
  dragOffset.x = pt.x - shelf.x;
  dragOffset.y = pt.y - shelf.y;
}

function updateShelfDrag(e, canvasEl) {
  if (!draggingShelf) return;
  const pt = getWorldCoordinates(e, canvasEl);
  const snapX = Math.round((pt.x - dragOffset.x) / GRID_SIZE) * GRID_SIZE;
  const snapY = Math.round((pt.y - dragOffset.y) / GRID_SIZE) * GRID_SIZE;

  const g = document.querySelector(`.shelf-group[data-id="${draggingShelf.id}"]`);
  if (g) g.setAttribute('transform', `translate(${snapX}, ${snapY}) rotate(${draggingShelf.rotation})`);

  draggingShelf._tempX = snapX;
  draggingShelf._tempY = snapY;
}

async function finishShelfDrag() {
  isDraggingShelf = false;
  if (draggingShelf && draggingShelf._tempX !== undefined) {
    const x = draggingShelf._tempX;
    const y = draggingShelf._tempY;
    draggingShelf.x = x; draggingShelf.y = y;
    delete draggingShelf._tempX; delete draggingShelf._tempY;

    await apiRequest(`/serials/shelves/${draggingShelf.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ x, y }) });
    renderCanvas();
  }
  draggingShelf = null;
}

async function handleShelfDrop(e, canvasEl) {
  e.preventDefault();
  if (!currentLayout) return;
  const typeId = e.dataTransfer.getData('text/plain');
  const type = shelfTypes.find(t => t.id === typeId);
  if (!type) return;

  const pt = getWorldCoordinates(e, canvasEl);
  const x = Math.round(pt.x / GRID_SIZE) * GRID_SIZE;
  const y = Math.round(pt.y / GRID_SIZE) * GRID_SIZE;

  const code = prompt('서가 번호/명칭을 입력하세요:', `S-${shelves.length + 1}`);
  if (!code) return;

  const payload = { layout_id: currentLayout.id, shelf_type_id: type.id, code, x, y, rotation: 0 };
  const newShelf = await apiRequest('/serials/shelves', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  shelves.push(newShelf);
  renderCanvas();
  selectElement('shelf', newShelf);
}

// --- Palette ---
function renderShelfPalette() {
  const container = document.getElementById('shelf-palette');
  if (!container) return;
  container.innerHTML = '';
  shelfTypes.forEach(t => {
    const el = document.createElement('div');
    el.className = 'palette-item';
    el.draggable = true;
    el.innerHTML = `<div class="palette-label">${t.name}</div>`;
    el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'copy'; });
    container.appendChild(el);
  });
}
