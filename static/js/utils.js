// Biến lưu trữ cache các element tĩnh
const elements = {};

// Hàm cache các phần tử chính của trang
export function cacheDOM() {
  elements.grid = document.getElementById('grid-container');
  elements.filterPanel = document.querySelector('.filter-panel');
  elements.loadingIndicator = document.getElementById('loading-indicator');
  elements.notificationContainer = document.getElementById('notification-container');
  elements.realTimeClock = document.getElementById('real-time-clock');
  elements.connectionStatus = document.getElementById('connection-status');
  elements.searchInput = document.getElementById('search-input');
  elements.searchClear = document.getElementById('search-clear');
  elements.emptyState = document.getElementById('empty-state');
  elements.visibleCount = document.getElementById('visible-count');
  elements.totalCount = document.getElementById('total-count');
  // Cache thêm các nút filter để dùng sau này
  elements.filterAreaBtns = document.querySelectorAll('.filter-btn[data-area]');
  elements.filterStatusBtns = document.querySelectorAll('.filter-btn[data-status]');
}

// Hàm lấy element thông minh
export function getEl(nameOrId) {
  // 1. Nếu chưa cache thì chạy cache
  if (Object.keys(elements).length === 0) cacheDOM();

  // 2. Nếu tìm thấy trong cache (theo tên biến) thì trả về ngay
  if (elements[nameOrId]) return elements[nameOrId];

  // 3. Nếu không có trong cache, thử tìm theo ID (dành cho dynamic elements như card-1, status-2)
  return document.getElementById(nameOrId);
}

// Hàm hiển thị thông báo (Toast)
export function showNotification(message, type = 'info') {
  const container = getEl('notificationContainer');
  if (!container) return;
  
  const noti = document.createElement('div');
  noti.className = `notification ${type}`;
  noti.innerHTML = message; // Dùng innerHTML để hỗ trợ thẻ b/strong nếu cần
  
  container.appendChild(noti);
  
  // Animation vào
  setTimeout(() => noti.style.opacity = 1, 10);

  // Tự động tắt
  setTimeout(() => {
    noti.style.opacity = 0;
    setTimeout(() => noti.remove(), 300); // Đợi mờ dần rồi mới xóa DOM
  }, 3000);
}

// Hàm ẩn loading
export function hideLoadingIndicator() {
  const el = getEl('loadingIndicator');
  if (!el) return;
  el.style.opacity = '0';
  setTimeout(() => { el.style.display = 'none'; }, 400);
}

// Hàm đồng hồ thực (Header)
let clockInterval;
export function initRealTimeClock() {
  const el = getEl('realTimeClock');
  if (!el) return;
  
  const update = () => {
    el.textContent = new Date().toLocaleTimeString('vi-VN');
  };
  update();
  clockInterval = setInterval(update, 1000);
  window.addEventListener('beforeunload', () => clearInterval(clockInterval));
}

// --- CÁC HÀM BỔ TRỢ MỚI (CẦN THÊM CHO APP.JS HOẠT ĐỘNG) ---

// 1. Chuẩn hóa chuỗi (dùng cho Search và Filter)
export function normalizeStr(str) {
  return String(str || '').trim().toLowerCase();
}

// 2. Định dạng giây thành giờ:phút:giây (dùng cho bộ đếm thời gian chạy)
export function formatDuration(seconds) {
  if (!seconds || seconds < 0) return '0 giây';
  
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  // Nếu trên 1 tiếng thì hiện h:m, dưới thì hiện m:s
  if (h > 0) {
    return `${h}h ${String(m).padStart(2, '0')}m`;
  }
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

// 3. Download CSV (Bạn đã viết sẵn, giữ nguyên)
export function downloadCsv(rows, filename = 'export.csv') {
  const csv = rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}