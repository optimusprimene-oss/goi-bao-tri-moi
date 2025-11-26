// static/js/history.js
import { downloadCsv, showNotification } from './utils.js';

function fmt(iso) {
  if (!iso) return '-';
  const d = (iso instanceof Date) ? iso : new Date(iso);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleTimeString('vi-VN');
}

async function loadHistory() {
  try {
    const res = await fetch('/api/history_today');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const list = Array.isArray(data) ? data : [];
    const tbody = document.getElementById('historyBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!list.length) {
      const empty = document.getElementById('empty');
      if (empty) empty.style.display = 'block';
      return;
    }
    const empty = document.getElementById('empty');
    if (empty) empty.style.display = 'none';

    list.forEach(item => {
      const name = item.display_name || item.line_name || `Line ${item.line || item.id || ''}`;
      const area = item.area || item.section || '-';
      const status = item.status || item.type || 'done';
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${fmt(item.finish_time || item.done_time || item.timestamp || item.time)}</td>
                      <td>${name}</td>
                      <td>${status}</td>
                      <td>${fmt(item.req_time || item.request_time)}</td>
                      <td>${fmt(item.start_time || item.processing_start)}</td>
                      <td>${fmt(item.finish_time || item.done_time)}</td>
                      <td>${item.mttr || '-'}</td>
                      <td>${area}</td>`;
      tbody.appendChild(tr);
    });
    window.updateCounters && window.updateCounters();
  } catch (e) {
    console.error('loadHistory error', e);
    showNotification('Không tải được lịch sử', 'error');
  }
}

loadHistory();
setInterval(loadHistory, 30000);

if (window.io) {
  const s = io();
  s.on('line_update', payload => {
    console.debug('history socket line_update', payload);
    loadHistory();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('exportCsvBtn')?.addEventListener('click', () => {
    const rows = [['Thời điểm','Dây chuyền','Trạng thái','Phát hiện','Tiếp nhận','Hoàn thành','MTTR','Khu vực']];
    document.querySelectorAll('#historyBody tr').forEach(tr => {
      rows.push(Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim()));
    });
    downloadCsv(rows, 'history_today.csv');
  });
});
