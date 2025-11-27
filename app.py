import eventlet
# Sử dụng monkey_patching để eventlet có thể quản lý I/O non-blocking
eventlet.monkey_patch()

import logging
import random
from datetime import datetime, timezone, timedelta
from flask import Flask, jsonify, render_template 
from flask_socketio import SocketIO
from sqlalchemy.exc import OperationalError 

# Các imports cần thiết (Đảm bảo các file này tồn tại và đúng)
from config import Config
from models import db, Event 
from routes import register_routes 
from socket_events import register_socket_events 
from mqtt_client_optimized import MqttClientOptimized 

# --- CẤU HÌNH LOGGING ---
logging.basicConfig(
    level=getattr(logging, Config.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt='%H:%M:%S'
)
logger = logging.getLogger(__name__)

# --- KHỞI TẠO ỨNG DỤNG VÀ THƯ VIỆN ---
app = Flask(__name__, static_folder='static', template_folder='templates')
app.config.from_object(Config)

# Cấu hình lại SQLALCHEMY cho khả năng chịu tải tốt hơn (Đặc biệt với SQLite)
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
    "pool_pre_ping": True,
    "pool_recycle": 300, 
}

db.init_app(app)

socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode='eventlet',
    ping_timeout=60, 
    ping_interval=25,
    logger=False, 
    engineio_logger=False
)

# Tắt bớt log rác
logging.getLogger('werkzeug').setLevel(logging.ERROR)

register_routes(app)

# Khởi tạo MQTT
mqtt_client = MqttClientOptimized(
    Config.MQTT_BROKER,
    Config.MQTT_PORT,
    Config.MQTT_KEEPALIVE,
    Config.MQTT_ENABLED,
    prefix=Config.MQTT_TOPIC_PREFIX
)
register_socket_events(socketio, mqtt_client)


# --- GLOBAL STATE & UTILS ---
active_repairs = {} 

# Danh sách các loại lỗi ngẫu nhiên để mô phỏng dữ liệu phong phú hơn
FAULT_TYPES = [
    'material_shortage', 'machine_breakdown', 'quality_issue', 
    'tooling_issue', 'sensor_fault', 'software_error'
]

def get_line_info(n: int):
    """Lấy tên khu vực và tên hiển thị dựa trên số line."""
    if 1 <= n <= 40: return 'Assembly', f"Assembly {n:02d}"
    if 41 <= n <= 52: return 'Panel', f"Panel {n-40:02d}"
    if 53 <= n <= 57: return 'Visor', f"Visor {n-52:02d}"
    return 'Unknown', f"Line {n:02d}"

def jitter_now(max_seconds=3):
    """Tạo thời gian hiện tại với độ trễ ngẫu nhiên nhỏ."""
    return datetime.now() + timedelta(seconds=random.randint(0, max_seconds))

def format_mttr(req, finish):
    """Định dạng thời gian sửa chữa trung bình (MTTR) thành chuỗi."""
    if not req or not finish: return "-"
    secs = int((finish - req).total_seconds())
    if secs < 0: secs = 0
    h, r = divmod(secs, 3600)
    m, s = divmod(r, 60)
    if h: return f"{h}h{m:02d}m"
    return f"{m}m{s:02d}s"

def get_sleep_ranges():
    """Định nghĩa các khoảng thời gian chờ cho mô phỏng (dựa trên FAST_MODE)."""
    if getattr(Config, 'FAST_MODE', False):
        # (Giữa các lỗi), (Chờ thợ đến), (Sửa chữa)
        return (5, 15), (2, 6), (6, 20) 
    return (180, 480), (30, 180), (180, 720)


# --- HELPER: DATABASE SAFE COMMIT (QUAN TRỌNG) ---
def safe_commit():
    """Cơ chế thử lại khi Database bị khóa (Giải quyết vấn đề SQLite/Concurrency)."""
    MAX_RETRIES = 3
    for i in range(MAX_RETRIES):
        try:
            db.session.commit()
            return True
        except OperationalError as e:
            db.session.rollback()
            if "locked" in str(e).lower():
                logger.warning(f"DB locked. Retrying in {0.5 * (i + 1)}s...")
                socketio.sleep(0.5 * (i + 1)) 
                continue
            else:
                logger.error(f"DB Error: {e}")
                return False
        except Exception as e:
            db.session.rollback()
            logger.error(f"Commit Failed: {e}")
            return False
    logger.error("Commit failed after max retries.")
    return False


# --- CORE SIMULATION (Mô phỏng lõi) ---

def run_line_lifecycle(line_id, req_data):
    """Mô phỏng vòng đời 1 sự cố: Lỗi -> Chờ -> Sửa -> Xong (Chạy trong luồng nền riêng)."""
    _, arrival_range, repair_range = get_sleep_ranges()
    req_time = req_data['req_time']
    area = req_data['area']
    display_name = req_data['display_name']
    fault_type = req_data['fault_type'] # Lấy loại lỗi
    
    with app.app_context():
        try:
            
            # --- 1. PROCESSING (Thợ đến/Bắt đầu xử lý) ---
            socketio.sleep(random.uniform(*arrival_range))
            start_time = jitter_now(2)
            
            db.session.add(Event(
                line=str(line_id), type='processing', req_time=req_time, 
                start_time=start_time, timestamp=start_time, description=fault_type
            ))
            if not safe_commit(): return

            active_repairs[line_id]['start_time'] = start_time
            
            logger.info(f"🟡 [SIM] Processing {display_name} ({fault_type}) @ {start_time.isoformat(timespec='seconds')}")
            socketio.emit('line_update', {
                'line': line_id, 'display_name': display_name, 'area': area,
                'status': 'processing', 'req_time': req_time.isoformat(), 
                'start_time': start_time.isoformat(), 'description': fault_type
            })

            # --- 2. DONE (Hoàn tất sửa chữa) ---
            socketio.sleep(random.uniform(*repair_range))
            finish_time = jitter_now(2)
            mttr = format_mttr(req_time, finish_time)
            
            db.session.add(Event(
                line=str(line_id), type='done', req_time=req_time, 
                start_time=start_time, finish_time=finish_time, 
                mttr=mttr, timestamp=finish_time, description=fault_type
            ))
            if not safe_commit(): return

            # Tắt đèn/báo động sau khi hoàn tất sửa chữa
            mqtt_client.publish_led_off(str(line_id).zfill(2))
            
            logger.info(f"🟢 [SIM] Done {display_name} | MTTR={mttr}")
            socketio.emit('line_update', {
                'line': line_id, 'display_name': display_name, 'area': area,
                'status': 'done', 'req_time': req_time.isoformat(), 
                'start_time': start_time.isoformat(), 'finish_time': finish_time.isoformat(), 
                'mttr': mttr, 'description': fault_type
            })

        except Exception as e:
            logger.exception(f"[SIM] Lỗi luồng line {line_id}: {e}")
            mqtt_client.publish_led_off(str(line_id).zfill(2)) # Đảm bảo tắt LED khi có lỗi
            db.session.rollback()
        finally:
            active_repairs.pop(line_id, None)


def simulation_manager():
    """Quản lý chung: Chọn máy để gây lỗi và khởi tạo luồng xử lý riêng cho từng sự cố."""
    fault_interval, _, _ = get_sleep_ranges()
    max_faults = getattr(Config, 'MAX_PARALLEL_FAULTS', 3)
    logger.info(">>> SIMULATION MANAGER STARTED <<<")
    socketio.sleep(5) 

    while True:
        # Thời gian nghỉ ngẫu nhiên giữa các lần tạo lỗi
        socketio.sleep(random.uniform(*fault_interval))

        with app.app_context():
            try:
                if len(active_repairs) >= max_faults:
                    socketio.sleep(2)
                    continue

                busy_lines = set(active_repairs.keys())
                free_lines = [i for i in range(1, 58) if i not in busy_lines]
                
                if not free_lines:
                    continue

                line = random.choice(free_lines)
                fault_type = random.choice(FAULT_TYPES) # CHỌN LOẠI LỖI
                req_time = jitter_now(2)
                area, display_name = get_line_info(line)

                # --- 0. FAULT (Phát sinh lỗi) ---
                db.session.add(Event(
                    line=str(line), type='fault', req_time=req_time, 
                    timestamp=req_time, description=fault_type # THÊM LOẠI LỖI VÀO DB
                ))
                if not safe_commit(): continue

                req_data = {'req_time': req_time, 'display_name': display_name, 'area': area, 'fault_type': fault_type}
                active_repairs[line] = req_data
                
                # KÍCH HOẠT HÀNH ĐỘNG MQTT (Bật đèn LED báo lỗi)
                line_padded = str(line).zfill(2)
                mqtt_client.publish_led_on(line_padded)
                
                logger.info(f"🔴 [SIM] Fault {fault_type} tại {display_name} @ {req_time.isoformat(timespec='seconds')}")
                socketio.emit('line_update', {
                    'line': line, 'display_name': display_name, 'area': area,
                    'status': 'fault', 'req_time': req_time.isoformat(), 'description': fault_type
                })
                
                # Khởi tạo luồng riêng (Green Thread) để xử lý vòng đời sửa chữa (Processing -> Done)
                socketio.start_background_task(run_line_lifecycle, line, req_data)

            except Exception as e:
                logger.exception(f"[SIM] Lỗi mô phỏng: {e}")
                db.session.rollback()
                socketio.sleep(2)

# --- KHỞI TẠO VÀ CHẠY CHÍNH ---

# DB init
with app.app_context():
    db.create_all()
    # Khởi tạo dữ liệu ban đầu cho tất cả các line ở trạng thái 'done' (bình thường)
    if Event.query.count() == 0:
        now = datetime.now(timezone.utc)
        for i in range(1, 58):
            db.session.add(Event(line=str(i), type='done', timestamp=now)) 
        safe_commit() 
        logging.info("[DB] Seed dữ liệu ban đầu hoàn tất")

# Server time route 
@app.route('/api/server_time')
def api_server_time():
    now = datetime.now() 
    return jsonify({'time': now.strftime('%H:%M:%S')})


if __name__ == "__main__":
    print("\nStarting server\n")

    # Start simulation: mặc định ENABLE_SIMULATION là True
    if getattr(Config, 'ENABLE_SIMULATION', True): 
        socketio.start_background_task(simulation_manager)

    debug_mode = getattr(Config, 'DEBUG', False)
    host = getattr(Config, 'SERVER_HOST', '0.0.0.0')
    port = getattr(Config, 'SERVER_PORT', 5050)
    
    socketio.run(app, host=host, port=port, debug=debug_mode)