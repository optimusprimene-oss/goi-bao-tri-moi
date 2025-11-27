import { getEl, showNotification, formatDuration } from './utils.js';

const API_URL = '/api/history_stats';

// --- STATE ---
let state = {
    mode: 'daily',        
    currentDate: new Date(),
    data: []              
};

// --- UTILS ---
function toYMD(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function fmtTime(iso) {
    if (!iso) return '-';
    return new Date(iso).toLocaleTimeString('vi-VN', { hour12: false });
}

function calcDuration(startStr, endStr) {
    if (!startStr || !endStr) return { text: '-', mins: 0 };
    const diff = new Date(endStr) - new Date(startStr);
    if (diff < 0) return { text: '0s', mins: 0 };
    
    const mins = diff / 60000;
    const h = Math.floor(mins / 60);
    const m = Math.floor(mins % 60);
    
    let text = (h > 0 ? `${h}h ` : '') + `${m}p`;
    return { text, mins };
}

// --- LOGIC UI ---
function updateUI() {
    const today = new Date();
    const isToday = toYMD(state.currentDate) === toYMD(today);
    
    const displayVal = state.currentDate.toLocaleDateString('vi-VN', { 
        weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' 
    });
    
    getEl('displayDateValue').textContent = displayVal;
    getEl('displayDateLabel').textContent = isToday ? 'HÔM NAY' : 'LỊCH SỬ NGÀY';
    getEl('nextDayBtn').disabled = isToday;

    const navPanel = getEl('dayNavPanel');
    const filterPanel = getEl('advancedFilterPanel');
    const toggleBtn = getEl('toggleFilterBtn');

    if (state.mode === 'range') {
        navPanel.style.display = 'none';
        toggleBtn.parentElement.style.display = 'none';
        filterPanel.style.display = 'block';
    } else {
        navPanel.style.display = 'flex';
        toggleBtn.parentElement.style.display = 'block';
        filterPanel.style.display = 'none';
    }
}

// --- LOAD DATA ---
async function fetchHistory() {
    let url = API_URL;
    
    if (state.mode === 'range') {
        const s = getEl('filterStartDate').value;
        const e = getEl('filterEndDate').value;
        if (!s || !e) return showNotification('Vui lòng chọn đủ ngày!', 'warning');
        url += `?start_date=${s}&end_date=${e}`;
    } else {
        const d = toYMD(state.currentDate);
        url += `?start_date=${d}&end_date=${d}`;
    }

    try {
        const tbody = getEl('historyBody');
        if(tbody) tbody.style.opacity = '0.5';

        const res = await fetch(url);
        if (!res.ok) throw new Error('API Error');
        const data = await res.json();
        
        state.data = data;
        renderTable(data);
    } catch (err) {
        console.error(err);
        showNotification('Lỗi kết nối server', 'error');
    } finally {
        const tbody = getEl('historyBody');
        if(tbody) tbody.style.opacity = '1';
    }
}

function renderTable(data) {
    const tbody = getEl('historyBody');
    const countEl = getEl('count');
    const emptyEl = getEl('emptyState');

    if(!tbody) return;

    tbody.innerHTML = '';
    if(countEl) countEl.textContent = data.length;

    if (data.length === 0) {
        if(emptyEl) emptyEl.style.display = 'block';
        return;
    }
    if(emptyEl) emptyEl.style.display = 'none';

    data.forEach((item, index) => {
        const dur = calcDuration(item.start_time, item.finish_time);
        
        const isSlow = dur.mins > 15;
        const rowClass = isSlow ? 'row-danger' : '';
        // Bỏ cột Ghi chú, chỉ giữ các cột dữ liệu
        const tr = document.createElement('tr');
        tr.className = rowClass;
        tr.innerHTML = `
            <td>${index + 1}</td>
            <td style="font-weight:bold; color: #60a5fa">${item.display_name}</td>
            <td>${item.area}</td>
            <td>${fmtTime(item.req_time)}</td>
            <td>${fmtTime(item.start_time)}</td>
            <td>${fmtTime(item.finish_time)}</td>
            <td style="font-weight:bold">${dur.text}</td>
        `;
        tbody.appendChild(tr);
    });
}

// --- XUẤT EXCEL (ĐÃ SỬA LỖI) ---
function exportToExcel() {
    if (!state.data || state.data.length === 0) {
        return showNotification('Không có dữ liệu để xuất!', 'warning');
    }

    // Kiểm tra thư viện
    if (typeof XLSX === 'undefined') {
        return showNotification('Lỗi: Thư viện Excel chưa tải xong. Hãy F5 lại trang!', 'error');
    }

    try {
        // Map dữ liệu (Bỏ cột Ghi chú)
        const exportData = state.data.map((item, index) => {
            const dur = calcDuration(item.start_time, item.finish_time);
            return {
                "STT": index + 1,
                "Tên Máy": item.display_name,
                "Khu Vực": item.area,
                "Thời Điểm Lỗi": fmtTime(item.req_time),
                "Bắt Đầu Sửa": fmtTime(item.start_time),
                "Hoàn Thành": fmtTime(item.finish_time),
                "Thời Gian Sửa": dur.text,
                "Số Phút": dur.mins.toFixed(1)
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(exportData);
        
        // Căn chỉnh độ rộng cột
        const wscols = [
            { wch: 5 }, { wch: 15 }, { wch: 10 }, 
            { wch: 12 }, { wch: 12 }, { wch: 12 }, 
            { wch: 15 }, { wch: 10 }
        ];
        worksheet['!cols'] = wscols;

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Lịch Sử");

        const dateStr = toYMD(state.currentDate);
        const fileName = state.mode === 'daily' 
            ? `BaoCao_${dateStr}.xlsx` 
            : `BaoCao_TongHop.xlsx`;

        XLSX.writeFile(workbook, fileName);
        showNotification('Đã tải xuống file Excel!', 'success');
    } catch (e) {
        console.error("Lỗi xuất Excel:", e);
        showNotification('Có lỗi khi tạo file', 'error');
    }
}

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
    updateUI();
    fetchHistory();

    // 1. Navigation
    getEl('prevDayBtn')?.addEventListener('click', () => {
        state.currentDate.setDate(state.currentDate.getDate() - 1);
        updateUI();
        fetchHistory();
    });

    getEl('nextDayBtn')?.addEventListener('click', () => {
        const today = new Date();
        if (toYMD(state.currentDate) !== toYMD(today)) {
            state.currentDate.setDate(state.currentDate.getDate() + 1);
            updateUI();
            fetchHistory();
        }
    });

    // 2. Filter
    getEl('toggleFilterBtn')?.addEventListener('click', () => {
        state.mode = 'range';
        const now = new Date();
        getEl('filterEndDate').value = toYMD(now);
        now.setDate(1);
        getEl('filterStartDate').value = toYMD(now);
        updateUI();
    });

    getEl('closeFilterBtn')?.addEventListener('click', () => {
        state.mode = 'daily';
        state.currentDate = new Date();
        updateUI();
        fetchHistory();
    });

    getEl('applyFilterBtn')?.addEventListener('click', () => {
        fetchHistory();
    });

    // 3. Export Excel (ID chính xác: exportExcelBtn)
    getEl('exportExcelBtn')?.addEventListener('click', exportToExcel);
});

// --- REALTIME ---
if (window.io) {
    const socket = io();
    socket.on('line_update', (data) => {
        if (data.status === 'done' && state.mode === 'daily') {
            const today = new Date();
            if (toYMD(state.currentDate) === toYMD(today)) {
                if(window.histTimeout) clearTimeout(window.histTimeout);
                window.histTimeout = setTimeout(fetchHistory, 1000);
            }
        }
    });
}