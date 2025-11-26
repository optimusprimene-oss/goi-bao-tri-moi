Hệ thống Gọi Bảo Trì
Một dashboard web realtime để giám sát và quản lý yêu cầu bảo trì trên dây chuyền sản xuất (Assembly / Panel / Visor). Hệ thống hiển thị trạng thái từng dây chuyền dưới dạng card, cung cấp bộ lọc linh hoạt, thống kê lỗi theo thời gian và xuất báo cáo nhanh dưới dạng CSV. Thiết kế hướng tới vận hành sản xuất: phát hiện sự cố nhanh, theo dõi thời gian phản ứng và xu hướng lỗi.

Tổng quan ngắn gọn
Frontend nhẹ, không phụ thuộc framework nặng, dùng ES Modules và Chart.js cho biểu đồ.

Realtime bằng Socket.IO (client) — nhận event line_update, batch_update, line_ack.

REST API backend cung cấp dữ liệu ban đầu: /api/lines, /api/events, /api/server_time.

Local UX: bộ lọc area/status/search, export CSV, lưu trạng thái collapse của filter bằng LocalStorage.

Điểm nổi bật
Cập nhật realtime cho từng card khi server emit event.

Bộ lọc toàn diện: theo khu vực (area), theo trạng thái (status) và tìm kiếm theo tên/số dây chuyền.

MutationObserver + chuẩn hoá dữ liệu giúp ổn định khi DOM bị tái tạo (socket cập nhật).

Trang thống kê (Chart.js): donut trạng thái, bar theo khu vực, lỗi theo ngày/thứ.

Export CSV nhanh cho báo cáo vận hành.

Thông báo (toasts), hiển thị trạng thái kết nối socket, loading/empty state.

Cấu trúc dự án (frontend)
static/js/

utils.js — helper: cache DOM, debounce, CSV export, notifications, clock

app.js — logic chính: update card, socket handlers, filters, counters, server time

filters.js — module quản lý filter, counts, MutationObserver

stats.js — fetch /api/events, aggregate dữ liệu, render Chart.js

templates/

base.html, header.html, sidebar.html — layout

grid.html — grid cards mẫu (data-line, data-area, ids chuẩn)

stats.html — page thống kê (canvas + scripts)

static/css/ — styles (bao gồm .hidden { display: none !important; } và sizing cho canvas)

Yêu cầu
Node.js hoặc Python backend (ví dụ Express / Flask) cung cấp API và Socket.IO server.

Trình duyệt hiện đại hỗ trợ ES Modules.

Chart.js (dùng CDN trong template hoặc import module từ CDN).

API mong đợi
Các tên và cấu trúc dưới đây là ví dụ — điều chỉnh theo backend của bạn.

GET /api/lines

Trả mảng các line: [{ line: 1, area: "Assembly", type: "normal", req_time, start_time, ... }, ...]

GET /api/events?limit=N

Trả mảng sự kiện logs để tổng hợp thống kê: [{ line, status/type, timestamp, area, ... }, ...]

GET /api/server_time

{ time: "HH:MM:SS" }

Socket events (server -> client):

line_update — payload cho 1 line (line, status, req_time, start_time, finish_time, mttr, area)

batch_update — payload chứa danh sách items

line_ack — phản hồi khi có xác nhận thao tác

Cài đặt nhanh (chạy local)
Clone repo git clone <repo-url>

Thiết lập backend (Express/Flask) để cung cấp API và Socket.IO

Đảm bảo template stats có thẻ Chart.js CDN (trước stats.js): <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

Mở trang trên trình duyệt; kiểm tra DevTools → Console/Network:

/static/js/*.js trả 200

/api/events trả dữ liệu JSON hợp lệ

Hướng dẫn phát triển (frontend)
Code JS viết theo ES Modules; import relative paths (./utils.js, ./filters.js).

Nếu muốn import Chart.js như module, sử dụng URL module từ CDN và <script type="module">.

Các điểm cần lưu ý khi thay đổi:

card DOM cần có attributes chuẩn: data-line, data-area, id dạng card-<num>.

status mapping được normalize trong frontend: variants như "done"/"ok" → "normal"; "error"/"failed" → "fault"; "in-progress" → "processing".

CSS: cung cấp .hidden { display: none !important; } và kích thước canvas.

Kiểm tra & debug nhanh
Nếu charts không vẽ: kiểm tra typeof Chart trong Console; nếu undefined, CDN Chart.js chưa nạp trước stats.js..

Nếu filter không hoạt: kiểm tra card.dataset.status / card.dataset.area có tồn tại và đã được normalize (lowercase/trim).

Nếu import "chart.js/auto" lỗi: dùng CDN global hoặc import từ URL tuyệt đối (ví dụ https://cdn.jsdelivr.net/npm/chart.js/auto/dist/chart.min.js) và load script với type="module".

Lệnh hữu ích:

fetch('/api/events?limit=5').then(r=>r.json()).then(console.log).catch(console.error)

document.querySelectorAll('#grid-container .card').forEach(c => console.log(c.id, c.dataset.area, c.dataset.status))

Tài liệu sử dụng
Dashboard: duyệt các card; click nút filter area/status; gõ tìm kiếm để lọc kết hợp.

Statistics: xem biểu đồ tổng quan và lịch sử; bấm "Xuất CSV" để tải bảng tổng hợp.

Reset filters: gọi window.app.resetAllFilters() hoặc dùng nút reset có sẵn.

Contributing
Mở Issue kèm: steps tái hiện, console errors, sample payload JSON (ví dụ từ /api/events).

PR: giải thích thay đổi, giữ backward-compatibility, test manual trên Chrome/Edge/Firefox.

Coding style: vanilla JS + ES Modules; small helpers ở utils.js; avoid global side effects.

License
Đề xuất: MIT License — chỉnh theo nhu cầu tổ chức bạn.
