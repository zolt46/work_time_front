// File: /ui/js/requests.js
import { apiRequest } from './api.js';

async function submitRequest(event) {
  event.preventDefault();
  const type = document.getElementById('req-type').value;
  const target_date = document.getElementById('req-date').value;
  const target_shift_id = document.getElementById('req-shift').value;
  const reason = document.getElementById('req-reason').value;
  try {
    await apiRequest('/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, target_date, target_shift_id, reason })
    });
    alert('Request submitted');
  } catch (e) {
    alert(e.message);
  }
}

async function loadMyRequests() {
  const list = document.getElementById('my-requests');
  if (!list) return;
  const data = await apiRequest('/requests/my');
  list.innerHTML = '';
  data.forEach(r => {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${r.type}</strong> for ${r.target_date} - ${r.status}`;
    list.appendChild(li);
  });
}

async function loadPendingRequests() {
  const table = document.getElementById('pending-requests');
  if (!table) return;
  const data = await apiRequest('/requests/pending');
  const tbody = table.querySelector('tbody');
  tbody.innerHTML = '';
  data.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.user_id}</td><td>${r.type}</td><td>${r.target_date}</td><td>${r.status}</td>`;
    const tdAction = document.createElement('td');
    const approve = document.createElement('button');
    approve.textContent = 'Approve';
    approve.className = 'btn secondary';
    approve.onclick = () => act(r.id, 'approve');
    const reject = document.createElement('button');
    reject.textContent = 'Reject';
    reject.className = 'btn muted';
    reject.onclick = () => act(r.id, 'reject');
    tdAction.appendChild(approve);
    tdAction.appendChild(reject);
    tr.appendChild(tdAction);
    tbody.appendChild(tr);
  });
}

async function act(id, action) {
  await apiRequest(`/requests/${id}/${action}`, { method: 'POST' });
  await loadPendingRequests();
}

export { submitRequest, loadMyRequests, loadPendingRequests };
