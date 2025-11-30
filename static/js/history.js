import { showNotification } from './utils.js';

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

// Hàm tính thời gian sửa (API đã trả về string, nhưng ta cần tính phút để cảnh báo)
function calcDurationMins(startStr, endStr) {
    if (!startStr || !endStr) return 0;
    // Chuyển string HH:MM:SS về phút (Giả định cùng ngày cho đơn giản, hoặc parse full date)
    // Tuy nhiên, server trả về HH:MM:SS hiển thị, nhưng để tính toán chính xác cần parse full date.
    // Trong trường hợp này, để đơn giản, ta tin tưởng MTTR server trả về nếu có, hoặc hiển thị text.
    // Logic highlight đỏ: tạm thời bỏ qua nếu chỉ có giờ phút giây.
    return 0; 
}

// --- DOM ELEMENTS ---
const els = {
    dateLabel: document.getElementById('displayDateLabel'),
    dateValue: document.getElementById('displayDateValue'),
    prevBtn: document.getElementById('prevDayBtn'),
    nextBtn: document.getElementById('nextDayBtn'),
    navPanel: document.getElementById('dayNavPanel'),
    filterPanel: document.getElementById('advancedFilterPanel'),
    toggleBtn: document.getElementById('toggleFilterBtn'),
    tbody: document.getElementById('historyBody'),
    count: document.getElementById('count'),
    empty: document.getElementById('emptyState'),
    startInp: document.getElementById('filterStartDate'),
    endInp: document.getElementById('filterEndDate'),
    closeBtn: document.getElementById('closeFilterBtn'),
    applyBtn: document.getElementById('applyFilterBtn'),
    exportBtn: document.getElementById('exportExcelBtn')
};

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
    updateUI();
    fetchHistory();
    bindEvents();
});

function bindEvents() {
    els.prevBtn?.addEventListener('click', () => changeDay(-1));
    els.nextBtn?.addEventListener('click', () => changeDay(1));
    
    els.toggleBtn?.addEventListener('click', () => {
        state.mode = 'range';
        const nowStr = toYMD(new Date());
        els.endInp.value = nowStr;
        const start = new Date(); start.setDate(1);
        els.startInp.value = toYMD(start);
        updateUI();
    });

    els.closeBtn?.addEventListener('click', () => {
        state.mode = 'daily';
        state.currentDate = new Date();
        updateUI();
        fetchHistory();
    });

    els.applyBtn?.addEventListener('click', fetchHistory);
    els.exportBtn?.addEventListener('click', exportToExcel);
}

function changeDay(delta) {
    const today = new Date();
    state.currentDate.setDate(state.currentDate.getDate() + delta);
    
    // Không cho đi quá ngày hiện tại
    if (state.currentDate > today) state.currentDate = today;
    
    updateUI();
    fetchHistory();
}

function updateUI() {
    const today = new Date();
    const isToday = toYMD(state.currentDate) === toYMD(today);
    
    els.dateValue.textContent = state.currentDate.toLocaleDateString('vi-VN', { 
        weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' 
    });
    els.dateLabel.textContent = isToday ? 'HÔM NAY' : 'LỊCH SỬ NGÀY';
    els.nextBtn.disabled = isToday;

    if (state.mode === 'range') {
        els.navPanel.style.display = 'none';
        els.toggleBtn.parentElement.style.display = 'none';
        els.filterPanel.style.display = 'block';
    } else {
        els.navPanel.style.display = 'flex';
        els.toggleBtn.parentElement.style.display = 'block';
        els.filterPanel.style.display = 'none';
    }
}

async function fetchHistory() {
    let url = API_URL;
    if (state.mode === 'range') {
        const s = els.startInp.value;
        const e = els.endInp.value;
        if (!s || !e) return alert('Chọn ngày!');
        url += `?start_date=${s}&end_date=${e}`;
    } else {
        const d = toYMD(state.currentDate);
        url += `?start_date=${d}&end_date=${d}`;
    }

    try {
        els.tbody.style.opacity = '0.5';
        const res = await fetch(url);
        const data = await res.json();
        state.data = data;
        renderTable(data);
    } catch (err) {
        console.error(err);
    } finally {
        els.tbody.style.opacity = '1';
    }
}

function renderTable(data) {
    els.tbody.innerHTML = '';
    els.count.textContent = data.length;
    els.empty.style.display = data.length === 0 ? 'block' : 'none';

    data.forEach((item, index) => {
        const tr = document.createElement('tr');
        // Bạn có thể thêm logic highlight nếu mttr > 15p
        
        tr.innerHTML = `
            <td>${index + 1}</td>
            <td style="font-weight:bold; color: #60a5fa">${item.display_name}</td>
            <td>${item.area || ''}</td>
            <td>${item.req_time || '-'}</td>
            <td>${item.start_time || '-'}</td>
            <td>${item.finish_time || '-'}</td>
            <td style="font-weight:bold">${item.mttr || '-'}</td>
        `;
        els.tbody.appendChild(tr);
    });
}

function exportToExcel() {
    if (!state.data.length) return alert('Không có dữ liệu!');
    if (typeof XLSX === 'undefined') return alert('Chờ thư viện tải...');

    const exportData = state.data.map((item, idx) => ({
        "STT": idx + 1,
        "Máy": item.display_name,
        "Khu Vực": item.area,
        "Báo Lỗi": item.req_time,
        "Bắt Đầu": item.start_time,
        "Kết Thúc": item.finish_time,
        "Thời Gian Sửa": item.mttr
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "History");
    XLSX.writeFile(wb, `History_${toYMD(state.currentDate)}.xlsx`);
}