document.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('toggleSidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const body = document.body;

  // 1. Khôi phục trạng thái từ LocalStorage (Giữ nguyên trạng thái khi F5)
  const isCollapsed = localStorage.getItem('sidebarState') === 'collapsed';
  
  // Nếu màn hình lớn và đã lưu trạng thái đóng -> đóng ngay lập tức (không animation)
  if (window.innerWidth > 992 && isCollapsed) {
    sidebar.classList.add('collapsed');
    // Thêm class vào body để CSS xử lý margin của main-content
    body.classList.add('sidebar-closed'); 
  }

  // 2. Xử lý nút Toggle
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      // Nếu là mobile: Toggle class mobile-open
      if (window.innerWidth <= 992) {
        sidebar.classList.toggle('mobile-open');
        overlay.classList.toggle('active');
      } else {
        // Nếu là desktop: Toggle class collapsed
        sidebar.classList.toggle('collapsed');
        body.classList.toggle('sidebar-closed');
        
        // Lưu trạng thái mới vào bộ nhớ
        if (sidebar.classList.contains('collapsed')) {
          localStorage.setItem('sidebarState', 'collapsed');
        } else {
          localStorage.setItem('sidebarState', 'expanded');
        }
      }
    });
  }

  // 3. Xử lý Overlay (Mobile)
  if (overlay) {
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('mobile-open');
      overlay.classList.remove('active');
    });
  }

  // 4. Active Menu theo URL hiện tại
  const currentPath = window.location.pathname;
  const menuItems = document.querySelectorAll('.sidebar-menu-item');
  
  menuItems.forEach(item => {
    const href = item.getAttribute('href');
    // So sánh tương đối hoặc tuyệt đối tùy router
    if (href && currentPath === href) {
      item.classList.add('active');
    }
  });
});