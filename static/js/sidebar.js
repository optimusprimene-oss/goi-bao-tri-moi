document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('toggleSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const body = document.body;

    // 1. Restore State
    const isCollapsed = localStorage.getItem('sidebarState') === 'collapsed';
    if (window.innerWidth > 992 && isCollapsed) {
        sidebar.classList.add('collapsed');
        body.classList.add('sidebar-closed');
    }

    // 2. Toggle
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            if (window.innerWidth <= 992) {
                // Mobile
                sidebar.classList.toggle('mobile-open');
                overlay.classList.toggle('active');
            } else {
                // Desktop
                sidebar.classList.toggle('collapsed');
                body.classList.toggle('sidebar-closed');
                localStorage.setItem('sidebarState', sidebar.classList.contains('collapsed') ? 'collapsed' : 'expanded');
            }
        });
    }

    // 3. Overlay click
    if (overlay) {
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('mobile-open');
            overlay.classList.remove('active');
        });
    }

    // 4. Active Menu
    const currentPath = window.location.pathname;
    document.querySelectorAll('.sidebar-menu-item').forEach(item => {
        const href = item.getAttribute('href');
        if (href && (currentPath === href || (href !== '/' && currentPath.startsWith(href)))) {
            item.classList.add('active');
        }
    });
});