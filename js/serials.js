// File: /ui/js/serials.js
import { apiRequest } from './api.js';
import { loadUser } from './auth.js';

// --- Global State ---
let currentRole = null;
let layouts = [];
let shelfTypes = [];
let shelves = [];

// Editor State
let currentLayout = null; // { id, name, width, height, walls: [], ... }
let currentMode = 'select'; // 'select' | 'wall'
let editorScale = 1.0;
const UNIT_SIZE = 20; // 1 Cell = 20px (Grid system)

// Selection
let selectedElement = null; // { type: 'shelf'|'wall', id: ..., data: ... }

// --- DOM Elements ---
const canvasEl = document.getElementById('layout-canvas');
const propertiesContent = document.getElementById('properties-content');
const statusText = document.getElementById('canvas-status-text');

// --- Initialization ---
export async function initSerials() {
  const user = await loadUser();
  currentRole = user?.role || null;

  // Initial Load
  await Promise.all([loadLayouts(), loadShelfTypes()]);

  // Bind Events
  bindToolbarEvents();
  bindCanvasEvents();
  bindDialogEvents();
  bindSidebarEvents();

  // Initial Render
  renderLayoutSelect();
  renderShelfPalette();

  // Select first layout if exists
  if (layouts.length > 0) {
    selectLayout(layouts[0].id);
  } else {
    // Show empty state or create new
    canvasEl.innerHTML = '<div class="muted center-message">배치도를 선택하거나 새로 만드세요.</div>';
    document.getElementById('layout-delete-btn').style.display = 'none';
  }

  // Check role
  applyRoleGuard();
}

function applyRoleGuard() {
  const isOperator = currentRole === 'OPERATOR' || currentRole === 'MASTER';
  document.body.classList.toggle('role-operator', isOperator);

  const protectedBtns = document.querySelectorAll('#layout-create-btn, #layout-delete-btn, #save-layout-btn, #manage-types-btn');
  protectedBtns.forEach(btn => btn.disabled = !isOperator);
}

// --- Zoom Logic ---
function setZoom(scale) {
  editorScale = Math.max(0.5, Math.min(3.0, scale));
  renderCanvas();
  statusText.textContent = `Zoom: ${Math.round(editorScale * 100)}%`;
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

// --- Layout Management ---
async function selectLayout(layoutId) {
  const layout = layouts.find(l => l.id === layoutId);
  if (!layout) return;

  currentLayout = layout;
  document.getElementById('layout-select').value = layout.id;
  document.getElementById('layout-delete-btn').style.display = 'inline-block';

  // Load shelves for this layout
  await loadShelves(layout.id);

  // Reset Selection & Mode
  selectedElement = null;
  currentMode = 'select';
  updateToolbarUI();

  renderCanvas();
  renderPropertiesPanel();
}

async function createLayout(name, note) {
  const payload = {
    name,
    note,
    width: 800,
    height: 600,
    walls: [] // Initial empty walls
  };
  const newLayout = await apiRequest('/serials/layouts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  await loadLayouts();
  selectLayout(newLayout.id);
  renderLayoutSelect();
}

async function updateCurrentLayout() {
  if (!currentLayout) return;

  const payload = {
    name: currentLayout.name,
    note: currentLayout.note,
    walls: currentLayout.walls
  };

  await apiRequest(`/serials/layouts/${currentLayout.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  alert('배치도가 저장되었습니다.');
}

async function deleteCurrentLayout() {
  if (!currentLayout) return;
  if (!confirm(`'${currentLayout.name}' 배치도를 정말 삭제하시겠습니까?\n배치된 서가도 모두 삭제됩니다.`)) return;

  await apiRequest(`/serials/layouts/${currentLayout.id}`, { method: 'DELETE' });
  currentLayout = null;
  await loadLayouts();

  if (layouts.length > 0) {
    selectLayout(layouts[0].id);
  } else {
    canvasEl.innerHTML = '';
    document.getElementById('layout-delete-btn').style.display = 'none';
  }
  renderLayoutSelect();
}

// --- Canvas Rendering ---
function renderCanvas() {
  if (!currentLayout) return;

  // Use fixed size for now or layout specific size
  const width = 800;
  const height = 600;

  // Clear canvas
  canvasEl.innerHTML = '';

  // Create SVG
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  // Use Fixed ViewBox and content zoom via Group
  // But wait, if we want "Fixed Canvas", the SVG element itself should be 800x600?
  // User asked for "fixed-size canvas area (e.g., 800x600)".
  // If we zoom, do we zoom INSIDE the 800x600 box? Yes.

  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  // We use viewBox to define the coordinate system, but we don't want the viewbox to shrink/grow.
  // We want the content to shrink/grow inside.
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.classList.add('layout-svg');

  // Defines
  const defs = document.createElementNS(ns, 'defs');
  const pattern = document.createElementNS(ns, 'pattern');
  pattern.id = 'grid';
  pattern.setAttribute('width', UNIT_SIZE * 5); // 100px major grid
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

  // Zoom Group
  const zoomGroup = document.createElementNS(ns, 'g');
  zoomGroup.setAttribute('transform', `scale(${editorScale})`);

  // Grid Rect (inside zoom group so it scales too? or fixed?)
  // Usually grid scales with content.
  const gridRect = document.createElementNS(ns, 'rect');
  gridRect.setAttribute('width', width);
  gridRect.setAttribute('height', height);
  gridRect.setAttribute('fill', 'url(#grid)');
  zoomGroup.appendChild(gridRect);

  // Group for content (Walls & Shelves)
  const contentGroup = document.createElementNS(ns, 'g');
  contentGroup.id = 'canvas-content';

  // Render Walls
  const walls = currentLayout.walls || [];
  walls.forEach((wall, index) => {
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', wall.x1);
    line.setAttribute('y1', wall.y1);
    line.setAttribute('x2', wall.x2);
    line.setAttribute('y2', wall.y2);
    line.classList.add('wall-line');
    if (selectedElement?.type === 'wall' && selectedElement.index === index) {
      line.classList.add('selected');
    }
    line.dataset.index = index;
    contentGroup.appendChild(line);
  });

  // Render Shelves
  shelves.forEach(shelf => {
    const shelfType = shelfTypes.find(t => t.id === shelf.shelf_type_id) || { width: 80, height: 40 };
    // For visual, we use shelf.x, shelf.y
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('transform', `translate(${shelf.x}, ${shelf.y}) rotate(${shelf.rotation || 0})`);
    g.classList.add('shelf-group');
    if (selectedElement?.type === 'shelf' && selectedElement.id === shelf.id) {
      g.classList.add('selected');
    }
    g.dataset.id = shelf.id;

    // Scale rect size? No, coords are in world space. Zoom group handles scaling.
    const rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('width', shelfType.width);
    rect.setAttribute('height', shelfType.height);

    const text = document.createElementNS(ns, 'text');
    text.setAttribute('x', shelfType.width / 2);
    text.setAttribute('y', shelfType.height / 2 + 4);
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

function bindCanvasEvents() {
  // Mouse Down
  canvasEl.addEventListener('mousedown', (e) => {
    if (!currentLayout) return;
    const pt = getCanvasCoordinates(e);

    if (currentMode === 'wall') {
      isDrawing = true;
      startPoint = pt;
      // Start Preview Line
      activeLine = createSVGLine(pt.x, pt.y, pt.x, pt.y, ['wall-line', 'preview']);
      document.querySelector('#canvas-content').appendChild(activeLine);
    } else if (currentMode === 'select') {
      // Hit testing is handled by element click events bubbling up or checking target
      const target = e.target.closest('.wall-line, .shelf-group');
      if (target) {
        if (target.classList.contains('wall-line')) {
          const index = parseInt(target.dataset.index);
          selectElement('wall', { index, data: currentLayout.walls[index] });
        } else if (target.classList.contains('shelf-group')) {
          const id = target.dataset.id;
          const shelf = shelves.find(s => s.id === id);
          selectElement('shelf', shelf);
          // Start Dragging Shelf
          startShelfDrag(e, shelf);
        }
      } else {
        // Deselect
        selectElement(null);
      }
    }
  });

  // Mouse Move
  canvasEl.addEventListener('mousemove', (e) => {
    const pt = getCanvasCoordinates(e);
    // Snap to grid
    const storedPt = {
      x: Math.round(pt.x / 10) * 10,
      y: Math.round(pt.y / 10) * 10
    };

    document.getElementById('cursor-coords').textContent = `${storedPt.x}, ${storedPt.y}`;

    if (isDrawing && activeLine) {
      activeLine.setAttribute('x2', storedPt.x);
      activeLine.setAttribute('y2', storedPt.y);
    }

    if (isDraggingShelf && draggingShelf) {
      updateShelfDrag(e);
    }
  });

  // Mouse Up
  canvasEl.addEventListener('mouseup', () => {
    if (isDrawing && activeLine) {
      // Finish Wall
      const x1 = parseFloat(activeLine.getAttribute('x1'));
      const y1 = parseFloat(activeLine.getAttribute('y1'));
      const x2 = parseFloat(activeLine.getAttribute('x2'));
      const y2 = parseFloat(activeLine.getAttribute('y2'));

      // Only add if length > 0
      if (Math.abs(x1 - x2) > 5 || Math.abs(y1 - y2) > 5) {
        currentLayout.walls = currentLayout.walls || [];
        currentLayout.walls.push({ x1, y1, x2, y2 });
      }

      activeLine.remove();
      isDrawing = false;
      activeLine = null;
      renderCanvas();
    }

    if (isDraggingShelf) {
      finishShelfDrag();
    }
  });

  // Drag Over (Drop Target)
  canvasEl.addEventListener('dragover', (e) => {
    e.preventDefault(); // Allow Drop
    e.dataTransfer.dropEffect = 'copy';
  });

  canvasEl.addEventListener('drop', handleShelfDrop);
}

function createSVGLine(x1, y1, x2, y2, classes) {
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', x1);
  line.setAttribute('y1', y1);
  line.setAttribute('x2', x2);
  line.setAttribute('y2', y2);
  classes.forEach(c => line.classList.add(c));
  return line;
}

// --- Drag & Drop (Shelf Creation) ---
async function handleShelfDrop(e) {
  e.preventDefault();
  if (!currentLayout) return;

  const typeId = e.dataTransfer.getData('text/plain');
  if (!typeId) return;

  const type = shelfTypes.find(t => t.id === typeId);
  if (!type) return;

  const pt = getCanvasCoordinates(e);
  // Grid Snap
  const x = Math.round(pt.x / UNIT_SIZE) * UNIT_SIZE;
  const y = Math.round(pt.y / UNIT_SIZE) * UNIT_SIZE;

  // Create new Shelf
  // Generate Code automatically? A-1, A-2...
  // Only simple prompt for now
  const code = prompt('서가 번호/명칭을 입력하세요:', generateNextShelfCode());
  if (!code) return;

  const payload = {
    layout_id: currentLayout.id,
    shelf_type_id: type.id,
    code: code,
    x, y, rotation: 0
  };

  try {
    const newShelf = await apiRequest('/serials/shelves', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    shelves.push(newShelf);
    renderCanvas();
    selectElement('shelf', newShelf);
  } catch (err) {
    console.error(err);
    alert('서가 생성 실패');
  }
}

function generateNextShelfCode() {
  const count = shelves.length + 1;
  return `S-${count}`;
}

// --- Dragging Existing Shelf ---
let isDraggingShelf = false;
let draggingShelf = null;
let dragOffset = { x: 0, y: 0 };

function startShelfDrag(e, shelf) {
  if (currentMode !== 'select') return;
  isDraggingShelf = true;
  draggingShelf = shelf;

  const pt = getCanvasCoordinates(e);
  dragOffset.x = pt.x - shelf.x;
  dragOffset.y = pt.y - shelf.y;
}

function updateShelfDrag(e) {
  if (!draggingShelf) return;
  const pt = getCanvasCoordinates(e);

  // Snap
  const rawX = pt.x - dragOffset.x;
  const rawY = pt.y - dragOffset.y;

  const snapX = Math.round(rawX / 10) * 10;
  const snapY = Math.round(rawY / 10) * 10;

  // Visual Update only (Optimization)
  const g = document.querySelector(`.shelf-group[data-id="${draggingShelf.id}"]`);
  if (g) {
    g.setAttribute('transform', `translate(${snapX}, ${snapY}) rotate(${draggingShelf.rotation})`);
  }

  draggingShelf._tempX = snapX;
  draggingShelf._tempY = snapY;
}

async function finishShelfDrag() {
  isDraggingShelf = false;
  if (draggingShelf && (draggingShelf._tempX !== undefined)) {
    // Save Position
    const updatedX = draggingShelf._tempX;
    const updatedY = draggingShelf._tempY;

    // Update Local
    draggingShelf.x = updatedX;
    draggingShelf.y = updatedY;
    delete draggingShelf._tempX;
    delete draggingShelf._tempY;

    // Update Server
    await apiRequest(`/serials/shelves/${draggingShelf.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x: updatedX, y: updatedY })
    });

    // Re-render to ensure clean state
    renderCanvas();
  }
  draggingShelf = null;
}


function getCanvasCoordinates(e) {
  const rect = canvasEl.querySelector('svg').getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  // Map to SVG coordinate space (800x600)
  // viewbox is 800x600, rect is actual pixel size
  const scaleX = 800 / rect.width;
  const scaleY = 600 / rect.height;

  // Account for Zoom
  return {
    x: (x * scaleX) / editorScale,
    y: (y * scaleY) / editorScale
  };
}


// --- Palette ---
function renderShelfPalette() {
  const container = document.getElementById('shelf-palette');
  container.innerHTML = '';

  shelfTypes.forEach(type => {
    const el = document.createElement('div');
    el.className = 'palette-item';
    el.draggable = true;
    el.innerHTML = `
        <div class="palette-preview" style="width:40px; height:20px;"></div>
        <div class="palette-label">${type.name}</div>
        <div class="palette-meta">${type.rows}단 ${type.columns}열</div>
      `;

    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', type.id);
      e.dataTransfer.effectAllowed = 'copy';
    });

    container.appendChild(el);
  });
}

// --- Properties Panel ---
async function renderPropertiesPanel() {
  if (!selectedElement) {
    propertiesContent.innerHTML = '<div class="muted center-message">선택된 요소가 없습니다.</div>';
    return;
  }

  if (selectedElement.type === 'shelf') {
    const shelf = selectedElement;
    propertiesContent.innerHTML = `
      <div class="form-row"><label>명칭</label><input id="prop-code" value="${shelf.code}"></div>
      <div class="form-row"><label>X</label><input id="prop-x" type="number" value="${shelf.x}"></div>
      <div class="form-row"><label>Y</label><input id="prop-y" type="number" value="${shelf.y}"></div>
      <div class="form-row"><label>회전</label><input id="prop-rot" type="number" value="${shelf.rotation}"></div>
      <div class="form-row"><label>메모</label><input id="prop-note" value="${shelf.note || ''}"></div>
      <div class="stack tight" style="margin-top:10px">
        <button class="btn primary small" id="prop-update">수정</button>
        <button class="btn danger small" id="prop-delete">삭제</button>
      </div>
    `;

    document.getElementById('prop-update').addEventListener('click', async () => {
      const updates = {
        code: document.getElementById('prop-code').value,
        x: parseInt(document.getElementById('prop-x').value) || 0,
        y: parseInt(document.getElementById('prop-y').value) || 0,
        rotation: parseInt(document.getElementById('prop-rot').value) || 0,
        note: document.getElementById('prop-note').value
      };
      await apiRequest(`/serials/shelves/${shelf.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      Object.assign(shelf, updates);
      renderCanvas();
    });

    document.getElementById('prop-delete').addEventListener('click', async () => {
      if (confirm('삭제하시겠습니까?')) {
        await apiRequest(`/serials/shelves/${shelf.id}`, { method: 'DELETE' });
        shelves = shelves.filter(s => s.id !== shelf.id);
        selectElement(null);
        renderCanvas();
      }
    });
  } else if (selectedElement.type === 'wall') {
    const idx = selectedElement.index;
    propertiesContent.innerHTML = `
        <div class="form-row"><label>벽 요소 #${idx + 1}</label></div>
        <div class="stack tight" style="margin-top:10px">
          <button class="btn danger small" id="prop-wall-delete">벽 삭제</button>
        </div>
      `;
    document.getElementById('prop-wall-delete').addEventListener('click', () => {
      currentLayout.walls.splice(idx, 1);
      selectElement(null);
      renderCanvas();
    });
  }
}

function selectElement(type, data) {
  if (!type) {
    selectedElement = null;
  } else {
    selectedElement = { type, ...data };
  }
  renderCanvas(); // to toggle selection classes
  renderPropertiesPanel();
}


// --- Event Bindings ---
function bindToolbarEvents() {
  document.querySelectorAll('.tool-btn[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tool-btn[data-mode]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentMode = btn.dataset.mode;
      statusText.textContent = currentMode === 'wall' ? '드래그하여 벽 그리기' : '요소 선택 및 이동';
      updateToolbarUI();
    });
  });

  document.getElementById('save-layout-btn').addEventListener('click', updateCurrentLayout);

  // Zoom Controls
  document.getElementById('zoom-in').addEventListener('click', () => setZoom(editorScale + 0.1));
  document.getElementById('zoom-out').addEventListener('click', () => setZoom(editorScale - 0.1));
  document.getElementById('zoom-reset').addEventListener('click', () => setZoom(1.0));

  document.getElementById('layout-create-btn').addEventListener('click', () => {
    document.getElementById('layout-meta-dialog').showModal();
  });

  document.getElementById('layout-delete-btn').addEventListener('click', deleteCurrentLayout);

  document.getElementById('manage-types-btn').addEventListener('click', () => {
    document.getElementById('shelf-type-dialog').showModal();
    renderShelfTypeList();
  });
}

function updateToolbarUI() {
  document.querySelectorAll('.tool-btn[data-mode]').forEach(btn => {
    if (btn.dataset.mode === currentMode) btn.classList.add('active');
    else btn.classList.remove('active');
  });
}

function bindDialogEvents() {
  // Layout Meta
  document.getElementById('layout-meta-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    await createLayout(data.get('name'), data.get('note'));
    document.getElementById('layout-meta-dialog').close();
    e.target.reset();
  });

  // Close Btns
  document.querySelectorAll('[data-action="close"]').forEach(btn => {
    btn.addEventListener('click', (e) => e.target.closest('dialog').close());
  });

  // Shelf Types
  document.getElementById('shelf-type-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const id = form.querySelector('[name="id"]').value;
    const payload = {
      name: form.querySelector('[name="name"]').value,
      rows: parseInt(form.querySelector('[name="rows"]').value),
      columns: parseInt(form.querySelector('[name="columns"]').value),
      // Auto calculate sizes
      width: parseInt(form.querySelector('[name="columns"]').value) * UNIT_SIZE,
      height: parseInt(form.querySelector('[name="rows"]').value) * UNIT_SIZE * 0.8 // Depth ratio?
    };

    let method = 'POST';
    let url = '/serials/shelf-types';
    if (id) {
      method = 'PUT';
      url += `/${id}`;
    }

    await apiRequest(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    await loadShelfTypes();
    renderShelfPalette();
    renderShelfTypeList();
    form.reset();
    form.querySelector('[name="id"]').value = '';
  });
}

function renderShelfTypeList() {
  const list = document.getElementById('shelf-type-list');
  list.innerHTML = shelfTypes.map(t => `
      <div class="list-item">
        <span>${t.name} (${t.rows}x${t.columns})</span>
        <button class="btn-icon delete-type" data-id="${t.id}">🗑️</button>
      </div>
    `).join('');

  list.querySelectorAll('.delete-type').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation(); // prevent edit
      if (confirm('삭제하시겠습니까?')) {
        await apiRequest(`/serials/shelf-types/${btn.dataset.id}`, { method: 'DELETE' });
        await loadShelfTypes();
        renderShelfPalette();
        renderShelfTypeList();
      }
    });
  });

  // Edit on click item? Maybe too complex for now, user just wanted better initial setup
  list.querySelectorAll('.list-item').forEach((item, idx) => {
    item.addEventListener('click', () => {
      const type = shelfTypes[idx];
      const form = document.getElementById('shelf-type-form');
      form.querySelector('[name="id"]').value = type.id;
      form.querySelector('[name="name"]').value = type.name;
      form.querySelector('[name="rows"]').value = type.rows;
      form.querySelector('[name="columns"]').value = type.columns;
    });
  });
}

function bindSidebarEvents() {
  document.getElementById('layout-select').addEventListener('change', (e) => {
    selectLayout(e.target.value);
  });
}

function renderLayoutSelect() {
  const select = document.getElementById('layout-select');
  select.innerHTML = layouts.map(l => `<option value="${l.id}">${l.name}</option>`).join('');
  if (currentLayout) select.value = currentLayout.id;
}
