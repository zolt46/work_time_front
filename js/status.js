// File: /ui/js/status.js
import { API_BASE_URL } from './api.js';

function setStatusState(el, text, state, detail) {
  if (!el) return;
  const textEl = el.querySelector('.status-text');
  if (textEl) textEl.textContent = text;
  else el.textContent = text;
  el.classList.remove('status-ok', 'status-bad', 'status-pending');
  if (state) el.classList.add(state);
  el.title = detail || '';
}

export async function checkDbStatus(el) {
  if (!el) return;
  setStatusState(el, 'DB 연결 확인 중...', 'status-pending');
  try {
    const resp = await fetch(`${API_BASE_URL}/health`, { cache: 'no-store' });
    if (!resp.ok) throw new Error('health_failed');
    const data = await resp.json();
    const ok = data.db_status === 'ok' || data.db === 'ok';
    setStatusState(el, ok ? 'DB 연결: 정상' : 'DB 연결: 확인 필요', ok ? 'status-ok' : 'status-bad');
  } catch (e) {
    setStatusState(el, 'DB 연결: 실패', 'status-bad');
  }
}

export async function checkSystemStatus(serverEl, dbEl, metaEl) {
  const started = performance.now();
  if (serverEl) setStatusState(serverEl, '서버 상태 확인 중...', 'status-pending');
  if (dbEl) setStatusState(dbEl, 'DB 연결 확인 중...', 'status-pending');
  if (metaEl) metaEl.textContent = '상태 체크 중...';
  try {
    const resp = await fetch(`${API_BASE_URL}/health`, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`health_failed_${resp.status}`);
    const data = await resp.json();
    const latency = Math.max(1, Math.round(performance.now() - started));
    const checkedAt = new Date();
    const dbOk = data.db_status === 'ok' || data.db === 'ok';

    const detail = `응답 속도 ${latency}ms · ${checkedAt.toLocaleTimeString()} 체크`;
    setStatusState(serverEl, '서버 연결: 정상', 'status-ok', detail);
    setStatusState(
      dbEl,
      dbOk ? 'DB 연결: 정상' : 'DB 연결: 확인 필요',
      dbOk ? 'status-ok' : 'status-bad',
      detail
    );
    if (metaEl) metaEl.textContent = `최근 체크: ${checkedAt.toLocaleTimeString()} · 응답 ${latency}ms`;
  } catch (e) {
    const reason = e?.message || '연결 오류';
    setStatusState(serverEl, '서버 연결: 실패', 'status-bad', reason);
    setStatusState(dbEl, 'DB 연결: 실패', 'status-bad', reason);
    if (metaEl) metaEl.textContent = `오류: ${reason}`;
  }
}
