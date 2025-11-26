import { showNotification, getEl, formatDuration } from './utils.js';

// --- CẤU HÌNH ---
const CONFIG = {
    areas: ['Assembly', 'Panel', 'Visor'],
    colors: {
        fault: '#ef4444',      // Đỏ
        processing: '#f59e0b', // Vàng
        normal: '#22c55e',     // Xanh lá
        Assembly: '#3b82f6',
        Panel: '#10b981',
        Visor: '#8b5cf6'
    },
    labels: {
        fault: 'Lỗi',
        processing: 'Đang sửa',
        normal: 'Bình thường'
    }
};

let chartInstances = {};

// --- KHỞI TẠO ---
document.addEventListener('DOMContentLoaded', () => {
    initPage();
});

function initPage() {
    // 1. Config Chart
    if (typeof Chart !== 'undefined') {
        Chart.defaults.color = '#ffffff';            
        Chart.defaults.borderColor = '#334155';      
        Chart.defaults.scale.grid.color = '#334155'; 
        Chart.defaults.font.family = "'Inter', sans-serif";
        Chart.defaults.font.size = 13;
    }

    refreshStats();
    setInterval(refreshStats, 300000); // 5 phút

    if (window.io) {
        const socket = io();
        let debounceTimer;
        const safeRefresh = () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                refreshStats();
            }, 2000);
        };
        // Lắng nghe y hệt trang chủ
        socket.on('line_update', safeRefresh); 
        socket.on('batch_update', safeRefresh);
    }

    const btnExport = getEl('exportPptBtn');
    if (btnExport) {
        btnExport.addEventListener('click', exportStatsToPPT);
    }
}

async function refreshStats() {
    try {
        const [linesRes, eventsRes] = await Promise.all([
            fetch('/api/lines'),            // Nguồn 1: Hiện trạng (Giống trang chủ)
            fetch('/api/events?limit=5000') // Nguồn 2: Lịch sử (Chỉ dùng vẽ biểu đồ xu hướng)
        ]);

        const lines = linesRes.ok ? await linesRes.json() : [];
        const events = eventsRes.ok ? await eventsRes.json() : [];

        const stats = processData(lines, events);
        renderCharts(stats);
        renderTables(stats);

    } catch (err) {
        console.error("Stats Error:", err);
    }
}

// --- XỬ LÝ DỮ LIỆU (TÁCH BIỆT NGUỒN) ---
function processData(currentLines, historyEvents) {
    const res = {
        // DATA CHO BIỂU ĐỒ HIỆN TẠI (TRÒN & CỘT BỘ PHẬN)
        currentCounts: { fault: 0, processing: 0, normal: 0 },
        areaCurrent: { Assembly: {}, Panel: {}, Visor: {} },
        
        // DATA CHO BIỂU ĐỒ LỊCH SỬ (ĐƯỜNG & CỘT TUẦN)
        monthData: { Assembly: Array(31).fill(0), Panel: Array(31).fill(0), Visor: Array(31).fill(0) },
        weekData: { Assembly: Array(6).fill(0), Panel: Array(6).fill(0), Visor: Array(6).fill(0) },
        totals: { Assembly: {w:0, m:0}, Panel: {w:0, m:0}, Visor: {w:0, m:0} },
        times: { Assembly: [], Panel: [], Visor: [] } 
    };

    // =========================================================
    // PHẦN 1: TÍNH HIỆN TRẠNG (Dùng duy nhất /api/lines)
    // Logic này copy 100% tư duy của Trang Chủ
    // =========================================================
    
    // B1: Tạo danh sách 57 máy mặc định Bình thường
    const machineMap = new Map();
    for (let i = 1; i <= 57; i++) {
        let area = 'Visor';
        if (i <= 40) area = 'Assembly';
        else if (i <= 52) area = 'Panel';
        
        machineMap.set(i, { status: 'normal', area: area });
    }

    // B2: Chỉ cập nhật trạng thái nếu API Lines báo có vấn đề
    // TUYỆT ĐỐI KHÔNG NHÌN VÀO HISTORY EVENTS Ở ĐÂY
    if (Array.isArray(currentLines)) {
        currentLines.forEach(item => {
            const lineId = Number(item.line || item.id);
            if (lineId >= 1 && lineId <= 57) {
                // Trang chủ hiển thị thế nào, ở đây hiển thị thế đó
                const status = normalizeStatus(item.status || item.type);
                machineMap.get(lineId).status = status;
            }
        });
    }

    // B3: Đếm tổng
    machineMap.forEach(machine => {
        res.currentCounts[machine.status]++;
        
        if (!res.areaCurrent[machine.area]) res.areaCurrent[machine.area] = { fault:0, processing:0, normal:0 };
        if (!res.areaCurrent[machine.area][machine.status]) res.areaCurrent[machine.area][machine.status] = 0;
        
        res.areaCurrent[machine.area][machine.status]++;
    });


    // =========================================================
    // PHẦN 2: TÍNH LỊCH SỬ & THỜI GIAN (Dùng /api/events)
    // Chỉ dùng để vẽ biểu đồ tháng, tuần và tính thời gian TB
    // =========================================================
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const dayOfWeek = now.getDay() || 7; 
    const monday = new Date(now);
    monday.setHours(0,0,0,0);
    monday.setDate(now.getDate() - dayOfWeek + 1);

    historyEvents.forEach(e => {
        const area = normalizeArea(e.area, e.line);
        if (!area) return;

        const timePoint = e.req_time ? new Date(e.req_time) : (e.start_time ? new Date(e.start_time) : null);
        
        // Chỉ đếm những sự kiện LÀ LỖI
        const isFaultEvent = normalizeStatus(e.status || e.type) === 'fault';

        if (timePoint && isFaultEvent) {
            // Tháng
            if (timePoint.getMonth() === currentMonth && timePoint.getFullYear() === currentYear) {
                const dayIdx = timePoint.getDate() - 1;
                res.monthData[area][dayIdx]++;
                res.totals[area].m++;
            }
            // Tuần (Bỏ CN)
            if (timePoint >= monday) {
                const d = timePoint.getDay(); 
                if (d !== 0) {
                    const dayIdx = (d + 6) % 7; 
                    if (dayIdx < 6) {
                        res.weekData[area][dayIdx]++;
                        res.totals[area].w++;
                    }
                }
            }
        }

        // Thời gian TB
        if (e.req_time && e.start_time) {
            const tReq = new Date(e.req_time).getTime();
            const tStart = new Date(e.start_time).getTime();
            const reactSec = (tStart - tReq) / 1000;
            if (reactSec >= 0) {
                let repairSec = 0;
                if (e.finish_time) {
                    const tFinish = new Date(e.finish_time).getTime();
                    repairSec = (tFinish - tStart) / 1000;
                }
                if (!res.times[area]) res.times[area] = [];
                res.times[area].push({ react: reactSec, repair: Math.max(0, repairSec) });
            }
        }
    });

    return res;
}

// --- VẼ BIỂU ĐỒ ---
function renderCharts(data) {
    const commonOpts = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } }
    };

    // PIE
    drawChart('statusPie', 'doughnut', {
        labels: [CONFIG.labels.fault, CONFIG.labels.processing, CONFIG.labels.normal],
        datasets: [{
            data: [data.currentCounts.fault, data.currentCounts.processing, data.currentCounts.normal],
            backgroundColor: [CONFIG.colors.fault, CONFIG.colors.processing, CONFIG.colors.normal],
            borderWidth: 0,
            hoverOffset: 10
        }]
    }, commonOpts);
    renderLegend('statusPieLegend', [
        { label: CONFIG.labels.fault, color: CONFIG.colors.fault, val: data.currentCounts.fault },
        { label: CONFIG.labels.processing, color: CONFIG.colors.processing, val: data.currentCounts.processing },
        { label: CONFIG.labels.normal, color: CONFIG.colors.normal, val: data.currentCounts.normal }
    ]);

    // BAR AREA
    const datasetsArea = ['fault', 'processing', 'normal'].map(st => ({
        label: CONFIG.labels[st],
        backgroundColor: CONFIG.colors[st],
        data: CONFIG.areas.map(a => (data.areaCurrent[a] && data.areaCurrent[a][st]) ? data.areaCurrent[a][st] : 0)
    }));
    drawChart('areaGroupedBar', 'bar', {
        labels: CONFIG.areas,
        datasets: datasetsArea
    }, { ...commonOpts, scales: { x: { stacked: false }, y: { beginAtZero: true } } });
    renderLegend('areaGroupedBarLegend', [
        { label: CONFIG.labels.fault, color: CONFIG.colors.fault },
        { label: CONFIG.labels.processing, color: CONFIG.colors.processing },
        { label: CONFIG.labels.normal, color: CONFIG.colors.normal }
    ]);

    // MONTH LINE
    const daysInMonth = new Date().getDate();
    const datasetsLine = CONFIG.areas.map(a => ({
        label: a,
        borderColor: CONFIG.colors[a],
        backgroundColor: CONFIG.colors[a],
        data: data.monthData[a].slice(0, daysInMonth),
        tension: 0.3,
        pointRadius: 3
    }));
    drawChart('monthLine', 'line', {
        labels: Array.from({length: daysInMonth}, (_, i) => i + 1),
        datasets: datasetsLine
    }, { ...commonOpts, plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 12, padding: 15 } } }, scales: { y: { beginAtZero: true } } });

    // WEEK BAR
    const weekLabels = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    const datasetsWeek = CONFIG.areas.map(a => ({
        label: a,
        backgroundColor: CONFIG.colors[a],
        data: data.weekData[a]
    }));
    drawChart('weekGroupedBar', 'bar', {
        labels: weekLabels,
        datasets: datasetsWeek
    }, { ...commonOpts, plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 12, padding: 15 } } }, scales: { y: { beginAtZero: true } } });
}

// --- VẼ BẢNG ---
function renderTables(data) {
    const sumBody = getEl('summaryTableBody');
    if (sumBody) {
        sumBody.innerHTML = CONFIG.areas.map(a => `
            <tr>
                <td><strong>${a}</strong></td>
                <td>${data.totals[a].w}</td>
                <td>${data.totals[a].m}</td>
            </tr>
        `).join('');
    }

    const timeBody = getEl('timeTableBody');
    if (timeBody) {
        timeBody.innerHTML = CONFIG.areas.map(a => {
            const arr = data.times[a] || [];
            let avgReact = 0, avgRepair = 0;
            if (arr.length > 0) {
                avgReact = arr.reduce((sum, i) => sum + i.react, 0) / arr.length;
                const repairedItems = arr.filter(i => i.repair > 0);
                if (repairedItems.length > 0) {
                    avgRepair = repairedItems.reduce((sum, i) => sum + i.repair, 0) / repairedItems.length;
                }
            }
            return `
                <tr>
                    <td><strong>${a}</strong></td>
                    <td>${formatDuration(avgReact)}</td>
                    <td>${formatDuration(avgRepair)}</td>
                </tr>
            `;
        }).join('');
    }
}

// --- PPT EXPORT ---
async function exportStatsToPPT() {
    try {
        if (typeof PptxGenJS === 'undefined') return;
        const pres = new PptxGenJS();
        pres.layout = 'LAYOUT_16x9'; 
        pres.background = { color: '1e293b' }; 

        const slide = pres.addSlide();
        slide.addText("BÁO CÁO THỐNG KÊ BẢO TRÌ", { x: 0, y: 0.2, w: '100%', h: 0.5, fontSize: 24, color: 'FFFFFF', bold: true, align: 'center', fontFace: 'Arial' });
        const dateStr = new Date().toLocaleDateString('vi-VN');
        slide.addText(`Ngày báo cáo: ${dateStr}`, { x: 0, y: 0.6, w: '100%', fontSize: 14, color: '94a3b8', align: 'center', italic: true });

        const monthChartUrl = getEl('monthLine').toDataURL('image/png');
        const weekChartUrl = getEl('weekGroupedBar').toDataURL('image/png');

        slide.addText("Xu hướng lỗi trong tháng", { x: 0.2, y: 1.0, fontSize: 14, color: 'FFFFFF', bold: true });
        slide.addImage({ data: monthChartUrl, x: 0.2, y: 1.3, w: 4.8, h: 2.6 });

        slide.addText("Số lỗi trong tuần (T2-T7)", { x: 5.1, y: 1.0, fontSize: 14, color: 'FFFFFF', bold: true });
        slide.addImage({ data: weekChartUrl, x: 5.1, y: 1.3, w: 4.7, h: 2.6 });

        const tableStyle = { x: 0.2, y: 4.4, w: 4.8, color: 'FFFFFF', fontSize: 11, fontFace: 'Arial', border: { pt: 1, color: '334155' }, fill: { color: '1e293b' }, align: 'center', autoPage: false };
        const headerStyle = { fill: { color: '334155' }, bold: true, color: 'FFFFFF' };

        const rowsSum = [['Bộ phận', 'Lỗi Tuần', 'Lỗi Tháng']];
        document.querySelectorAll('#summaryTableBody tr').forEach(tr => {
            const tds = tr.querySelectorAll('td');
            rowsSum.push([tds[0].innerText, tds[1].innerText, tds[2].innerText]);
        });
        const pptRowsSum = rowsSum.map((row, idx) => row.map(cell => ({ text: cell, options: idx === 0 ? headerStyle : {} })));
        slide.addText("Tổng hợp số lỗi", { x: 0.2, y: 4.1, fontSize: 14, color: 'FFFFFF', bold: true });
        slide.addTable(pptRowsSum, { ...tableStyle, x: 0.2, y: 4.4, w: 4.8 });

        const rowsTime = [['Bộ phận', 'P.Ứng TB', 'Sửa chữa TB']];
        document.querySelectorAll('#timeTableBody tr').forEach(tr => {
            const tds = tr.querySelectorAll('td');
            rowsTime.push([tds[0].innerText, tds[1].innerText, tds[2].innerText]);
        });
        const pptRowsTime = rowsTime.map((row, idx) => row.map(cell => ({ text: cell, options: idx === 0 ? headerStyle : {} })));
        slide.addText("Hiệu suất trung bình", { x: 5.1, y: 4.1, fontSize: 14, color: 'FFFFFF', bold: true });
        slide.addTable(pptRowsTime, { ...tableStyle, x: 5.1, y: 4.4, w: 4.7 });

        const fileName = `BaoCao_BaoTri_${new Date().toISOString().slice(0,10)}.pptx`;
        pres.writeFile({ fileName: fileName });
        showNotification('Đã xuất file PPT thành công!', 'success');
    } catch (e) { console.error("PPT Error:", e); showNotification('Lỗi khi xuất PPT', 'error'); }
}

// --- HELPERS ---
function drawChart(id, type, data, options) {
    const ctx = getEl(id)?.getContext('2d');
    if (!ctx) return;
    if (chartInstances[id]) chartInstances[id].destroy();
    chartInstances[id] = new Chart(ctx, { type, data, options });
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

function normalizeArea(area, line) {
    if (area) return CONFIG.areas.find(a => a.toLowerCase() === area.toLowerCase());
    if (line <= 40) return 'Assembly';
    if (line <= 52) return 'Panel';
    return 'Visor';
}

function normalizeStatus(st) {
    const s = String(st || '').toLowerCase();
    if (['fault', 'error', 'failed', 'loi'].includes(s)) return 'fault';
    if (['processing', 'maintain', 'repair', 'baotri', 'dang bao tri'].includes(s)) return 'processing';
    return 'normal';
}