// File: /ui/js/serials.js
import { apiRequest } from './api.js';
import { loadUser } from './auth.js';

// --- Global State ---
let currentRole = null;
let serials = []; // Publications
let layouts = [];
let shelfTypes = [];
let shelves = [];

// Editor State
let currentLayout = null; // { id, name, width, height, walls: [], ... }
let currentMode = 'view'; // 'view' | 'select' | 'wall'
let editorScale = 1.0;
const UNIT_SIZE = 20; // 1 Cell = 20px (Grid system)

// Selection & Interaction
let selectedElement = null; // { type: 'shelf'|'wall', id: ..., data: ... }
let selectedSerial = null;

// Helper / constants
const acquisitionLabels = {
  UNCLASSIFIED: '미분류',
  DONATION: '수증',
  SUBSCRIPTION: '구독'
};

// --- Initialization ---
export async function initSerials() {
  const user = await loadUser();
  currentRole = user?.role || null;
  applyRoleGuard();

  // Determine Page Context
  const isEditor = !!document.getElementById('editor-toolbar');
  const isHomeOrList = !!document.getElementById('serials-total-count') || !!document.getElementById('serials-table');

  // Load Common Data
  await Promise.all([loadLayouts(), loadShelfTypes()]);

  if (isHomeOrList) {
    await loadSerials();
    // Load shelves for all layouts or default layout?
    // Home page shows layout canvas. We should load shelves for the default (first) layout.
    if (layouts.length > 0) {
      await selectLayout(layouts[0].id, false); // false = no editor UI updates
    }
    bindListEvents();
  }

  if (isEditor) {
    currentMode = 'select'; // Default to select in editor
    if (layouts.length > 0) {
      await selectLayout(layouts[0].id, true);
    } else {
      showEmptyState();
    }
    bindToolbarEvents();
    bindDialogEvents(); // Editor dialogs
  }

  // Canvas events are needed for both (Editor: drag/draw, Home: tooltip/select)
  bindCanvasEvents(isEditor);
  bindSidebarEvents(); // Layout select is present in both? Home has no layout select, but Layout Editor does.

  // Render initial state
  if (isHomeOrList) {
    renderStats();
    renderList();
    renderLayoutLegend();
  }
}

function applyRoleGuard() {
  const isOperator = currentRole === 'OPERATOR' || currentRole === 'MASTER';
  document.body.classList.toggle('role-operator', isOperator);

  const protectedBtns = document.querySelectorAll('#layout-create-btn, #layout-delete-btn, #save-layout-btn, #manage-types-btn, .action-btn');
  protectedBtns.forEach(btn => btn.disabled = !isOperator);
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


// --- Layout Management ---
async function selectLayout(layoutId, isEditor) {
  const layout = layouts.find(l => l.id === layoutId);
  if (!layout) return;

  currentLayout = layout;

  // Updates specific to Editor
  if (isEditor) {
    const select = document.getElementById('layout-select');
    if (select) select.value = layout.id;
    const delBtn = document.getElementById('layout-delete-btn');
    if (delBtn) delBtn.style.display = 'inline-block';

    selectedElement = null;
    currentMode = 'select'; // Reset mode
    updateToolbarUI();
    renderPropertiesPanel();
  } else {
    // If Home page, it might have a select? Home page code (viewed earlier) had no select, just a hardcoded canvas area.
    // Actually, serials_layout.html (editor) has #layout-select. serials_home.html doesn't.
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

// --- List & Stats View Logic (Home/List Page) ---
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

  serials.forEach(s => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
         <td>${s.title}</td>
         <td>${s.issn || '-'}</td>
         <td>${acquisitionLabels[s.acquisition_type]}</td>
         <td>${formatShelfLabel(s)}</td>
       `;
    tr.addEventListener('click', () => {
      // Detail view logic if present
      // For now, simpler list
    });
    tbody.appendChild(tr);
  });

  const status = document.getElementById('serials-status');
  if (status) status.textContent = `${serials.length}건 표시 중`;
}

function formatShelfLabel(serial) {
  if (serial.shelf_code) return serial.shelf_code; // If joined
  // If not joined in API, we might need to lookup locally
  const shelf = shelves.find(s => s.id === serial.shelf_id);
  return shelf ? shelf.code : (serial.shelf_section || '-');
}

function bindListEvents() {
  document.getElementById('search-button')?.addEventListener('click', async () => {
    await loadSerials();
    renderList();
  });
  document.getElementById('search-reset')?.addEventListener('click', async () => {
    ['search-keyword', 'search-issn', 'search-shelf'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const typeEl = document.getElementById('search-type');
    if (typeEl) typeEl.value = '';
    await loadSerials();
    renderList();
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
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.classList.add('layout-svg');

  // Defs (Grid is only for editor usually, but ok to keep)
  const defs = document.createElementNS(ns, 'defs');
  const pattern = document.createElementNS(ns, 'pattern');
  pattern.id = 'grid';
  pattern.setAttribute('width', UNIT_SIZE * 5);
  pattern.setAttribute('height', UNIT_SIZE * 5);
  pattern.setAttribute('patternUnits', 'userSpaceOnUse');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', `M ${UNIT_SIZE * 5} 0 L 0 0 0 ${UNIT_SIZE * 5}`);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', '#e2e8f0');
  path.setAttribute('stroke-width', '1');
  pattern.appendChild(path);
  defs.appendChild(pattern);
  svg.appendChild(defs);

  const zoomGroup = document.createElementNS(ns, 'g');
  zoomGroup.setAttribute('transform', `scale(${editorScale})`);

  const gridRect = document.createElementNS(ns, 'rect');
  gridRect.setAttribute('width', width);
  gridRect.setAttribute('height', height);
  gridRect.setAttribute('fill', 'url(#grid)');
  zoomGroup.appendChild(gridRect);

  const contentGroup = document.createElementNS(ns, 'g');
  contentGroup.id = 'canvas-content';

  // Walls
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

  // Shelves
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

  zoomGroup.appendChild(contentGroup);
  svg.appendChild(zoomGroup);
  canvasEl.appendChild(svg);
}

// --- Interaction Logic ---
let isDrawing = false;
let startPoint = null;
let activeLine = null;
let isDraggingShelf = false;
let draggingShelf = null;
let dragOffset = { x: 0, y: 0 };

function bindCanvasEvents(isEditor) {
  const canvasEl = document.getElementById('layout-canvas');
  if (!canvasEl) return;

  // Mouse Down
  canvasEl.addEventListener('mousedown', (e) => {
    if (!currentLayout) return;
    const pt = getCanvasCoordinates(e, canvasEl);
    const target = e.target.closest('.wall-line, .shelf-group');

    if (isEditor) {
      // Editor Mode Interactions
      if (currentMode === 'wall') {
        isDrawing = true;
        startPoint = pt;
        activeLine = createSVGLine(pt.x, pt.y, pt.x, pt.y, ['wall-line', 'preview']);
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
    } else {
      // Read-Only Mode (Home Page)
      // Only Click to view info
      if (target && target.classList.contains('shelf-group')) {
        const shelf = shelves.find(s => s.id === target.dataset.id);
        showShelfTooltip(shelf, e.clientX, e.clientY);
      } else {
        hideShelfTooltip();
      }
    }
  });

  // Mouse Move
  canvasEl.addEventListener('mousemove', (e) => {
    if (!isEditor) return;
    const pt = getCanvasCoordinates(e, canvasEl);
    const storedPt = { x: Math.round(pt.x / 10) * 10, y: Math.round(pt.y / 10) * 10 };

    const coordEl = document.getElementById('cursor-coords');
    if (coordEl) coordEl.textContent = `${storedPt.x}, ${storedPt.y}`;

    if (isDrawing && activeLine) {
      activeLine.setAttribute('x2', storedPt.x);
      activeLine.setAttribute('y2', storedPt.y);
    }

    if (isDraggingShelf && draggingShelf) {
      updateShelfDrag(e, canvasEl);
    }
  });

  // Mouse Up
  canvasEl.addEventListener('mouseup', () => {
    if (!isEditor) return;
    if (isDrawing && activeLine) {
      const x1 = parseFloat(activeLine.getAttribute('x1'));
      const y1 = parseFloat(activeLine.getAttribute('y1'));
      const x2 = parseFloat(activeLine.getAttribute('x2'));
      const y2 = parseFloat(activeLine.getAttribute('y2'));

      if (Math.abs(x1 - x2) > 5 || Math.abs(y1 - y2) > 5) {
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

  // Drag Over/Drop (Editor only)
  if (isEditor) {
    canvasEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    canvasEl.addEventListener('drop', (e) => handleShelfDrop(e, canvasEl));
  }
}

// --- Tooltips for Home Page ---
function showShelfTooltip(shelf, clientX, clientY) {
  let tooltip = document.getElementById('layout-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'layout-tooltip';
    tooltip.className = 'layout-tooltip';
    document.body.appendChild(tooltip);
  }

  // Find publication count
  const count = serials.filter(s => s.shelf_id === shelf.id).length;

  tooltip.innerHTML = `
      <h4>${shelf.code}</h4>
      <div class="muted">보관 중: ${count}권</div>
      <div class="small text-muted">${shelf.note || ''}</div>
    `;

  tooltip.style.left = `${clientX + 10}px`;
  tooltip.style.top = `${clientY + 10}px`;
  tooltip.style.display = 'block';

  // Close on click outside? or just another click closes it elsewhere
}

function hideShelfTooltip() {
  const tooltip = document.getElementById('layout-tooltip');
  if (tooltip) tooltip.style.display = 'none';
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
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const scaleX = 800 / rect.width;
  const scaleY = 600 / rect.height;
  return { x: (x * scaleX) / editorScale, y: (y * scaleY) / editorScale };
}

// --- Drag & Drop ---
function startShelfDrag(e, shelf, canvasEl) {
  isDraggingShelf = true;
  draggingShelf = shelf;
  const pt = getCanvasCoordinates(e, canvasEl);
  dragOffset.x = pt.x - shelf.x;
  dragOffset.y = pt.y - shelf.y;
}

function updateShelfDrag(e, canvasEl) {
  if (!draggingShelf) return;
  const pt = getCanvasCoordinates(e, canvasEl);
  const snapX = Math.round((pt.x - dragOffset.x) / 10) * 10;
  const snapY = Math.round((pt.y - dragOffset.y) / 10) * 10;

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

  const pt = getCanvasCoordinates(e, canvasEl);
  const x = Math.round(pt.x / UNIT_SIZE) * UNIT_SIZE;
  const y = Math.round(pt.y / UNIT_SIZE) * UNIT_SIZE;

  const code = prompt('서가 번호:', `S-${shelves.length + 1}`);
  if (!code) return;

  const payload = { layout_id: currentLayout.id, shelf_type_id: type.id, code, x, y, rotation: 0 };
  const newShelf = await apiRequest('/serials/shelves', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  shelves.push(newShelf);
  renderCanvas();
  selectElement('shelf', newShelf);
}


// --- Event Bindings (Guarded) ---
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
  document.getElementById('zoom-reset')?.addEventListener('click', () => setZoom(1.0));
  document.getElementById('layout-create-btn')?.addEventListener('click', () => document.getElementById('layout-meta-dialog').showModal());
  document.getElementById('layout-delete-btn')?.addEventListener('click', deleteCurrentLayout);
  document.getElementById('manage-types-btn')?.addEventListener('click', () => {
    document.getElementById('shelf-type-dialog').showModal();
    renderShelfTypeList();
  });
}

function updateToolbarUI() {
  const statusText = document.getElementById('canvas-status-text');
  if (statusText) statusText.textContent = currentMode === 'wall' ? '드래그하여 벽 그리기' : '요소 선택 및 이동';

  document.querySelectorAll('.tool-btn[data-mode]').forEach(btn => {
    if (btn.dataset.mode === currentMode) btn.classList.add('active');
    else btn.classList.remove('active');
  });
}

function bindDialogEvents() {
  const closeBtns = document.querySelectorAll('[data-action="close"]');
  closeBtns.forEach(btn => btn.addEventListener('click', (e) => e.target.closest('dialog').close()));

  const metaForm = document.getElementById('layout-meta-form');
  if (metaForm) metaForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    await createLayout(data.get('name'), data.get('note'));
    document.getElementById('layout-meta-dialog').close();
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
