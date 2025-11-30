import { showNotification } from './utils.js'; // Giả sử bạn có utils, nếu chưa có thì dùng alert thay thế tạm

const PASSWORD = "Hwuasung2026"; 
const AUTH_KEY = "admin_logged_in";
let currentDevices = []; 

document.addEventListener('DOMContentLoaded', () => {
    // --- ELEMENT REFERENCES ---
    const els = {
        loginModal: document.getElementById('loginModal'),
        pwdInput: document.getElementById('adminPassword'),
        loginBtn: document.getElementById('btnLogin'),
        loginError: document.getElementById('loginError'),
        backBtn: document.getElementById('btnBack'),
        
        configModal: document.getElementById('configModal'),
        modalTitle: document.getElementById('modalTitle'),
        confMac: document.getElementById('confMac'),
        confLine: document.getElementById('confLine'),
        confArea: document.getElementById('confArea'),
        btnSaveConfig: document.getElementById('btnSaveConfig'),
        closeModalBtn: document.querySelector('.close-modal'),
        
        refreshBtn: document.getElementById('refreshBtn'),
        addDeviceBtn: document.getElementById('addDeviceBtn'),
        tbody: document.getElementById('deviceTableBody'),
        emptyState: document.getElementById('emptyState'),
        onlineCount: document.getElementById('onlineCount')
    };

    // --- 1. AUTHENTICATION LOGIC ---
    const checkLogin = () => {
        const isLoggedIn = sessionStorage.getItem(AUTH_KEY) === 'true';
        if (isLoggedIn) {
            els.loginModal.style.display = 'none';
            loadDevices();
            els.addDeviceBtn.style.display = 'inline-flex';
        } else {
            els.loginModal.style.display = 'flex';
        }
    };

    els.loginBtn.addEventListener('click', () => {
        if (els.pwdInput.value === PASSWORD) {
            sessionStorage.setItem(AUTH_KEY, 'true');
            checkLogin();
        } else {
            els.loginError.style.display = 'block';
            els.pwdInput.value = '';
            els.pwdInput.focus();
        }
    });

    els.pwdInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') els.loginBtn.click();
    });

    els.backBtn.addEventListener('click', () => window.location.href = '/');

    // --- 2. DEVICE MANAGEMENT LOGIC ---
    
    // Load Data
    els.refreshBtn.addEventListener('click', loadDevices);

    // Modal Actions
    els.closeModalBtn.addEventListener('click', () => els.configModal.style.display = 'none');
    els.addDeviceBtn.addEventListener('click', () => openEditModal(null));
    els.btnSaveConfig.addEventListener('click', saveDeviceConfig);

    // Initial Check
    checkLogin();

    // --- FUNCTIONS ---

    async function loadDevices() {
        els.tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px;">Đang tải dữ liệu...</td></tr>';
        
        try {
            const res = await fetch('/api/devices');
            if (!res.ok) throw new Error("Lỗi kết nối server");
            
            const devices = await res.json();
            currentDevices = devices;
            renderTable(devices);
        } catch (err) {
            console.error(err);
            els.tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: #ef4444;">Lỗi: ${err.message}</td></tr>`;
        }
    }

    function renderTable(devices) {
        els.tbody.innerHTML = '';
        let count = 0;

        if (!devices || devices.length === 0) {
            els.emptyState.style.display = 'block';
            els.onlineCount.textContent = 0;
            return;
        }

        els.emptyState.style.display = 'none';

        // Sort: Line ID (số) tăng dần, chữ để cuối
        devices.sort((a, b) => {
            const lineA = parseInt(a.line) || 9999;
            const lineB = parseInt(b.line) || 9999;
            return lineA - lineB;
        });

        devices.forEach(dev => {
            if (dev.status === 'online') count++;

            const tr = document.createElement('tr');
            const lastSeen = dev.last_seen ? new Date(dev.last_seen).toLocaleString('vi-VN') : '--';
            const statusClass = dev.status === 'online' ? 'online' : 'offline';
            const lineDisplay = dev.line ? `<strong>${dev.line}</strong>` : `<span class="unassigned">Chưa gán</span>`;

            tr.innerHTML = `
                <td style="font-family: monospace; color: #fff;">${dev.mac}</td>
                <td><span class="badge-status ${statusClass}">${dev.status.toUpperCase()}</span></td>
                <td>${lineDisplay}</td>
                <td>${dev.area || '--'}</td>
                <td style="font-size: 13px; color: #94a3b8;">${lastSeen}</td>
                <td>
                    <button class="btn-icon edit-btn" title="Cấu hình"><i class="fas fa-edit"></i></button>
                    <button class="btn-icon delete-btn" title="Xóa" style="color: #ef4444; margin-left: 10px;"><i class="fas fa-trash"></i></button>
                </td>
            `;

            // Bind events directly to buttons
            tr.querySelector('.edit-btn').addEventListener('click', () => openEditModal(dev.mac));
            tr.querySelector('.delete-btn').addEventListener('click', () => deleteDevice(dev.mac));

            els.tbody.appendChild(tr);
        });

        els.onlineCount.textContent = count;
    }

    function openEditModal(mac) {
        if (mac) {
            // Edit Mode
            const dev = currentDevices.find(d => d.mac === mac);
            if (!dev) return;
            
            els.modalTitle.textContent = "Cấu hình thiết bị";
            els.confMac.value = dev.mac;
            els.confMac.readOnly = true;
            els.confMac.style.background = "#0f172a";
            els.confLine.value = dev.line || '';
            els.confArea.value = dev.area || '';
        } else {
            // Add New Mode
            els.modalTitle.textContent = "Thêm Thiết Bị Mới";
            els.confMac.value = "";
            els.confMac.readOnly = false;
            els.confMac.style.background = "#1e293b";
            els.confMac.placeholder = "AABBCC112233";
            els.confLine.value = "";
            els.confArea.value = "";
        }
        els.configModal.style.display = 'flex';
    }

    async function saveDeviceConfig() {
        const payload = {
            mac: els.confMac.value.trim(),
            line: els.confLine.value.trim(),
            area: els.confArea.value.trim()
        };

        if (!payload.mac) return alert("Thiếu MAC Address");
        if (!payload.line) return alert("Thiếu Line ID");

        try {
            const res = await fetch('/api/devices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                alert("Lưu thành công!");
                els.configModal.style.display = 'none';
                loadDevices();
            } else {
                const err = await res.json();
                alert("Lỗi: " + (err.description || "Không thể lưu"));
            }
        } catch (e) {
            alert("Lỗi kết nối: " + e.message);
        }
    }

    async function deleteDevice(mac) {
        if (!confirm(`Xóa thiết bị MAC: ${mac}? Hành động này không thể hoàn tác.`)) return;

        try {
            const res = await fetch(`/api/devices/${mac}`, { method: 'DELETE' });
            if (res.ok) {
                loadDevices();
            } else {
                alert("Lỗi khi xóa");
            }
        } catch (e) {
            alert("Lỗi kết nối: " + e.message);
        }
    }
});