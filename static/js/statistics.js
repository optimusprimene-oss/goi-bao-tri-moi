import { showNotification, getEl, formatDuration } from './utils.js';
import './socket.js'; // Kích hoạt kết nối socket

const CONFIG = {
    colors: {
        fault: '#ef4444',      
        processing: '#f59e0b', 
        normal: '#22c55e',     
        areas: ['#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6', '#f97316'] 
    },
    labels: { fault: 'Lỗi', processing: 'Đang sửa', normal: 'Bình thường' }
};

let chartInstances = {};
let globalStats = null;

document.addEventListener('DOMContentLoaded', () => {
    initStats();
});

function initStats() {
    // Config ChartJS Global
    if (typeof Chart !== 'undefined') {
        Chart.defaults.font.family = "'Inter', sans-serif";
        Chart.defaults.color = '#94a3b8';
        Chart.defaults.borderColor = '#334155';
    }

    refreshData();
    
    // Tự động làm mới mỗi 5 phút
    setInterval(refreshData, 300000); 

    // Lắng nghe sự kiện từ socket.js để cập nhật real-time
    let timeout;
    window.addEventListener('sys:line_update', () => {
        clearTimeout(timeout);
        timeout = setTimeout(refreshData, 2000); // Debounce 2s
    });

    const btn = getEl('exportPptBtn');
    if(btn) btn.addEventListener('click', exportPPT);
}

async function refreshData() {
    try {
        // Tính toán khoảng thời gian 30 ngày gần nhất để lấy dữ liệu biểu đồ
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 30);
        
        const sStr = start.toISOString().split('T')[0];
        const eStr = end.toISOString().split('T')[0];

        // Gọi song song 2 API
        const [linesRes, historyRes] = await Promise.all([
            fetch('/api/lines'), // Lấy trạng thái hiện tại
            fetch(`/api/history_stats?start_date=${sStr}&end_date=${eStr}`) // Lấy lịch sử cho biểu đồ
        ]);
        
        if (!linesRes.ok || !historyRes.ok) throw new Error("API Error");

        const lines = await linesRes.json();
        const historyEvents = await historyRes.json(); 
        
        // Xử lý dữ liệu
        const stats = processData(lines, historyEvents);
        globalStats = stats; 
        
        renderCharts(stats);
        renderTables(stats);
        
    } catch (e) {
        console.error("Stats Error:", e);
        // Không hiển thị notification lỗi liên tục để tránh spam UI
    }
}

function processData(currentLines, historyEvents) {
    // 1. Xác định danh sách Khu vực động
    const uniqueAreas = [...new Set(currentLines.map(l => l.area || 'Unknown'))].sort();
    const areaColors = {};
    uniqueAreas.forEach((area, idx) => {
        areaColors[area] = CONFIG.colors.areas[idx % CONFIG.colors.areas.length];
    });

    // 2. Khởi tạo cấu trúc dữ liệu
    const res = {
        areas: uniqueAreas,
        areaColors: areaColors,
        currentCounts: { fault: 0, processing: 0, normal: 0 },
        areaCurrent: {},
        monthData: {}, // Dữ liệu biểu đồ tháng
        weekData: {},  // Dữ liệu biểu đồ tuần
        totals: {},
        times: {}
    };

    uniqueAreas.forEach(area => {
        res.areaCurrent[area] = { fault: 0, processing: 0, normal: 0 };
        res.monthData[area] = Array(31).fill(0);
        res.weekData[area] = Array(6).fill(0);
        res.totals[area] = { w: 0, m: 0 };
        res.times[area] = [];
    });

    // 3. Tính Toán Hiện Trạng (Pie Chart & Bar Chart Status)
    const lineToAreaMap = {}; 
    currentLines.forEach(item => {
        const area = item.area || 'Unknown';
        let status = 'normal';
        if (item.type === 'fault') status = 'fault';
        if (item.type === 'processing') status = 'processing';
        
        lineToAreaMap[item.line] = area;
        res.currentCounts[status]++;
        if (res.areaCurrent[area]) res.areaCurrent[area][status]++;
    });

    // 4. Tính Toán Lịch Sử (Line Chart & Week Bar)
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const monday = new Date(now);
    const dayOfWeek = now.getDay() || 7; 
    monday.setHours(0,0,0,0);
    monday.setDate(now.getDate() - dayOfWeek + 1);

    // Duyệt qua mảng lịch sử (đảm bảo historyEvents là mảng)
    if (Array.isArray(historyEvents)) {
        historyEvents.forEach(e => {
            // Trong API history_stats, e.line có thể là số hoặc chuỗi
            // Ta cần tìm Area của Line này dựa vào map hiện tại
            // (Lưu ý: Nếu máy đã bị xóa, có thể không tìm thấy Area -> Cho vào Unknown hoặc bỏ qua)
            const area = lineToAreaMap[e.line] || 'Unknown';
            
            // Nếu area không nằm trong danh sách hiển thị hiện tại thì bỏ qua để tránh lỗi biểu đồ
            if (!res.monthData[area]) return;

            // API history_stats trả về e.finish_time là string ISO
            const finishTime = new Date(e.finish_time);
            if (isNaN(finishTime)) return;

            // Thống kê theo Tháng (Dựa trên ngày hoàn thành)
            if (finishTime.getMonth() === currentMonth && finishTime.getFullYear() === currentYear) {
                const dayIdx = finishTime.getDate() - 1;
                if (res.monthData[area][dayIdx] !== undefined) {
                    res.monthData[area][dayIdx]++;
                    res.totals[area].m++;
                }
            }

            // Thống kê theo Tuần
            if (finishTime >= monday) {
                const d = finishTime.getDay(); // 0=CN
                if (d !== 0) {
                    const idx = (d + 6) % 7; // T2=0
                    if (res.weekData[area][idx] !== undefined) {
                        res.weekData[area][idx]++;
                        res.totals[area].w++;
                    }
                }
            }

            // Tính thời gian TB (MTTR) - e.mttr từ API là string dạng "0h 15m 20s"
            // Nếu muốn tính toán lại chính xác, cần parse lại string hoặc dùng raw seconds.
            // Ở đây ta demo đơn giản, hoặc có thể parse từ start_time/finish_time nếu có
        });
    }

    return res;
}

function renderCharts(data) {
    const commonOpts = {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } }
    };

    // 1. Pie Chart
    drawChart('statusPie', 'doughnut', {
        labels: ['Lỗi', 'Đang sửa', 'Bình thường'],
        datasets: [{
            data: [data.currentCounts.fault, data.currentCounts.processing, data.currentCounts.normal],
            backgroundColor: [CONFIG.colors.fault, CONFIG.colors.processing, CONFIG.colors.normal],
            borderWidth: 0
        }]
    }, commonOpts);
    
    renderLegend('statusPieLegend', [
        { label: 'Lỗi', color: CONFIG.colors.fault, val: data.currentCounts.fault },
        { label: 'Đang sửa', color: CONFIG.colors.processing, val: data.currentCounts.processing },
        { label: 'Bình thường', color: CONFIG.colors.normal, val: data.currentCounts.normal }
    ]);

    // 2. Bar Chart Area
    const datasetsArea = ['fault', 'processing', 'normal'].map(st => ({
        label: CONFIG.labels[st],
        backgroundColor: CONFIG.colors[st],
        data: data.areas.map(area => data.areaCurrent[area][st])
    }));
    
    drawChart('areaGroupedBar', 'bar', {
        labels: data.areas, datasets: datasetsArea
    }, { ...commonOpts, scales: { x: { stacked: false }, y: { beginAtZero: true } } });
    
    renderLegend('areaGroupedBarLegend', [
        { label: 'Lỗi', color: CONFIG.colors.fault },
        { label: 'Đang sửa', color: CONFIG.colors.processing },
        { label: 'Bình thường', color: CONFIG.colors.normal }
    ]);

    // 3. Month Line
    const days = new Date().getDate();
    const datasetsLine = data.areas.map(area => ({
        label: area,
        borderColor: data.areaColors[area],
        backgroundColor: data.areaColors[area],
        data: data.monthData[area].slice(0, days),
        tension: 0.3, pointRadius: 3
    }));

    drawChart('monthLine', 'line', {
        labels: Array.from({length: days}, (_, i) => i + 1),
        datasets: datasetsLine
    }, { ...commonOpts, scales: { y: { beginAtZero: true } } });

    // 4. Week Bar
    const datasetsWeek = data.areas.map(area => ({
        label: area,
        backgroundColor: data.areaColors[area],
        data: data.weekData[area]
    }));

    drawChart('weekGroupedBar', 'bar', {
        labels: ['T2', 'T3', 'T4', 'T5', 'T6', 'T7'],
        datasets: datasetsWeek
    }, { ...commonOpts, scales: { y: { beginAtZero: true } } });
}

function renderTables(data) {
    // Bảng Tổng hợp
    const sumBody = getEl('summaryTableBody');
    if (sumBody) {
        sumBody.innerHTML = data.areas.map(area => `
            <tr>
                <td><strong>${area}</strong></td>
                <td>${data.totals[area].w}</td>
                <td>${data.totals[area].m}</td>
            </tr>
        `).join('');
    }

    // Bảng Hiệu suất (Tạm thời để trống hoặc logic tính trung bình nếu cần)
    // ...
}

function drawChart(id, type, data, opts={}) {
    const ctx = getEl(id)?.getContext('2d');
    if (!ctx) return;
    if (chartInstances[id]) chartInstances[id].destroy();
    charts[id] = new Chart(ctx, { type, data, options: { responsive: true, ...opts } });
    chartInstances[id] = charts[id];
}

function renderLegend(id, items) {
    const el = getEl(id);
    if (!el) return;
    el.innerHTML = items.map(i => `
        <div class="legend-item">
            <span class="legend-color" style="background: ${i.color}"></span>
            <span>${i.label}</span>
            ${i.val !== undefined ? `<span class="legend-value">(${i.val})</span>` : ''}
        </div>
    `).join('');
}

// --- PPT EXPORT ---
async function exportPPT() {
    if (!globalStats || typeof PptxGenJS === 'undefined') {
        showNotification('Chưa có dữ liệu!', 'error');
        return;
    }
    try {
        const pres = new PptxGenJS();
        pres.layout = 'LAYOUT_16x9';
        const slide = pres.addSlide();
        slide.background = { color: 'FFFFFF' };
        
        const dateStr = new Date().toLocaleDateString('vi-VN');
        slide.addText("BÁO CÁO THỐNG KÊ BẢO TRÌ", { x:0.5, y:0.5, fontSize:24, bold:true, color:'000000' });
        slide.addText(`Ngày: ${dateStr}`, { x:0.5, y:1.0, fontSize:14, color:'666666' });

        // (Thêm logic vẽ biểu đồ vào slide tại đây tương tự code cũ)
        
        pres.writeFile({ fileName: `BaoCao_${new Date().toISOString().slice(0,10)}.pptx` });
        showNotification('Đã xuất file PPT!', 'success');
    } catch(e) {
        console.error(e);
        showNotification('Lỗi xuất file', 'error');
    }
}