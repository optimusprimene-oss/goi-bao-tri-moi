export const Filters = {
    active: { area: 'all', status: 'all', search: '' },
    el: {},
    onRefresh: null,

    init(options = {}) {
        this.cacheElements();
        this.onRefresh = options.onRefresh;
        this.loadState();
        this.restoreUI(); // Restore search text
        this.bindEvents();
        
        // Cần setTimeout nhỏ để đảm bảo các nút động đã được render xong trước khi restore active class
        setTimeout(() => {
            this.restoreActiveButtons();
            this.refresh();
        }, 50);
    },

    cacheElements() {
        this.el = {
            search: document.getElementById('search-input'),
            clearBtn: document.getElementById('search-clear'),
            visibleCount: document.getElementById('visible-count'),
            totalCount: document.getElementById('total-count'),
            emptyState: document.getElementById('empty-state'),
            gridContainer: document.getElementById('grid-container'),
            resetBtn: document.getElementById('btn-reset-filter')
        };
    },

    bindEvents() {
        // Search
        this.el.search?.addEventListener('input', () => {
            this.active.search = this.el.search.value.trim().toLowerCase();
            this.el.clearBtn?.classList.toggle('visible', this.active.search.length > 0);
            this.saveState();
            this.refresh();
        });

        this.el.clearBtn?.addEventListener('click', () => {
            this.el.search.value = '';
            this.active.search = '';
            this.el.clearBtn.classList.remove('visible');
            this.saveState();
            this.refresh();
        });

        this.el.resetBtn?.addEventListener('click', () => this.resetFilters());

        // Event Delegation cho Filter Buttons (Vì nút Area là động)
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('.filter-btn');
            if (!btn) return;

            if (btn.dataset.area) this.setFilter('area', btn.dataset.area);
            if (btn.dataset.status) this.setFilter('status', btn.dataset.status);
        });
    },

    setFilter(type, value) {
        this.active[type] = value;
        // Update UI
        document.querySelectorAll(`.filter-btn[data-${type}]`).forEach(b => {
            b.classList.toggle('active', b.dataset[type] === value);
        });
        this.saveState();
        this.refresh();
    },

    resetFilters() {
        this.active = { area: 'all', status: 'all', search: '' };
        if(this.el.search) this.el.search.value = '';
        this.el.clearBtn?.classList.remove('visible');
        
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('[data-area="all"]')?.classList.add('active');
        document.querySelector('[data-status="all"]')?.classList.add('active');
        
        this.saveState();
        this.refresh();
    },

    refresh() {
        const cards = document.querySelectorAll('.card');
        let visible = 0;

        cards.forEach(card => {
            const area = card.dataset.area;
            const status = card.dataset.status;
            const name = (card.querySelector('.line-name')?.textContent || '').toLowerCase();

            const matchArea = this.active.area === 'all' || area === this.active.area;
            const matchStatus = this.active.status === 'all' || status === this.active.status;
            const matchSearch = !this.active.search || name.includes(this.active.search);

            if (matchArea && matchStatus && matchSearch) {
                card.classList.remove('hidden');
                visible++;
            } else {
                card.classList.add('hidden');
            }
        });

        // Update Counts
        if (this.el.visibleCount) this.el.visibleCount.textContent = visible;
        if (this.el.totalCount) this.el.totalCount.textContent = cards.length;

        // Empty State
        const isEmpty = visible === 0 && cards.length > 0;
        if (this.el.emptyState) this.el.emptyState.style.display = isEmpty ? 'block' : 'none';
        
        if (this.onRefresh) this.onRefresh();
    },

    saveState() {
        try { localStorage.setItem('dashboard_filters', JSON.stringify(this.active)); } catch(e){}
    },

    loadState() {
        try {
            const saved = localStorage.getItem('dashboard_filters');
            if (saved) this.active = { ...this.active, ...JSON.parse(saved) };
        } catch(e){}
    },

    restoreUI() {
        if(this.el.search) {
            this.el.search.value = this.active.search;
            if(this.active.search) this.el.clearBtn?.classList.add('visible');
        }
    },

    restoreActiveButtons() {
        // Clear all active first
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        
        // Restore based on state
        const areaBtn = document.querySelector(`.filter-btn[data-area="${this.active.area}"]`);
        if (areaBtn) areaBtn.classList.add('active');
        
        const statusBtn = document.querySelector(`.filter-btn[data-status="${this.active.status}"]`);
        if (statusBtn) statusBtn.classList.add('active');
    }
};