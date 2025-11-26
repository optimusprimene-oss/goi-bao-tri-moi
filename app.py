# app.py
import eventlet
eventlet.monkey_patch()

import logging
import random
from datetime import datetime, timezone, timedelta
from flask import Flask, jsonify
from flask_socketio import SocketIO

from config import Config
from models import db, Event
from routes import register_routes
from socket_events import register_socket_events
from mqtt_client_optimized import MqttClientOptimized

logging.basicConfig(
    level=getattr(logging, Config.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(message)s"
)

app = Flask(__name__, static_folder='static', template_folder='templates')
app.config.from_object(Config)

db.init_app(app)

socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode='eventlet',
    ping_timeout=180,
    ping_interval=30
)

logging.getLogger('socketio').setLevel(logging.ERROR)
logging.getLogger('engineio').setLevel(logging.ERROR)

register_routes(app)

mqtt_client = MqttClientOptimized(
    Config.MQTT_BROKER,
    Config.MQTT_PORT,
    Config.MQTT_KEEPALIVE,
    Config.MQTT_ENABLED,
    prefix=Config.MQTT_TOPIC_PREFIX
)
register_socket_events(socketio, mqtt_client)

# Server time route (avoid 404)
@app.route('/api/server_time')
def api_server_time():
    now = datetime.now(timezone.utc).astimezone()
    return jsonify({'time': now.strftime('%H:%M:%S')})

# Utilities
active_repairs = {}  # {line_number: {req_time, start_time, area, display_name}}

def get_line_info(n: int):
    if 1 <= n <= 40: return 'Assembly', f"Assembly {n:02d}"
    if 41 <= n <= 52: return 'Panel', f"Panel {n-40:02d}"
    if 53 <= n <= 57: return 'Visor', f"Visor {n-52:02d}"
    return 'Unknown', f"Line {n:02d}"

def jitter_now(max_seconds=3):
    return datetime.now(timezone.utc) + timedelta(seconds=random.randint(0, max_seconds))

def format_mttr(req, finish):
    if not req or not finish: return "-"
    secs = int((finish - req).total_seconds())
    if secs < 0: secs = 0
    h, r = divmod(secs, 3600)
    m, s = divmod(r, 60)
    if h: return f"{h}h{m:02d}m"
    return f"{m}m{s:02d}s"

def get_sleep_ranges():
    if Config.FAST_MODE:
        return (5, 15), (2, 6), (6, 20)
    return (180, 480), (30, 180), (180, 720)

# Simulation (emit đầy đủ trường thời gian; type rõ ràng: fault/processing/done)
def simulation():
    logging.info("[SIM] Bắt đầu mô phỏng")
    fault_interval, arrival_range, repair_range = get_sleep_ranges()

    while True:
        socketio.sleep(random.uniform(*fault_interval))

        with app.app_context():
            try:
                if len(active_repairs) >= Config.MAX_PARALLEL_FAULTS:
                    socketio.sleep(2 if Config.FAST_MODE else 20)
                    continue

                busy_lines = set(active_repairs.keys())
                free_lines = [i for i in range(1, 58) if i not in busy_lines]
                if not free_lines:
                    continue

                line = random.choice(free_lines)
                req_time = jitter_now(2)
                area, display_name = get_line_info(line)

                # Fault event (with req_time)
                db.session.add(Event(line=str(line), type='fault', req_time=req_time, timestamp=req_time))
                db.session.commit()
                active_repairs[line] = {'req_time': req_time, 'display_name': display_name, 'area': area}
                logging.info(f"[SIM] Fault tại {display_name} ({area}) @ {req_time.isoformat()}")

                socketio.emit('line_update', {
                    'line': line,
                    'display_name': display_name,
                    'area': area,
                    'status': 'fault',
                    'req_time': req_time.isoformat()
                })

                # Processing (employee arrives) — send req_time + start_time
                socketio.sleep(random.uniform(*arrival_range))
                start_time = jitter_now(2)
                active_repairs[line]['start_time'] = start_time
                db.session.add(Event(line=str(line), type='processing', req_time=req_time, start_time=start_time, timestamp=start_time))
                db.session.commit()

                logging.info(f"[SIM] Processing {display_name} @ {start_time.isoformat()}")
                socketio.emit('line_update', {
                    'line': line,
                    'display_name': display_name,
                    'area': area,
                    'status': 'processing',
                    'req_time': req_time.isoformat(),
                    'start_time': start_time.isoformat()
                })

                # Done (repair finished)
                socketio.sleep(random.uniform(*repair_range))
                finish_time = jitter_now(2)
                mttr = format_mttr(req_time, finish_time)
                db.session.add(Event(line=str(line), type='done', req_time=req_time, start_time=start_time, finish_time=finish_time, mttr=mttr, timestamp=finish_time))
                db.session.commit()

                logging.info(f"[SIM] Done {display_name} @ {finish_time.isoformat()} | MTTR={mttr}")
                socketio.emit('line_update', {
                    'line': line,
                    'display_name': display_name,
                    'area': area,
                    'status': 'done',
                    'req_time': req_time.isoformat(),
                    'start_time': start_time.isoformat(),
                    'finish_time': finish_time.isoformat(),
                    'mttr': mttr
                })

                active_repairs.pop(line, None)

            except Exception as e:
                logging.exception(f"[SIM] Lỗi mô phỏng: {e}")
                try:
                    db.session.rollback()
                except Exception:
                    pass
                socketio.sleep(2)

# DB init
with app.app_context():
    db.create_all()
    if Event.query.count() == 0:
        now = datetime.now(timezone.utc)
        for i in range(1, 58):
            db.session.add(Event(line=str(i), type='done', timestamp=now))
        db.session.commit()
        logging.info("[DB] Seed dữ liệu ban đầu hoàn tất")

if __name__ == "__main__":
    print("\nStarting server\n")

    # Start simulation nếu bật
    if getattr(Config, 'ENABLE_SIMULATION', False):
        socketio.start_background_task(simulation)

    # fallback an toàn cho flag debug (nếu Config không có DEBUG)
    debug_mode = getattr(Config, 'DEBUG', False)

    # chạy server với fallback debug
    socketio.run(app, host=Config.SERVER_HOST, port=Config.SERVER_PORT, debug=debug_mode)

