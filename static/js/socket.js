import { showNotification } from './utils.js';

// Cấu hình Socket.IO tối ưu cho môi trường công nghiệp
const SOCKET_OPTS = {
    transports: ['websocket'],      // Bắt buộc dùng Websocket để giảm độ trễ
    reconnection: true,             // Tự động kết nối lại
    reconnectionAttempts: Infinity, // Thử lại vô hạn
    reconnectionDelay: 1000,        // Thử lại sau 1s
    reconnectionDelayMax: 5000,     // Tối đa 5s
    timeout: 20000,                 // Timeout 20s
    forceNew: true
};

// Kết nối đến Server (Tự động lấy host hiện tại)
const socket = io(location.origin, SOCKET_OPTS);

// --- QUẢN LÝ TRẠNG THÁI KẾT NỐI ---
const els = {
    dot: document.querySelector('#connection-status .status-dot'),
    text: document.querySelector('#connection-status .status-text')
};

function updateStatus(connected) {
    if (els.dot) els.dot.style.background = connected ? '#22c55e' : '#ef4444';
    if (els.text) els.text.textContent = connected ? 'Đã kết nối' : 'Mất kết nối';
    
    // Ẩn loading khi kết nối thành công (lần đầu)
    const loader = document.getElementById('loading-indicator');
    if (connected && loader && !loader.classList.contains('hidden')) {
        loader.style.opacity = '0';
        setTimeout(() => { 
            if(loader) loader.style.display = 'none'; 
        }, 500);
    }
}

// --- EVENTS ---
socket.on('connect', () => {
    console.log('[Socket] Connected:', socket.id);
    updateStatus(true);
    // Chỉ hiện thông báo nếu cần thiết, tránh spam khi F5
    // showNotification('Kết nối máy chủ thành công', 'success');
});

socket.on('disconnect', (reason) => {
    console.warn('[Socket] Disconnected:', reason);
    updateStatus(false);
    showNotification('Mất kết nối máy chủ!', 'error');
});

socket.on('connect_error', (err) => {
    console.error('[Socket] Connection Error:', err);
    updateStatus(false);
});

// --- CORE: PHÁT SỰ KIỆN HỆ THỐNG ---
// Thay vì import gridManager hay app trực tiếp, ta bắn sự kiện ra toàn cục window.
// Các module khác (app.js, stats.js) sẽ lắng nghe sự kiện này.
socket.on('line_update', (data) => {
    window.dispatchEvent(new CustomEvent('sys:line_update', { detail: data }));
});

socket.on('batch_update', (data) => {
    window.dispatchEvent(new CustomEvent('sys:batch_update', { detail: data }));
});

export { socket };