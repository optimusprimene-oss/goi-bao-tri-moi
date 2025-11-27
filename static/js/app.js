// 1. IMPORT CÁC HÀM TỪ UTILS.JS
import { 
    cacheDOM, 
    getEl, 
    initRealTimeClock, 
    showNotification, 
    hideLoadingIndicator, 
    formatDuration, 
    normalizeStr 
} from './utils.js';

// 2. KHỞI TẠO BIẾN TOÀN CỤC
const socket = window.io ? io() : null;

// Trạng thái bộ lọc hiện tại
const state = {
    filterArea: 'all',    // all, Assembly, Panel, Visor
    filterStatus: 'all',  // all, normal, processing, fault
    searchTerm: ''
};

// 3. KHỞI CHẠY ỨNG DỤNG KHI DOM SẴN SÀNG
document.addEventListener('DOMContentLoaded', () => {
    cacheDOM();          
    initRealTimeClock(); 
    initSocket();        
    initFilters();       
    initSearch();        

    // --- QUAN TRỌNG: Tải dữ liệu hiện trạng ngay khi vào trang ---
    initDashboardData(); 

    // Bắt đầu vòng lặp đếm giờ
    startDurationTicker();
});

// --- PHẦN 0: LẤY DỮ LIỆU BAN ĐẦU (FIX LỖI F5 MẤT TRẠNG THÁI) ---
async function initDashboardData() {
    try {
        // Gọi API lấy trạng thái hiện tại của tất cả các line
        const response = await fetch('/api/lines');
        if (!response.ok) throw new Error('Không thể tải dữ liệu line');
        
        const allLines = await response.json();
        
        // Cập nhật giao diện cho từng thẻ dựa trên dữ liệu thật
        if (Array.isArray(allLines)) {
            allLines.forEach(lineData => {
                // Chuẩn hóa dữ liệu API để khớp với hàm updateCardUI
                const updatePayload = {
                    line: lineData.line,
                    status: lineData.type, // API trả về 'type', UI dùng 'status'
                    area: lineData.area,
                    req_time: lineData.req_time,     // Giờ báo lỗi
                    start_time: lineData.start_time, // Giờ bắt đầu sửa
                    mttr: lineData.mttr              // MTTR (nếu có)
                };
                updateCardUI(updatePayload);
            });
        }

        // Sau khi cập nhật xong thì tính lại bộ lọc & ẩn loading
        updateFilterAndCounts();
        hideLoadingIndicator();

    } catch (error) {
        console.error("Lỗi khởi tạo Dashboard:", error);
        showNotification("Lỗi kết nối server lấy dữ liệu!", "error");
        hideLoadingIndicator(); // Vẫn ẩn loading để người dùng thao tác
    }
}

// --- PHẦN 1: KẾT NỐI SOCKET.IO ---
function initSocket() {
    if (!socket) return;

    socket.on('connect', () => {
        const statusEl = getEl('connectionStatus');
        if (statusEl) {
            statusEl.classList.add('connected');
            statusEl.classList.remove('disconnected');
        }
        // An toàn: Khi kết nối lại cũng nên load lại dữ liệu
        initDashboardData();
    });

    socket.on('disconnect', () => {
        const statusEl = getEl('connectionStatus');
        if (statusEl) {
            statusEl.classList.remove('connected');
            statusEl.classList.add('disconnected');
        }
    });

    // NHẬN DỮ LIỆU CẬP NHẬT TỪ SERVER
    socket.on('line_update', (data) => {
        updateCardUI(data);
        updateFilterAndCounts();
    });

    socket.on('batch_update', (payload) => {
        const items = Array.isArray(payload) ? payload : (payload.items || []);
        items.forEach(updateCardUI);
        updateFilterAndCounts();
    });

    socket.on('line_ack', (data) => {
        showNotification(`Đã xác nhận line ${data.line}`, 'success');
    });
}

// --- PHẦN 2: CẬP NHẬT GIAO DIỆN THẺ (CARD) ---
function updateCardUI(data) {
    const card = getEl(`card-${data.line}`); 
    if (!card) return;

    // Chuẩn hóa dữ liệu
    // API trả về 'type', Socket có thể trả về 'status' hoặc 'type'
    const rawStatus = data.status || data.type || 'normal';
    const status = normalizeStatus(rawStatus);
    const area = data.area || card.dataset.area;

    // 1. Cập nhật Metadata
    card.dataset.status = status;
    card.dataset.area = area;
    card.className = `card ${status}`; // Reset class và gán lại

    // 2. Cập nhật Badge trạng thái
    const badge = getEl(`status-badge-${data.line}`) || card.querySelector('.status-badge');
    if (badge) {
        badge.className = `status-badge ${status}`;
        badge.textContent = getStatusText(status);
    }

    // 3. Cập nhật Thời gian & Ticker
    // Logic: Chỉ gán data-start-time nếu đang Lỗi hoặc Đang sửa để ticker chạy
    if (status !== 'normal') {
        // Ưu tiên start_time (khi đang sửa), nếu không có thì dùng req_time (khi đang lỗi chờ sửa)
        const timeToCount = data.start_time || data.req_time;
        
        if (timeToCount) {
            card.dataset.startTime = timeToCount; // Gán để Ticker chạy
            
            // Nếu đang sửa (processing) -> Hiện giờ bắt đầu sửa
            // Nếu đang lỗi (fault) -> Hiện giờ phát sinh lỗi
            const displayTime = formatTimeStr(timeToCount);
            setText(`start-time-${data.line}`, displayTime);
        }
    } else {
        delete card.dataset.startTime; // Xóa để Ticker NGỪNG chạy
        // Khi bình thường, hiển thị dấu gạch hoặc giờ hoàn thành lần cuối
        setText(`start-time-${data.line}`, '--:--:--');
        
        // Reset đồng hồ đếm về 0 hoặc hiển thị MTTR
        const durationEl = getEl(`duration-${data.line}`);
        if (durationEl) {
             durationEl.textContent = data.mttr ? data.mttr : '--';
        }
    }
    
    // Cập nhật Req Time (Thời điểm báo lỗi)
    if (data.req_time) {
        setText(`req-time-${data.line}`, formatTimeStr(data.req_time));
    }
}

// --- PHẦN 3: BỘ LỌC VÀ TÌM KIẾM ---
function initFilters() {
    // Filter Area
    const areaBtns = document.querySelectorAll('.filter-btn[data-area]');
    areaBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            areaBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.filterArea = btn.dataset.area;
            updateFilterAndCounts();
        });
    });

    // Filter Status
    const statusBtns = document.querySelectorAll('.filter-btn[data-status]');
    statusBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            statusBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.filterStatus = btn.dataset.status;
            updateFilterAndCounts();
        });
    });

    // Nút Reset
    const resetBtn = getEl('btn-reset-filter');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => window.app.resetAllFilters());
    }
}

function initSearch() {
    const input = getEl('search-input');
    const clearBtn = getEl('search-clear');

    if (input) {
        input.addEventListener('input', (e) => {
            state.searchTerm = normalizeStr(e.target.value);
            if (clearBtn) clearBtn.classList.toggle('visible', state.searchTerm.length > 0);
            updateFilterAndCounts();
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            input.value = '';
            state.searchTerm = '';
            clearBtn.classList.remove('visible');
            updateFilterAndCounts();
            input.focus();
        });
    }
}

// HÀM LỌC VÀ ĐẾM SỐ LƯỢNG
function updateFilterAndCounts() {
    const cards = document.querySelectorAll('#grid-container .card');
    let visibleCount = 0;
    
    const counts = {
        area: { all: 0, Assembly: 0, Panel: 0, Visor: 0 },
        status: { all: 0, normal: 0, processing: 0, fault: 0 }
    };

    cards.forEach(card => {
        const cArea = card.dataset.area;
        const cStatus = card.dataset.status;
        const cName = normalizeStr(card.querySelector('.line-name')?.textContent);

        // Kiểm tra điều kiện lọc
        const matchArea = state.filterArea === 'all' || cArea === state.filterArea;
        const matchStatus = state.filterStatus === 'all' || cStatus === state.filterStatus;
        const matchSearch = !state.searchTerm || cName.includes(state.searchTerm);

        // Ẩn/Hiện thẻ
        if (matchArea && matchStatus && matchSearch) {
            card.classList.remove('hidden');
            visibleCount++;
        } else {
            card.classList.add('hidden');
        }

        // Đếm số lượng (Dựa trên dữ liệu thực tế đang có trên thẻ)
        counts.area.all++;
        counts.status.all++;
        
        if (counts.area[cArea] !== undefined) counts.area[cArea]++;
        if (counts.status[cStatus] !== undefined) counts.status[cStatus]++;
    });

    // Cập nhật UI số đếm
    updateBadgeCount('area-all-count', counts.area.all);
    updateBadgeCount('area-assembly-count', counts.area.Assembly);
    updateBadgeCount('area-panel-count', counts.area.Panel);
    updateBadgeCount('area-visor-count', counts.area.Visor);

    updateBadgeCount('status-all-count', counts.status.all);
    updateBadgeCount('status-normal-count', counts.status.normal);
    updateBadgeCount('status-processing-count', counts.status.processing);
    updateBadgeCount('status-fault-count', counts.status.fault);

    // Cập nhật Empty State
    const emptyState = getEl('empty-state');
    const grid = getEl('grid-container');
    
    if (visibleCount === 0) {
        if(emptyState) emptyState.classList.remove('hidden');
        if(grid) grid.classList.add('hidden');
    } else {
        if(emptyState) emptyState.classList.add('hidden');
        if(grid) grid.classList.remove('hidden');
    }
    
    setText('visible-count', visibleCount);
    setText('total-count', counts.area.all);
}

// --- PHẦN 4: TICKER ĐẾM GIỜ REALTIME ---
function startDurationTicker() {
    setInterval(() => {
        const now = new Date();
        const activeCards = document.querySelectorAll('.card[data-start-time]');
        
        activeCards.forEach(card => {
            const startTimeStr = card.dataset.startTime;
            if (!startTimeStr) return;

            // Xử lý múi giờ nếu cần (giả sử server trả về UTC hoặc ISO chuẩn)
            const startTime = new Date(startTimeStr);
            
            // Tính chênh lệch giây
            const diffSeconds = Math.floor((now - startTime) / 1000);
            
            const durationEl = getEl(`duration-${card.dataset.line}`);
            if (durationEl && diffSeconds >= 0) {
                durationEl.textContent = formatDuration(diffSeconds);
            }
        });
    }, 1000);
}

// --- HELPERS RIÊNG ---
function updateBadgeCount(id, count) {
    const el = document.getElementById(id);
    if (el) el.textContent = count;
}

function normalizeStatus(s) {
    s = normalizeStr(s);
    if (['processing', 'maintain', 'baotri'].includes(s)) return 'processing';
    if (['fault', 'error', 'loi', 'failed'].includes(s)) return 'fault';
    return 'normal';
}

function getStatusText(status) {
    if (status === 'processing') return 'Đang bảo trì';
    if (status === 'fault') return 'Lỗi dừng máy';
    return 'Hoạt động';
}

function setText(id, text) {
    const el = getEl(id);
    if (el) el.textContent = text;
}

function formatTimeStr(isoStr) {
    if (!isoStr) return '--:--:--';
    try {
        return new Date(isoStr).toLocaleTimeString('vi-VN', { hour12: false });
    } catch {
        return '--:--:--';
    }
}

// Expose reset function
window.app = window.app || {};
window.app.resetAllFilters = function() {
    state.filterArea = 'all';
    state.filterStatus = 'all';
    state.searchTerm = '';
    
    const input = getEl('search-input');
    if (input) input.value = '';
    const clearBtn = getEl('search-clear');
    if (clearBtn) clearBtn.classList.remove('visible');

    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.filter-btn[data-area="all"]')?.classList.add('active');
    document.querySelector('.filter-btn[data-status="all"]')?.classList.add('active');

    updateFilterAndCounts();
};