import { apiRequest } from './api.js';

const typeLabels = {
  DB_MAINTENANCE: 'DB 점검',
  SYSTEM_MAINTENANCE: '시스템 점검',
  WORK_SPECIAL: '특별 근무',
  GENERAL: '일반 공지'
};

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ko-KR', { hour12: false });
}

function buildNoticeTag(notice) {
  const span = document.createElement('span');
  span.className = 'notice-tag';
  span.textContent = typeLabels[notice.type] || notice.type;
  return span;
}

async function dismissNotice(id, channel) {
  await apiRequest(`/notices/${id}/dismiss`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel })
  });
}

export async function markNoticeRead(id, channel) {
  await apiRequest(`/notices/${id}/read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel })
  });
}

export async function initNoticeOverlays() {
  const bannerContainerId = 'notice-banner-container';
  let bannerContainer = document.getElementById(bannerContainerId);
  if (!bannerContainer) {
    bannerContainer = document.createElement('div');
    bannerContainer.id = bannerContainerId;
    bannerContainer.className = 'notice-banner-container';
    const header = document.querySelector('.header');
    if (header?.parentNode) {
      header.parentNode.insertBefore(bannerContainer, header.nextSibling);
    } else {
      document.body.prepend(bannerContainer);
    }
  }

  let bannerNotices = [];
  try {
    bannerNotices = await apiRequest('/notices?channel=BANNER');
  } catch (e) {
    console.warn('배너 공지 로드 실패', e);
  }

  bannerContainer.innerHTML = '';
  if (bannerNotices.length) {
    bannerNotices.slice(0, 2).forEach((notice) => {
      const banner = document.createElement('div');
      banner.className = 'notice-banner';
      const meta = document.createElement('div');
      meta.className = 'notice-banner-meta';
      meta.appendChild(buildNoticeTag(notice));
      const title = document.createElement('strong');
      title.textContent = notice.title;
      meta.appendChild(title);
      banner.appendChild(meta);
      const body = document.createElement('div');
      body.className = 'notice-banner-body';
      body.textContent = notice.body;
      banner.appendChild(body);
      const action = document.createElement('div');
      action.className = 'notice-banner-actions';
      const closeBtn = document.createElement('button');
      closeBtn.className = 'btn tiny secondary';
      closeBtn.textContent = '닫기';
      closeBtn.addEventListener('click', async (event) => {
        event.stopPropagation();
        banner.remove();
        try {
          await dismissNotice(notice.id, 'BANNER');
        } catch (e) {
          console.warn('배너 닫기 기록 실패', e);
        }
      });
      const link = document.createElement('a');
      link.className = 'btn tiny';
      link.href = 'notice_board.html';
      link.textContent = '공지사항 보기';
      action.appendChild(link);
      action.appendChild(closeBtn);
      banner.appendChild(action);
      bannerContainer.appendChild(banner);
    });
  }

  let popupNotices = [];
  try {
    popupNotices = await apiRequest('/notices?channel=POPUP');
  } catch (e) {
    console.warn('팝업 공지 로드 실패', e);
  }
  if (!popupNotices.length) return;

  let popupIndex = 0;
  const renderPopup = () => {
    const notice = popupNotices[popupIndex];
    if (!notice) return;
    const existing = document.getElementById('notice-popup-modal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'notice-popup-modal';
    modal.className = 'modal-backdrop notice-popup-backdrop';
    modal.innerHTML = `
      <div class="modal notice-popup">
        <div class="modal-header">
          <div class="notice-popup-title">
            <span class="notice-tag">${typeLabels[notice.type] || notice.type}</span>
            <h3>${notice.title}</h3>
          </div>
          <div class="muted small">${notice.start_at ? formatDate(notice.start_at) : ''}</div>
        </div>
        <div class="modal-body">
          <p>${notice.body}</p>
        </div>
        <div class="modal-footer">
          <a class="btn secondary" href="notice_board.html">공지사항 보기</a>
          <button class="btn" id="notice-popup-confirm">확인</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('notice-popup-confirm')?.addEventListener('click', async () => {
      try {
        await dismissNotice(notice.id, 'POPUP');
      } catch (e) {
        console.warn('팝업 닫기 기록 실패', e);
      }
      modal.remove();
      popupIndex += 1;
      if (popupIndex < popupNotices.length) {
        renderPopup();
      }
    });
  };

  renderPopup();
}

export function getNoticeTypeLabel(type) {
  return typeLabels[type] || type;
}

export function formatNoticeDate(value) {
  return formatDate(value);
}
