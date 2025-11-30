/**
 * utils.js - Bộ công cụ tiện ích chuẩn công nghiệp
 */

const domCache = {};

/**
 * 1. GET ELEMENT & CACHE (Thay thế cho cacheDOM cũ)
 */
export function getEl(id) {
    if (!domCache[id]) {
        const el = document.getElementById(id);
        if (el) domCache[id] = el;
    }
    return domCache[id];
}

/**
 * 2. CACHE DOM (GIỮ LẠI ĐỂ TƯƠNG THÍCH CODE CŨ)
 * Hàm này có thể để trống hoặc cache trước một số phần tử quan trọng
 */
export function cacheDOM() {
    // Cache sẵn các phần tử chính để getEl chạy nhanh hơn sau này
    getEl('loading-indicator');
    getEl('notification-container');
    getEl('grid-container');
}

/**
 * 3. HIỂN THỊ THÔNG BÁO (TOAST)
 */
export function showNotification(message, type = 'info') {
    let container = document.getElementById('notification-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'notification-container';
        container.className = 'notification-container';
        document.body.appendChild(container);
    }

    const noti = document.createElement('div');
    noti.className = `notification ${type}`;
    
    // Icon mapping
    let icon = 'fa-info-circle';
    if (type === 'success') icon = 'fa-check-circle';
    if (type === 'error') icon = 'fa-exclamation-circle';
    if (type === 'warning') icon = 'fa-exclamation-triangle';
    
    noti.innerHTML = `<i class="fas ${icon}"></i> <span>${message}</span>`;
    container.appendChild(noti);

    // Animation
    requestAnimationFrame(() => {
        noti.style.opacity = '1';
        noti.style.transform = 'translateX(0)';
    });

    // Auto remove
    setTimeout(() => {
        noti.style.opacity = '0';
        noti.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (noti.parentNode) noti.parentNode.removeChild(noti);
        }, 300);
    }, 3000);
}

/**
 * 4. QUẢN LÝ LOADING
 */
export function hideLoadingIndicator() {
    const el = document.getElementById('loading-indicator');
    if (el && el.style.display !== 'none') {
        el.style.opacity = '0';
        setTimeout(() => {
            el.style.display = 'none';
        }, 500);
    }
}

/**
 * 5. ĐỒNG HỒ THỰC
 */
let clockInterval;
export function initRealTimeClock() {
    const el = document.getElementById('real-time-clock'); // Tìm trực tiếp để chắc chắn
    if (!el) return;

    const update = () => {
        const now = new Date();
        el.textContent = now.toLocaleTimeString('vi-VN', { hour12: false });
    };
    update();
    if (clockInterval) clearInterval(clockInterval);
    clockInterval = setInterval(update, 1000);
}

/**
 * 6. FORMAT DURATION
 */
export function formatDuration(seconds) {
    if (!seconds || seconds < 0) return '0s';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    let res = '';
    if (h > 0) res += `${h}h `;
    if (m > 0 || h > 0) res += `${String(m).padStart(2, '0')}m `;
    res += `${String(s).padStart(2, '0')}s`;
    return res.trim();
}