export const Filters = {
  active: { area: 'all', status: 'all', search: '' },
  data: {}, // Dữ liệu từ socket hoặc API (nếu có)

  init({ lineData = {} } = {}) {
    this.data = lineData; // Dữ liệu realtime (nếu cần)
    this.cacheElements();
    this.bindEvents();
    // Xóa dòng restoreCollapseState nếu không cần thiết ngay, hoặc giữ lại tùy bạn
    this.refresh(); 
  },

  cacheElements() {
    this.el = {
      search: document.getElementById('search-input'),
      clearBtn: document.getElementById('search-clear'),
      visible: document.getElementById('visible-count'),
      total: document.getElementById('total-count'),
      emptyState: document.getElementById('empty-state'), // Cache thêm thằng này
      gridContainer: document.getElementById('grid-container'),
      resetBtn: document.getElementById('btn-reset-filter'),
      // Chọn tất cả các thẻ .card
      cards: () => document.querySelectorAll('.card'),
    };
  },

  bindEvents() {
    // Search
    this.el.search?.addEventListener('input', () => {
      this.active.search = this.el.search.value.trim().toLowerCase();
      this.el.clearBtn?.classList.toggle('visible', this.active.search.length > 0);
      this.refresh();
    });

    this.el.clearBtn?.addEventListener('click', () => {
      this.clearSearch();
    });

    // Reset button ở màn hình Empty State
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
    // Update UI active class cho buttons
    document.querySelectorAll(`.filter-btn[data-${type}]`).forEach(btn => {
      btn.classList.toggle('active', btn.dataset[type] === value);
    });
    this.refresh();
  },

  clearSearch() {
    if(this.el.search) this.el.search.value = '';
    this.active.search = '';
    this.el.clearBtn?.classList.remove('visible');
    this.refresh();
  },

  resetAllFilters() {
    this.active = { area: 'all', status: 'all', search: '' };
    if(this.el.search) this.el.search.value = '';
    this.el.clearBtn?.classList.remove('visible');
    
    // Reset UI buttons
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector('.filter-btn[data-area="all"]')?.classList.add('active');
    document.querySelector('.filter-btn[data-status="all"]')?.classList.add('active');

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
      // Ưu tiên lấy dữ liệu từ dataset HTML (đã được server render sẵn)
      // Nếu có dữ liệu realtime trong this.data thì ghi đè lên
      const lineId = card.dataset.line;
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
      
      // Toggle class hidden
      if (isVisible) {
        card.classList.remove('hidden');
        visibleCount++;
      } else {
        card.classList.add('hidden');
      }
    });

    // Cập nhật số lượng
    if(this.el.visible) this.el.visible.textContent = visibleCount;
    if(this.el.total) this.el.total.textContent = total;

    // Xử lý Empty State (Đây là phần quan trọng để fix lỗi của bạn)
    if (visibleCount === 0) {
        this.el.emptyState?.classList.remove('hidden');
        this.el.gridContainer?.classList.add('hidden'); // Ẩn grid container để layout đẹp hơn
    } else {
        this.el.emptyState?.classList.add('hidden');
        this.el.gridContainer?.classList.remove('hidden');
    }
  },

  updateFilterCounts() {
    // Giữ nguyên logic đếm của bạn hoặc cập nhật tùy ý
    // (Phần này code cũ của bạn ổn, chỉ cần đảm bảo đọc đúng dataset)
  }
};