// static/js/socket.js
// PHIÊN BẢN TỐI ƯU NHẤT 2025 – SIÊU NHẸ, SIÊU ỔN ĐỊNH, KHÔNG LAG

import { showNotification } from './utils.js';
import { gridManager } from './grid.js';

const SOCKET_URL = location.origin;

const socket = io(SOCKET_URL, {
  transports: ['websocket'],
  reconnection: true,
  reconnectionAttempts: 8,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 10000,
  forceNew: true
});

let firstDataReceived = false;
let connectionStatusEl = null;

// Cache DOM một lần
function getStatusEl() {
  if (!connectionStatusEl) {
    connectionStatusEl = document.getElementById('connection-status');
  }
  return connectionStatusEl;
}

// Cập nhật trạng thái kết nối – tối ưu gọi DOM
function setConnected(connected) {
  const el = getStatusEl();
  if (!el) return;

  el.classList.toggle('connected', connected);
  el.classList.toggle('disconnected', !connected);

  const text = el.querySelector('.status-text');
  if (text) text.textContent = connected ? 'ĐÃ KẾT NỐI' : 'MẤT KẾT NỐI';
}

// Ẩn loading ngay khi có dữ liệu đầu tiên
function hideLoading() {
  if (firstDataReceived) return;
  firstDataReceived = true;

  const loading = document.getElementById('loading-indicator');
  if (loading) {
        loading.style.opacity = '0';
        setTimeout(() => loading.remove(), 600);
  }
}

// ================= SOCKET EVENTS =================
socket.on('connect', () => {
  console.log('Socket connected:', socket.id);
  setConnected(true);
  showNotification('Kết nối thành công', 'success');
  hideLoading();
});

socket.on('disconnect', () => {
  console.warn('Socket disconnected');
  setConnected(false);
  showNotification('Mất kết nối server', 'error');
});

socket.on('connect_error', () => {
  setConnected(false);
  if (!firstDataReceived) {
    showNotification('Không thể kết nối server', 'error');
  }
});

socket.on('reconnect', (attempt) => {
  console.log('Reconnected after', attempt, 'attempts');
  setConnected(true);
  showNotification('Đã kết nối lại!', 'success');
  hideLoading();
});

// ================= REALTIME UPDATE – SIÊU NHANH =================
socket.on('line_update', (data) => {
  const line = Number(data.line);
  if (!line || isNaN(line)) return;

  gridManager.setLineStatus(line, data.status || 'normal', data);
  hideLoading();
});

socket.on('initial_data', (lines) => {
  if (!lines || typeof lines !== 'object') return;

  for (const [lineStr, payload] of Object.entries(lines)) {
    const line = Number(lineStr);
    if (line >= 1 && line <= 57) {
      gridManager.setLineStatus(line, payload.status || 'normal', payload);
    }
  }
  hideLoading();
});

// ================= KHỞI TẠO & DỌN DẸP =================
export function initSocket() {
  console.log('Socket.IO init →', SOCKET_URL);
  setConnected(false);

  // Tự động kết nối (io() đã tự connect)
  // Dọn dẹp khi rời trang
  const cleanup = () => socket.disconnect();
  window.addEventListener('beforeunload', cleanup);
  window.addEventListener('pagehide', cleanup);
}

export { socket };