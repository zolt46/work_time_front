// File: /ui/js/status.js
import { API_BASE_URL } from './api.js';

function setStatusState(el, text, state) {
  if (!el) return;
  el.textContent = text;
  el.classList.remove('status-ok', 'status-bad');
  if (state) el.classList.add(state);
}

export async function checkDbStatus(el) {
  if (!el) return;
  setStatusState(el, 'DB 연결 확인 중...', null);
  try {
    const resp = await fetch(`${API_BASE_URL}/health`);
    if (!resp.ok) throw new Error('health_failed');
    const data = await resp.json();
    const ok = data.db_status === 'ok' || data.db === 'ok';
    setStatusState(el, ok ? 'DB 연결: 정상' : 'DB 연결: 확인 필요', ok ? 'status-ok' : 'status-bad');
  } catch (e) {
    setStatusState(el, 'DB 연결: 실패', 'status-bad');
  }
}

export async function checkSystemStatus(serverEl, dbEl) {
  if (serverEl) setStatusState(serverEl, '서버 상태 확인 중...', null);
  if (dbEl) setStatusState(dbEl, 'DB 연결 확인 중...', null);
  try {
    const resp = await fetch(`${API_BASE_URL}/health`);
    if (!resp.ok) throw new Error('health_failed');
    const data = await resp.json();
    const dbOk = data.db_status === 'ok' || data.db === 'ok';

    setStatusState(serverEl, '서버 연결: 정상', 'status-ok');
    setStatusState(dbEl, dbOk ? 'DB 연결: 정상' : 'DB 연결: 확인 필요', dbOk ? 'status-ok' : 'status-bad');
  } catch (e) {
    setStatusState(serverEl, '서버 연결: 실패', 'status-bad');
    setStatusState(dbEl, 'DB 연결: 실패', 'status-bad');
  }
}
