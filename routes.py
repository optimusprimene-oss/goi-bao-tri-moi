# routes.py
import logging
from flask import render_template, jsonify, request
from datetime import datetime
from sqlalchemy import func, and_, desc
from models import db, Event

# --- 1. CÁC HÀM TIỆN ÍCH (HELPERS) ---
def get_area(line_num: int) -> str:
    """Xác định khu vực dựa trên số thứ tự line."""
    if 1 <= line_num <= 40: return 'Assembly'
    if 41 <= line_num <= 52: return 'Panel'
    if 53 <= line_num <= 57: return 'Visor'
    return 'Unknown'

def register_routes(app):
    
    # --- 2. CÁC ROUTE GIAO DIỆN (VIEWS) ---
    @app.route("/")
    def index():
        return render_template("index.html")

    @app.route("/statistics")
    def statistics():
        return render_template("statistics.html")

    @app.route("/history")
    def history():
        return render_template("history.html")

    # --- 3. API CHO DASHBOARD (TRANG CHỦ) ---
    # Giữ nguyên logic cũ để không ảnh hưởng dữ liệu Dashboard
    @app.route("/api/lines")
    def api_lines():
        # Tìm sự kiện mới nhất của từng line
        subq = db.session.query(
            Event.line,
            func.max(Event.timestamp).label("latest_ts")
        ).group_by(Event.line).subquery()

        latest_events = db.session.query(Event).join(
            subq,
            and_(Event.line == subq.c.line, Event.timestamp == subq.c.latest_ts)
        ).all()

        latest_map = {e.line: e for e in latest_events}
        result = []
        counters = {'Assembly': 0, 'Panel': 0, 'Visor': 0}

        for line in range(1, 58):
            area = get_area(line)
            counters[area] = counters.get(area, 0) + 1
            e = latest_map.get(str(line))
            
            # Logic xác định trạng thái hiện tại
            raw_status = e.type if e else 'normal'
            # Các trạng thái coi là bình thường: done, normal, ack
            status = 'normal' if raw_status in ['done', 'normal', 'ack'] else raw_status

            result.append({
                'line': line,
                'area': area,
                'index': counters[area],
                'type': status,
                'display_name': f"{area} {counters[area]:02d}",
                'req_time': e.req_time.strftime('%H:%M:%S') if e and e.req_time else None,
                'start_time': e.start_time.strftime('%H:%M:%S') if e and e.start_time else None
            })
        return jsonify(result)

    # --- 4. API CHO TRANG LỊCH SỬ (LOGIC MỚI - HỢP LÝ HƠN) ---
    @app.route("/api/history_stats")
    def api_history_stats():
        """
        API chuyên biệt cho trang lịch sử.
        - Chỉ lấy các sự kiện đã hoàn thành (type='done' hoặc 'normal').
        - Hỗ trợ lọc theo ngày.
        - Dữ liệu trả về đã bao gồm đầy đủ thời gian để tính toán MTTR.
        """
        start_str = request.args.get('start_date')
        end_str = request.args.get('end_date')

        # Xử lý thời gian lọc: Mặc định là HÔM NAY nếu không gửi lên
        if not start_str or not end_str:
            now = datetime.now()
            start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
            end_date = now.replace(hour=23, minute=59, second=59, microsecond=999999)
        else:
            try:
                start_date = datetime.strptime(start_str, '%Y-%m-%d')
                end_date = datetime.strptime(end_str, '%Y-%m-%d').replace(hour=23, minute=59, second=59)
            except ValueError:
                return jsonify([]) # Trả về rỗng nếu ngày lỗi

        # Truy vấn tối ưu: Lọc trực tiếp sự kiện hoàn thành trong khoảng thời gian
        # Vì app.py bây giờ đã lưu đủ thông tin (req, start, finish) vào dòng 'done',
        # ta không cần join phức tạp nữa.
        query = Event.query.filter(
            Event.type.in_(['done', 'normal']),
            Event.finish_time >= start_date,
            Event.finish_time <= end_date
        ).order_by(desc(Event.finish_time))

        events = query.all()
        result = []

        for e in events:
            # Tái tạo lại thông tin hiển thị
            try:
                line_num = int(e.line)
            except:
                line_num = 0
            
            area = get_area(line_num)
            
            # Tính số thứ tự trong khu vực (Assembly 01, Panel 02...)
            if area == 'Assembly': idx = line_num
            elif area == 'Panel': idx = line_num - 40
            elif area == 'Visor': idx = line_num - 52
            else: idx = line_num

            result.append({
                'id': e.id,
                'line': e.line,
                'area': area,
                'display_name': f"{area} {idx:02d}",
                # Các mốc thời gian quan trọng
                'req_time': e.req_time.isoformat() if e.req_time else None,
                'start_time': e.start_time.isoformat() if e.start_time else None,
                'finish_time': e.finish_time.isoformat() if e.finish_time else None,
                # Loại lỗi (nếu có cập nhật model)
                'description': getattr(e, 'description', '') 
            })

        return jsonify(result)

    # --- 5. API RAW EVENTS (Dùng cho debug hoặc biểu đồ tổng hợp) ---
    @app.route("/api/events")
    def api_events():
        try:
            limit = int(request.args.get("limit", 500))
            limit = max(1, min(limit, 5000))
        except:
            limit = 500

        events = Event.query.order_by(Event.id.desc()).limit(limit).all()
        
        return jsonify([{
            'id': e.id,
            'line': e.line,
            'type': e.type,
            'timestamp': e.timestamp.isoformat(),
            'req_time': e.req_time.isoformat() if e.req_time else None,
            'start_time': e.start_time.isoformat() if e.start_time else None,
            'finish_time': e.finish_time.isoformat() if e.finish_time else None
        } for e in events])