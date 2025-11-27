export const Filters = {
  active: { area: 'all', status: 'all', search: '' },
  data: {}, 
  STORAGE_KEY: 'dashboard_filter_state', // Key để lưu vào bộ nhớ trình duyệt

  init({ lineData = {} } = {}) {
    this.data = lineData; 
    this.cacheElements();
    
    // 1. Nạp lại trạng thái cũ từ LocalStorage
    this.loadState(); 

    // 2. Cập nhật giao diện (nút bấm, ô search) theo trạng thái vừa nạp
    this.restoreUI();

    this.bindEvents();
    
    // 3. Chạy lọc ngay lập tức
    this.refresh(); 
  },

  cacheElements() {
    this.el = {
      search: document.getElementById('search-input'),
      clearBtn: document.getElementById('search-clear'),
      visible: document.getElementById('visible-count'),
      total: document.getElementById('total-count'),
      emptyState: document.getElementById('empty-state'),
      gridContainer: document.getElementById('grid-container'),
      resetBtn: document.getElementById('btn-reset-filter'),
      cards: () => document.querySelectorAll('.card'),
    };
  },

  // --- CÁC HÀM MỚI ĐỂ XỬ LÝ LƯU TRỮ ---

  // Lưu trạng thái hiện tại vào LocalStorage
  saveState() {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.active));
    } catch (e) {
      console.error('Không thể lưu bộ lọc:', e);
    }
  },

  // Đọc trạng thái từ LocalStorage
  loadState() {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) {
        // Gộp dữ liệu cũ vào active, đề phòng cấu trúc thay đổi
        this.active = { ...this.active, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.error('Lỗi đọc bộ lọc cũ:', e);
    }
  },

  // Cập nhật các nút bấm và ô input cho khớp với active state
  restoreUI() {
    // 1. Khôi phục ô tìm kiếm
    if (this.el.search) {
        this.el.search.value = this.active.search || '';
        this.el.clearBtn?.classList.toggle('visible', this.active.search.length > 0);
    }

    // 2. Khôi phục Active Class cho các nút Area
    document.querySelectorAll('.filter-btn[data-area]').forEach(btn => {
        if (btn.dataset.area === this.active.area) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // 3. Khôi phục Active Class cho các nút Status
    document.querySelectorAll('.filter-btn[data-status]').forEach(btn => {
        if (btn.dataset.status === this.active.status) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
  },

  // -------------------------------------

  bindEvents() {
    // Search
    this.el.search?.addEventListener('input', () => {
      this.active.search = this.el.search.value.trim().toLowerCase();
      this.el.clearBtn?.classList.toggle('visible', this.active.search.length > 0);
      this.saveState(); // <--- LƯU LẠI KHI GÕ
      this.refresh();
    });

    this.el.clearBtn?.addEventListener('click', () => {
      this.clearSearch();
    });

    this.el.resetBtn?.addEventListener('click', () => {
        this.resetAllFilters();
    });

    // Filter Area
    document.querySelectorAll('.filter-btn[data-area]').forEach(btn => {
      btn.addEventListener('click', e => {
        this.setFilter('area', btn.dataset.area);
      });
    });

    // Filter Status
    document.querySelectorAll('.filter-btn[data-status]').forEach(btn => {
      btn.addEventListener('click', e => {
        this.setFilter('status', btn.dataset.status);
      });
    });
  },

  setFilter(type, value) {
    this.active[type] = value;
    
    // Update UI active class
    document.querySelectorAll(`.filter-btn[data-${type}]`).forEach(btn => {
      btn.classList.toggle('active', btn.dataset[type] === value);
    });

    this.saveState(); // <--- LƯU LẠI KHI CHỌN FILTER
    this.refresh();
  },

  clearSearch() {
    if(this.el.search) this.el.search.value = '';
    this.active.search = '';
    this.el.clearBtn?.classList.remove('visible');
    this.saveState(); // <--- LƯU LẠI
    this.refresh();
  },

  resetAllFilters() {
    this.active = { area: 'all', status: 'all', search: '' };
    
    // Reset UI Search
    if(this.el.search) this.el.search.value = '';
    this.el.clearBtn?.classList.remove('visible');
    
    // Reset UI Buttons
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector('.filter-btn[data-area="all"]')?.classList.add('active');
    document.querySelector('.filter-btn[data-status="all"]')?.classList.add('active');

    this.saveState(); // <--- LƯU LẠI TRẠNG THÁI RESET
    this.refresh();
  },

  refresh() {
    this.updateCardVisibility();
    this.updateFilterCounts();
  },

  updateCardVisibility() {
    let visibleCount = 0;
    const cards = this.el.cards();
    const total = cards.length;

    cards.forEach(card => {
      const lineId = card.dataset.line;
      // Dữ liệu realtime nếu có
      const realTimeInfo = this.data[lineId] || {};

      const info = {
        area: realTimeInfo.area || card.dataset.area,
        status: realTimeInfo.status || card.dataset.status || 'normal'
      };

      const name = (card.querySelector('.line-name')?.textContent || '').toLowerCase();
      
      const matchArea = this.active.area === 'all' || info.area === this.active.area;
      const matchStatus = this.active.status === 'all' || info.status === this.active.status;
      const matchSearch = !this.active.search || name.includes(this.active.search);

      const isVisible = matchArea && matchStatus && matchSearch;
      
      if (isVisible) {
        card.classList.remove('hidden');
        visibleCount++;
      } else {
        card.classList.add('hidden');
      }
    });

    if(this.el.visible) this.el.visible.textContent = visibleCount;
    if(this.el.total) this.el.total.textContent = total;

    // Xử lý Empty State
    if (visibleCount === 0) {
        this.el.emptyState?.classList.remove('hidden');
        this.el.gridContainer?.classList.add('hidden');
    } else {
        this.el.emptyState?.classList.add('hidden');
        this.el.gridContainer?.classList.remove('hidden');
    }
  },

  updateFilterCounts() {
    // Logic đếm số lượng (nếu bạn có code đếm số lượng trên nút bấm thì đặt ở đây)
  }
};