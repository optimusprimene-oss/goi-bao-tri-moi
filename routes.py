# routes.py
import logging
from flask import render_template, jsonify, request
from datetime import datetime, timezone
from sqlalchemy import func, and_
from models import db, Event

def get_area(line_num: int) -> str:
    if 1 <= line_num <= 40: return 'Assembly'
    if 41 <= line_num <= 52: return 'Panel'
    if 53 <= line_num <= 57: return 'Visor'
    return 'Unknown'

def format_mttr(req, finish):
    if not req or not finish:
        return "-"
    secs = int((finish - req).total_seconds())
    if secs < 0: secs = 0
    h, r = divmod(secs, 3600)
    m, s = divmod(r, 60)
    if h: return f"{h}h{m:02d}m"
    return f"{m}m{s:02d}s"

def register_routes(app):
    @app.route("/")
    def index():
        return render_template("index.html")

    @app.route("/statistics")
    def statistics():
        return render_template("statistics.html")

    @app.route("/history")
    def history():
        return render_template("history.html")

    @app.route("/api/lines")
    def api_lines():
        # Lấy sự kiện mới nhất cho mỗi line bằng subquery tối ưu
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
            status = e.type if e else 'normal'
            result.append({
                'line': line,
                'area': area,
                'index': counters[area],
                'type': status,
                'req_time': e.req_time.strftime('%H:%M:%S') if e and e.req_time else None,
                'start_time': e.start_time.strftime('%H:%M:%S') if e and e.start_time else None
            })
        return jsonify(result)

    @app.route("/api/events")
    def api_events():
        # Phân trang đơn giản
        try:
            limit = int(request.args.get("limit", 500))
            limit = max(1, min(limit, 2000))
        except Exception:
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

    @app.route("/api/history_today")
    def api_history_today():
        today = datetime.now(timezone.utc).date()

        # Lấy tất cả sự kiện 'normal' trong ngày
        normals = Event.query.filter(
            Event.type == 'normal',
            db.func.date(Event.finish_time) == today
        ).order_by(Event.finish_time.desc()).all()

        # Lấy map sự kiện gần nhất theo type cho tất cả line trong ngày
        # Prefetch để tránh N+1
        faults_map = {}
        procs_map = {}

        # Sự kiện 'fault' gần nhất cho mỗi line
        sub_fault = db.session.query(
            Event.line,
            func.max(Event.timestamp).label("latest_ts")
        ).filter(Event.type == 'fault').group_by(Event.line).subquery()

        faults = db.session.query(Event).join(
            sub_fault,
            and_(Event.line == sub_fault.c.line, Event.timestamp == sub_fault.c.latest_ts)
        ).all()
        for f in faults:
            faults_map[f.line] = f

        # Sự kiện 'processing' gần nhất cho mỗi line
        sub_proc = db.session.query(
            Event.line,
            func.max(Event.timestamp).label("latest_ts")
        ).filter(Event.type == 'processing').group_by(Event.line).subquery()

        procs = db.session.query(Event).join(
            sub_proc,
            and_(Event.line == sub_proc.c.line, Event.timestamp == sub_proc.c.latest_ts)
        ).all()
        for p in procs:
            procs_map[p.line] = p

        result, processed_lines = [], set()
        for e in normals:
            line_num = int(e.line)
            if line_num in processed_lines:
                continue
            processed_lines.add(line_num)

            fault = faults_map.get(e.line)
            proc = procs_map.get(e.line)

            if fault and fault.req_time:
                area = get_area(line_num)
                index = (line_num if area == 'Assembly'
                         else line_num - 40 if area == 'Panel'
                         else line_num - 52 if area == 'Visor'
                         else line_num)
                display_name = f"{area} {index:02d}" if area in {'Assembly','Panel','Visor'} else f"Line {line_num:02d}"

                result.append({
                    "line": line_num,
                    "display_name": display_name,
                    "area": area,
                    "req_time": fault.req_time.isoformat(),
                    "start_time": proc.start_time.isoformat() if proc and proc.start_time else None,
                    "finish_time": e.finish_time.isoformat(),
                    "mttr": format_mttr(fault.req_time, e.finish_time)
                })
        return jsonify(result)
