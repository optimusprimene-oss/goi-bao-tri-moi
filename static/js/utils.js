/**
 * utils.js - Các hàm tiện ích dùng chung cho toàn bộ dự án
 */

// Biến lưu trữ cache các element tĩnh để tăng hiệu năng
const elements = {};

/**
 * 1. CACHE DOM
 * Lưu trữ tham chiếu đến các ID quan trọng để không phải tìm lại nhiều lần
 */
export function cacheDOM() {
  // Các phần tử chung
  elements.loadingIndicator = document.getElementById('loading-indicator');
  elements.notificationContainer = document.getElementById('notification-container');
  elements.realTimeClock = document.getElementById('real-time-clock');
  
  // Các phần tử của Dashboard (có thể null nếu ở trang History)
  elements.grid = document.getElementById('grid-container');
  elements.filterPanel = document.querySelector('.filter-panel');
  elements.searchInput = document.getElementById('search-input');
  elements.visibleCount = document.getElementById('visible-count');
  elements.totalCount = document.getElementById('total-count');
  
  // Cache NodeList (nếu cần dùng nhiều lần)
  elements.filterAreaBtns = document.querySelectorAll('.filter-btn[data-area]');
  elements.filterStatusBtns = document.querySelectorAll('.filter-btn[data-status]');
}

/**
 * 2. GET ELEMENT THÔNG MINH
 * Tự động tìm trong cache trước, nếu không có thì tìm bằng getElementById
 */
export function getEl(nameOrId) {
  // Nếu cache rỗng, thử nạp lần đầu
  if (Object.keys(elements).length === 0) cacheDOM();

  // Tìm trong cache (theo tên biến đã gán ở cacheDOM)
  if (elements[nameOrId]) return elements[nameOrId];

  // Nếu không có, tìm trực tiếp trong DOM (Dành cho ID động hoặc trang khác)
  const el = document.getElementById(nameOrId);
  
  // (Tùy chọn) Lưu lại vào cache để lần sau nhanh hơn
  // if (el) elements[nameOrId] = el; 
  
  return el;
}

/**
 * 3. HIỂN THỊ THÔNG BÁO (TOAST)
 * Tự động tạo container nếu chưa có trong HTML
 */
export function showNotification(message, type = 'info') {
  let container = document.getElementById('notification-container');
  
  // Tự động tạo container nếu HTML thiếu (Tránh lỗi null)
  if (!container) {
    container = document.createElement('div');
    container.id = 'notification-container';
    document.body.appendChild(container);
  }
  
  const noti = document.createElement('div');
  noti.className = `notification ${type}`;
  // Dùng innerHTML để cho phép in đậm (<b>) nếu cần, nhưng cẩn thận XSS
  noti.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i> ${message}`;
  
  container.appendChild(noti);
  
  // Animation vào
  requestAnimationFrame(() => {
    noti.style.opacity = '1';
    noti.style.transform = 'translateX(0)';
  });

  // Tự động tắt sau 3s
  setTimeout(() => {
    noti.style.opacity = '0';
    noti.style.transform = 'translateX(100%)';
    setTimeout(() => noti.remove(), 300);
  }, 3000);
}

/**
 * 4. QUẢN LÝ LOADING
 */
export function hideLoadingIndicator() {
  const el = getEl('loadingIndicator') || document.getElementById('loading-indicator');
  if (!el) return;
  el.style.opacity = '0';
  setTimeout(() => { el.style.display = 'none'; }, 400);
}

/**
 * 5. ĐỒNG HỒ THỰC (HEADER)
 */
let clockInterval;
export function initRealTimeClock() {
  const el = getEl('realTimeClock') || document.getElementById('real-time-clock');
  if (!el) return;
  
  const update = () => {
    // Format: 14:05:30 - 20/11/2024
    const now = new Date();
    el.textContent = now.toLocaleTimeString('vi-VN', { hour12: false });
  };
  update();
  clockInterval = setInterval(update, 1000);
  
  // Dọn dẹp khi chuyển trang (nếu dùng SPA, còn reload trang thì ko cần thiết lắm nhưng tốt)
  window.addEventListener('beforeunload', () => clearInterval(clockInterval));
}

/**
 * 6. CÁC HÀM XỬ LÝ DỮ LIỆU BỔ TRỢ
 */

// Chuẩn hóa chuỗi để tìm kiếm (bỏ dấu, lowercase)
export function normalizeStr(str) {
  return String(str || '').trim().toLowerCase();
}

// Định dạng giây -> Giờ:Phút:Giây (VD: 1h 30m 05s)
export function formatDuration(seconds) {
  if (!seconds || seconds < 0) return '0s';
  
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  let result = '';
  if (h > 0) result += `${h}h `;
  if (m > 0 || h > 0) result += `${String(m).padStart(2, '0')}m `;
  result += `${String(s).padStart(2, '0')}s`;
  
  return result.trim();
}

// Xuất file CSV (Hỗ trợ tiếng Việt UTF-8)
export function downloadCsv(rows, filename = 'export.csv') {
  // Thêm BOM (\uFEFF) để Excel nhận diện đúng tiếng Việt
  let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
  
  rows.forEach(rowArray => {
    // Escape dấu phẩy và dấu ngoặc kép trong nội dung
    const row = rowArray.map(e => {
        const text = String(e || '').replace(/"/g, '""'); 
        return `"${text}"`; 
    }).join(",");
    csvContent += row + "\r\n";
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}