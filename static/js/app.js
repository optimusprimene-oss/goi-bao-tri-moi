// 1. IMPORT CÁC HÀM TỪ UTILS.JS (Quan trọng: Phải khớp tên hàm bên utils)
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
    cacheDOM();          // Cache các element tĩnh
    initRealTimeClock(); // Chạy đồng hồ trên header
    initSocket();        // Kết nối socket
    initFilters();       // Gán sự kiện click cho các nút lọc
    initSearch();        // Gán sự kiện tìm kiếm

    // Bắt đầu vòng lặp đếm giờ (Ticker) cho các line đang chạy
    startDurationTicker();

    // Ẩn loading sau khi khởi tạo xong (vì HTML đã render sẵn dữ liệu rồi)
    hideLoadingIndicator();
    
    // Tính toán lại số lượng ban đầu
    updateFilterAndCounts();
});

// --- PHẦN 1: KẾT NỐI SOCKET.IO ---
function initSocket() {
    if (!socket) return;

    // Cập nhật trạng thái kết nối
    socket.on('connect', () => {
        const statusEl = getEl('connectionStatus');
        if (statusEl) {
            statusEl.classList.add('connected');
            statusEl.classList.remove('disconnected');
        }
    });

    socket.on('disconnect', () => {
        const statusEl = getEl('connectionStatus');
        if (statusEl) {
            statusEl.classList.remove('connected');
            statusEl.classList.add('disconnected');
        }
    });

    // NHẬN DỮ LIỆU CẬP NHẬT TỪ SERVER
    // 1. Cập nhật 1 line lẻ
    socket.on('line_update', (data) => {
        updateCardUI(data);
        updateFilterAndCounts();
    });

    // 2. Cập nhật danh sách nhiều line (Batch)
    socket.on('batch_update', (payload) => {
        const items = Array.isArray(payload) ? payload : (payload.items || []);
        items.forEach(updateCardUI);
        updateFilterAndCounts();
    });

    // 3. Xác nhận từ server
    socket.on('line_ack', (data) => {
        showNotification(`Đã xác nhận line ${data.line}`, 'success');
    });
}

// --- PHẦN 2: CẬP NHẬT GIAO DIỆN THẺ (CARD) ---
// --- PHẦN 2: CẬP NHẬT GIAO DIỆN THẺ (CARD) ---
function updateCardUI(data) {
    const card = getEl(`card-${data.line}`); 
    if (!card) return;

    // Chuẩn hóa dữ liệu
    const status = normalizeStatus(data.status || data.type);
    const area = data.area || card.dataset.area;

    // 1. Cập nhật Metadata
    card.dataset.status = status;
    card.dataset.area = area;
    card.className = `card ${status}`;

    // 2. Cập nhật Badge trạng thái
    const badge = getEl(`status-badge-${data.line}`) || card.querySelector('.status-badge');
    if (badge) {
        badge.className = `status-badge ${status}`;
        badge.textContent = getStatusText(status);
    }

    // 3. Cập nhật Thời gian (ĐÂY LÀ PHẦN SỬA LỖI QUAN TRỌNG)
    // Logic mới: Chỉ gán data-start-time nếu đang Lỗi hoặc Đang sửa.
    // Nếu trạng thái là Normal thì XÓA ngay lập tức.
    if (status !== 'normal' && data.start_time) {
        card.dataset.startTime = data.start_time; // Gán để Ticker bắt đầu chạy
        setText(`start-time-${data.line}`, formatTimeStr(data.start_time));
    } else {
        delete card.dataset.startTime; // Xóa để Ticker NGỪNG chạy ngay lập tức
        
        // Vẫn hiện giờ bắt đầu (nếu có) nhưng không chạy đồng hồ nữa
        setText(`start-time-${data.line}`, data.start_time ? formatTimeStr(data.start_time) : '--:--:--');
    }
    
    // Cập nhật Req Time (nếu có)
    if (data.req_time) {
        setText(`req-time-${data.line}`, formatTimeStr(data.req_time));
    }

    // 4. Xử lý hiển thị "Đã sửa" (Duration)
    const durationEl = getEl(`duration-${data.line}`);
    if (durationEl) {
        if (status === 'normal') {
            // Khi xong rồi: Nếu có MTTR từ server thì hiện, không thì hiện 0
            durationEl.textContent = data.mttr ? data.mttr : '0 giây';
        } 
        // Nếu status != normal thì Ticker sẽ tự update textContent ở đây
    }
}

// --- PHẦN 3: BỘ LỌC VÀ TÌM KIẾM ---
function initFilters() {
    // Xử lý nút lọc Khu vực
    const areaBtns = document.querySelectorAll('.filter-btn[data-area]');
    areaBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // UI Active class
            areaBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Logic
            state.filterArea = btn.dataset.area;
            updateFilterAndCounts();
        });
    });

    // Xử lý nút lọc Trạng thái
    const statusBtns = document.querySelectorAll('.filter-btn[data-status]');
    statusBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // UI Active class
            statusBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Logic
            state.filterStatus = btn.dataset.status;
            updateFilterAndCounts();
        });
    });

    // Nút Reset bộ lọc (khi bấm vào Empty State)
    const resetBtn = getEl('btn-reset-filter'); // ID này phải có trong HTML main_content
    if (resetBtn) {
        resetBtn.addEventListener('click', () => window.app.resetAllFilters());
    }
}

function initSearch() {
    const input = getEl('search-input'); // Tự động lấy từ cache hoặc DOM
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

// HÀM QUAN TRỌNG NHẤT: Lọc thẻ và Đếm số lượng
function updateFilterAndCounts() {
    const cards = document.querySelectorAll('#grid-container .card');
    let visibleCount = 0;
    
    // Biến đếm số lượng cho từng loại
    const counts = {
        area: { all: 0, Assembly: 0, Panel: 0, Visor: 0 },
        status: { all: 0, normal: 0, processing: 0, fault: 0 }
    };

    cards.forEach(card => {
        // Lấy dữ liệu từ thẻ HTML
        const cArea = card.dataset.area;
        const cStatus = card.dataset.status;
        const cName = normalizeStr(card.querySelector('.line-name')?.textContent);

        // 1. Kiểm tra điều kiện lọc
        const matchArea = state.filterArea === 'all' || cArea === state.filterArea;
        const matchStatus = state.filterStatus === 'all' || cStatus === state.filterStatus;
        const matchSearch = !state.searchTerm || cName.includes(state.searchTerm);

        // 2. Ẩn/Hiện thẻ
        if (matchArea && matchStatus && matchSearch) {
            card.classList.remove('hidden'); // Class hidden dùng !important trong CSS
            visibleCount++;
        } else {
            card.classList.add('hidden');
        }

        // 3. Cộng dồn số lượng (Đếm TẤT CẢ, không quan tâm ẩn hiện)
        counts.area.all++;
        counts.status.all++;
        
        if (counts.area[cArea] !== undefined) counts.area[cArea]++;
        if (counts.status[cStatus] !== undefined) counts.status[cStatus]++;
    });

    // 4. Cập nhật UI số đếm trên các nút
    updateBadgeCount('area-all-count', counts.area.all);
    updateBadgeCount('area-assembly-count', counts.area.Assembly);
    updateBadgeCount('area-panel-count', counts.area.Panel);
    updateBadgeCount('area-visor-count', counts.area.Visor);

    updateBadgeCount('status-all-count', counts.status.all);
    updateBadgeCount('status-normal-count', counts.status.normal);
    updateBadgeCount('status-processing-count', counts.status.processing);
    updateBadgeCount('status-fault-count', counts.status.fault);

    // 5. Cập nhật Empty State và Footer
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
    // Chạy mỗi giây 1 lần
    setInterval(() => {
        const now = new Date();
        
        // Chỉ tìm những thẻ đang chạy (có data-start-time)
        // Selector này tối ưu hơn việc loop qua tất cả thẻ
        const activeCards = document.querySelectorAll('.card[data-start-time]');
        
        activeCards.forEach(card => {
            const startTimeStr = card.dataset.startTime;
            if (!startTimeStr) return; // Phòng hờ

            const startTime = new Date(startTimeStr);
            const diffSeconds = Math.floor((now - startTime) / 1000);
            
            // Tìm chỗ hiển thị duration
            const durationEl = getEl(`duration-${card.dataset.line}`);
            if (durationEl) {
                // Sử dụng hàm formatDuration từ utils.js
                durationEl.textContent = formatDuration(diffSeconds);
            }
        });
    }, 1000);
}

// --- HELPERS RIÊNG CỦA FILE NÀY ---
// (Các hàm logic nghiệp vụ cụ thể, không dùng chung)

function updateBadgeCount(id, count) {
    const el = document.getElementById(id); // Có thể dùng getEl
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
    if (status === 'fault') return 'Lỗi / Báo lỗi';
    return 'Bình thường';
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

// Expose hàm reset ra global (để gọi từ HTML onclick nếu cần)
window.app = window.app || {};
window.app.resetAllFilters = function() {
    state.filterArea = 'all';
    state.filterStatus = 'all';
    state.searchTerm = '';
    
    const input = getEl('search-input');
    if (input) input.value = '';
    const clearBtn = getEl('search-clear');
    if (clearBtn) clearBtn.classList.remove('visible');

    // Reset active class các nút
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    // Active lại nút All
    document.querySelector('.filter-btn[data-area="all"]')?.classList.add('active');
    document.querySelector('.filter-btn[data-status="all"]')?.classList.add('active');

    updateFilterAndCounts();
};