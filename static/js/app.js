import { Filters } from './filters.js';
// Import đúng tên hàm đã export bên utils.js
import { 
    cacheDOM, 
    initRealTimeClock, 
    hideLoadingIndicator, 
    showNotification, 
    getEl 
} from './utils.js';

// Khởi tạo Socket
const socket = io();
let globalLinesData = [];

document.addEventListener('DOMContentLoaded', () => {
    cacheDOM();
    initRealTimeClock();
    initDashboard();
});

async function initDashboard() {
    try {
        const res = await fetch('/api/lines');
        if (!res.ok) throw new Error(`Lỗi tải dữ liệu: ${res.status}`);
        
        globalLinesData = await res.json();

        renderDynamicAreaFilters(globalLinesData);
        renderCards(globalLinesData);

        Filters.init({ 
            data: globalLinesData,
            onRefresh: updateCounts
        });

        initSocketEvents();

    } catch (err) {
        console.error("Dashboard Init Error:", err);
        const grid = getEl('grid-container');
        if (grid) grid.innerHTML = `<div style="text-align:center; padding:40px; color:#ef4444;">Không thể tải dữ liệu: ${err.message}</div>`;
    } finally {
        hideLoadingIndicator();
    }
}

// --- RENDER UI ---
function renderDynamicAreaFilters(data) {
    const container = document.getElementById('dynamic-area-filters');
    if (!container) return;

    const areas = [...new Set(data.map(d => d.area).filter(Boolean))].sort();
    const allBtn = container.querySelector('[data-area="all"]');
    container.innerHTML = '';
    if (allBtn) container.appendChild(allBtn);

    areas.forEach(area => {
        const btn = document.createElement('button');
        btn.className = 'filter-btn';
        btn.dataset.area = area;
        const safeId = `count-area-${area.replace(/\s+/g, '-')}`;
        btn.innerHTML = `${area} <span class="filter-count" id="${safeId}">0</span>`;
        container.appendChild(btn);
    });
}

function renderCards(data) {
    const grid = getEl('grid-container');
    if (!grid) return;
    grid.innerHTML = '';

    if (data.length === 0) {
        grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#94a3b8; padding:40px;">Chưa có thiết bị nào. Vui lòng thêm trong trang Admin.</div>';
        return;
    }

    data.forEach(item => {
        const card = document.createElement('div');
        card.className = `card ${item.type}`; 
        card.dataset.line = item.line;
        card.dataset.area = item.area;
        card.dataset.status = item.type;

        let statusText = 'Hoạt động';
        if (item.type === 'fault') statusText = 'Lỗi dừng máy';
        if (item.type === 'processing') statusText = 'Đang bảo trì';

        const reqTime = item.req_time || '--:--:--';
        const startTime = item.start_time || '--:--:--';

        card.innerHTML = `
            <div class="card-header">
                <span class="line-name">${item.display_name}</span>
                <span class="status-badge ${item.type}">${statusText}</span>
            </div>
            <div class="card-times-section">
                <div class="time-row">
                    <span class="time-label">Báo lỗi:</span>
                    <span class="time-value" id="req-${item.line}">${reqTime}</span>
                </div>
                <div class="time-row">
                    <span class="time-label">Bắt đầu:</span>
                    <span class="time-value" id="start-${item.line}">${startTime}</span>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

function updateCounts() {
    const cards = document.querySelectorAll('.card');
    const counts = { status: { all: 0, normal: 0, processing: 0, fault: 0 }, area: { all: 0 } };

    cards.forEach(card => {
        const st = card.dataset.status;
        const ar = card.dataset.area;
        counts.status.all++;
        if (counts.status[st] !== undefined) counts.status[st]++;
        
        counts.area.all++;
        if (ar) {
            if (!counts.area[ar]) counts.area[ar] = 0;
            counts.area[ar]++;
        }
    });

    for (const [key, val] of Object.entries(counts.status)) {
        const el = document.getElementById(`count-status-${key}`);
        if (el) el.textContent = val;
    }
    const allAreaEl = document.getElementById('count-area-all');
    if (allAreaEl) allAreaEl.textContent = counts.area.all;

    Object.keys(counts.area).forEach(area => {
        const safeId = `count-area-${area.replace(/\s+/g, '-')}`;
        const el = document.getElementById(safeId);
        if (el) el.textContent = counts.area[area];
    });
}

function initSocketEvents() {
    const statusText = document.querySelector('#connectionStatus .status-text');
    const statusDot = document.querySelector('#connectionStatus .status-dot');

    if (statusDot) {
        socket.on('connect', () => {
            statusDot.style.background = '#22c55e';
            if (statusText) statusText.textContent = 'Trực tuyến';
        });
        socket.on('disconnect', () => {
            statusDot.style.background = '#ef4444';
            if (statusText) statusText.textContent = 'Mất kết nối';
        });
    }

    socket.on('line_update', (data) => {
        const card = document.querySelector(`.card[data-line="${data.line}"]`);
        if (card) {
            card.className = `card ${data.status}`;
            card.dataset.status = data.status;
            
            const badge = card.querySelector('.status-badge');
            let txt = 'Hoạt động';
            if (data.status === 'fault') txt = 'Lỗi dừng máy';
            if (data.status === 'processing') txt = 'Đang bảo trì';
            badge.className = `status-badge ${data.status}`;
            badge.textContent = txt;

            if (data.req_time) card.querySelector(`#req-${data.line}`).textContent = data.req_time;
            if (data.start_time) card.querySelector(`#start-${data.line}`).textContent = data.start_time;
            
            if (data.status === 'normal') {
                card.querySelector(`#req-${data.line}`).textContent = '--:--:--';
                card.querySelector(`#start-${data.line}`).textContent = '--:--:--';
            } else if (data.status === 'fault') {
                showNotification(`Lỗi tại Line ${data.line}`, 'error');
            }
            Filters.refresh();
        }
    });
}