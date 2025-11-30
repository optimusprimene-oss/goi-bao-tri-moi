import logging
from flask import render_template, jsonify, request, abort
from datetime import datetime, timedelta
from sqlalchemy import func, and_, desc, cast, Time
from models import db, Event, Device 
import pytz 

logger = logging.getLogger(__name__)

# --- SỬA LỖI CHÍNH TẢ TIMEZONE ---
VN_TIMEZONE = pytz.timezone('Asia/Ho_Chi_Minh')

def get_display_time(dt):
    if not dt: return None
    # Chuyển về múi giờ VN để hiển thị
    return dt.astimezone(VN_TIMEZONE).strftime('%H:%M:%S')

def get_area_from_line(line_num):
    """Helper hỗ trợ gợi ý khu vực (không bắt buộc)"""
    try:
        ln = int(line_num)
        if 1 <= ln <= 40: return 'Assembly'
        if 41 <= ln <= 52: return 'Panel'
        if 53 <= ln <= 57: return 'Visor'
    except:
        pass
    return 'Unknown'

def register_routes(app):
    
    @app.route("/")
    def index(): return render_template("index.html")

    @app.route("/statistics")
    def statistics(): return render_template("statistics.html")

    @app.route("/history")
    def history(): return render_template("history.html")

    @app.route("/admin")
    def admin_page(): return render_template("admin.html")

    # --- API THỐNG KÊ CHUNG (ĐÃ THÊM) ---
    @app.route("/api/events")
    def api_events_stats():
        """
        [ĐÃ THÊM] Route cung cấp dữ liệu thống kê chung (Events Stats) cho Frontend.
        Frontend gọi API này trước khi báo trạng thái 'Online'.
        """
        limit = request.args.get('limit', 5000, type=int)

        # 1. Lấy tất cả sự kiện 'done' gần nhất
        events = Event.query.filter(Event.type.in_(['done', 'normal'])).order_by(desc(Event.id)).limit(limit).all()
        
        total_events = len(events)
        total_mttr_seconds = 0
        
        # 2. Tính toán MTTR trung bình và các chỉ số
        for e in events:
            if e.req_time and e.finish_time:
                total_mttr_seconds += (e.finish_time - e.req_time).total_seconds()

        avg_mttr = 0
        if total_events > 0:
            avg_mttr_seconds = total_mttr_seconds / total_events
            
            # Chuyển đổi MTTR trung bình sang định dạng HH:MM:SS
            h, r = divmod(int(avg_mttr_seconds), 3600)
            m, s = divmod(r, 60)
            avg_mttr = f"{h}h {m:02d}m {s:02d}s"
        else:
             avg_mttr = "N/A"

        # 3. Đếm số lượng thiết bị hiện đang ở trạng thái 'fault'
        fault_devices = db.session.query(Device).filter(Device.status == 'fault').count()
        
        # 4. Trả về kết quả tổng hợp
        return jsonify({
            'total_events_processed': total_events,
            'current_faults': fault_devices,
            'average_mttr': avg_mttr,
            'timestamp': datetime.now(VN_TIMEZONE).strftime('%Y-%m-%d %H:%M:%S')
        })

    # --- API DASHBOARD ---
    @app.route("/api/lines")
    def api_lines():
        # Lấy tất cả thiết bị ĐÃ GÁN LINE
        devices = Device.query.filter(Device.line_id.isnot(None)).all()
        
        # Sort thiết bị: Ưu tiên số, sau đó đến chữ
        def sort_key(d):
            try: return (0, int(d.line_id))
            except: return (1, d.line_id)
        devices.sort(key=sort_key)

        lines_in_use = [d.line_id for d in devices]

        # Tìm sự kiện mới nhất
        latest_map = {}
        if lines_in_use:
            # Sửa lỗi sử dụng subquery không tương thích với eventlet/SQLAlchemy.
            # Dùng join để đảm bảo truy vấn an toàn hơn.
            subq = db.session.query(
                Event.line,
                func.max(Event.timestamp).label("latest_ts")
            ).filter(Event.line.in_(lines_in_use)).group_by(Event.line).subquery()

            latest_events = db.session.query(Event).join(
                subq,
                and_(Event.line == subq.c.line, Event.timestamp == subq.c.latest_ts)
            ).all()
            latest_map = {e.line: e for e in latest_events}

        result = []
        area_counters = {} # Đếm số lượng máy trong từng khu vực để đánh số thứ tự hiển thị

        for dev in devices:
            area = dev.area or "Chưa phân loại"
            if area not in area_counters: area_counters[area] = 0
            area_counters[area] += 1
            idx = area_counters[area]

            e = latest_map.get(dev.line_id)
            raw_status = e.type if e else 'done'
            status = 'normal' if raw_status in ['done', 'normal', 'ack'] else raw_status

            # Tên hiển thị: [Khu vực] [Số]
            display_name = f"{area} {dev.line_id}" 

            result.append({
                'line': dev.line_id,
                'area': area,
                'index': idx,
                'type': status,
                'display_name': display_name,
                'req_time': get_display_time(e.req_time) if e else None,
                'start_time': get_display_time(e.start_time) if e else None,
                'device_mac': dev.mac_address
            })
        return jsonify(result)

    # --- API LỊCH SỬ ---
    @app.route("/api/history_stats")
    def api_history_stats():
        # ... (Nội dung giữ nguyên)
        start_str = request.args.get('start_date')
        end_str = request.args.get('end_date')
        now_vn = datetime.now(VN_TIMEZONE)

        if not start_str or not end_str:
            start_date_vn = now_vn.replace(hour=0, minute=0, second=0, microsecond=0)
            end_date_vn = now_vn.replace(hour=23, minute=59, second=59, microsecond=999999)
        else:
            try:
                start_date_vn = VN_TIMEZONE.localize(datetime.strptime(start_str, '%Y-%m-%d'))
                end_date_vn = VN_TIMEZONE.localize(datetime.strptime(end_str, '%Y-%m-%d')).replace(hour=23, minute=59, second=59)
            except ValueError:
                return jsonify([])

        start_utc = start_date_vn.astimezone(pytz.utc)
        end_utc = end_date_vn.astimezone(pytz.utc)

        query = Event.query.filter(
            Event.type.in_(['done', 'normal']),
            Event.finish_time >= start_utc,
            Event.finish_time <= end_utc
        ).order_by(desc(Event.finish_time))

        events = query.all()
        result = []
        
        # Cache device info để lấy Area
        all_devs = Device.query.all()
        dev_map = {d.line_id: d for d in all_devs}

        for e in events:
            dev = dev_map.get(e.line)
            area = dev.area if dev else "Unknown"
            
            result.append({
                'id': e.id,
                'line': e.line,
                'display_name': f"{area} - Line {e.line}",
                'description': e.description,
                'mttr': e.mttr,
                'req_time': e.req_time.astimezone(VN_TIMEZONE).strftime('%H:%M:%S') if e.req_time else None,
                'start_time': e.start_time.astimezone(VN_TIMEZONE).strftime('%H:%M:%S') if e.start_time else None,
                'finish_time': e.finish_time.astimezone(VN_TIMEZONE).strftime('%H:%M:%S') if e.finish_time else None
            })
        return jsonify(result)

    # --- API QUẢN LÝ THIẾT BỊ (ADMIN) ---
    @app.route("/api/devices", methods=["GET", "POST"])
    @app.route("/api/devices/<mac_address>", methods=["DELETE"])
    def api_devices(mac_address=None):
        if request.method == "GET":
            devices = Device.query.all()
            # ... (Phần logic GET giữ nguyên)
            return jsonify([d.to_dict() for d in devices])

        elif request.method == "POST":
            # ... (Phần logic POST giữ nguyên)
            data = request.get_json()
            mac = data.get('mac')
            if not mac: abort(400, description="Thiếu MAC Address")

            line_id = data.get('line')
            area = data.get('area') 

            # Check trùng Line ID (nếu Line ID khác rỗng)
            if line_id:
                exist = Device.query.filter(Device.line_id == line_id, Device.mac_address != mac).first()
                if exist: abort(409, description=f"Line {line_id} đang được dùng bởi MAC khác!")

            device = Device.query.filter_by(mac_address=mac).first()
            if device:
                device.line_id = line_id
                device.area = area
            else:
                device = Device(mac_address=mac, line_id=line_id, area=area, status='offline')
                db.session.add(device)
            
            db.session.commit()
            return jsonify(device.to_dict())

        elif request.method == "DELETE":
            # ... (Phần logic DELETE giữ nguyên)
            device = Device.query.filter_by(mac_address=mac_address).first()
            if device:
                db.session.delete(device)
                db.session.commit()
                return jsonify({"msg": "Deleted"})
            return jsonify({"msg": "Not found"}), 404