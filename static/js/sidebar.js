document.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const toggleBtn = document.getElementById('toggleSidebar');

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      sidebar?.classList.toggle('collapsed');
      overlay?.classList.toggle('active');
    });
  }
  overlay?.addEventListener('click', () => {
    sidebar?.classList.remove('collapsed');
    overlay?.classList.remove('active');
  });

  // Active theo URL (phòng khi không dùng Jinja active)
  const path = window.location.pathname;
  document.querySelectorAll('.sidebar-menu-item').forEach(a => {
    const href = a.getAttribute('href');
    if (href && href === path) {
      a.classList.add('active');
      a.setAttribute('aria-current', 'page');
    } else {
      a.classList.remove('active');
      a.removeAttribute('aria-current');
    }
  });
});
