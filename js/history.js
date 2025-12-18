// File: /ui/js/history.js
import { apiRequest } from './api.js';

async function loadHistory(currentUser) {
  const tbody = document.querySelector('#history-table tbody');
  const status = document.getElementById('history-status');
  if (status) status.textContent = '이력을 불러오는 중...';
  if (!tbody) return;
  tbody.innerHTML = '';
  try {
    const logs = await apiRequest('/history');
    if (!logs || !logs.length) {
      if (status) status.textContent = '최근 이력이 없습니다';
      return;
    }
    logs.forEach((log) => {
      const tr = document.createElement('tr');
      const detail = log.details ? JSON.stringify(log.details) : '';
      tr.innerHTML = `
        <td>${new Date(log.created_at).toLocaleString()}</td>
        <td>${log.action_label || log.action_type}</td>
        <td>${log.actor_name || log.actor_user_id || '-'}</td>
        <td>${log.target_name || log.target_user_id || '-'}</td>
        <td>${log.request_id || '-'}</td>
        <td>${detail}</td>
      `;
      tbody.appendChild(tr);
    });
    if (status) status.textContent = `총 ${logs.length}건 표시 중`;
  } catch (e) {
    if (status) status.textContent = `이력을 불러오지 못했습니다: ${e.message}`;
  }
}

export { loadHistory };
