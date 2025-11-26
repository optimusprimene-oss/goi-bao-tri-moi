# app_optimized.py
from flask import Flask, render_template, jsonify
from flask_socketio import SocketIO
from models import db, Event
from config import Config
from mqtt_client_optimized import MQTTHandler
from datetime import datetime, timezone
import threading, random, time, os

# ===================== INIT APP =====================
app = Flask(__name__)
app.config.from_object(Config)

# Database
db.init_app(app)

# SocketIO
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

# MQTT Handler
mqtt_handler = MQTTHandler(
    broker=Config.MQTT_BROKER,
    port=Config.MQTT_PORT,
    keepalive=Config.MQTT_KEEPALIVE,
    socketio=socketio,
    app=app
)
mqtt_handler.connect()

# ===================== SAMPLE EMITTER =====================
ENABLE_SAMPLE = os.getenv('ENABLE_SAMPLE_EMITTER', 'false').lower() in ('1','true','yes')

def emit_sample_data():
    with app.app_context():
        while True:
            time.sleep(5)
            line = random.randint(1, 57)
            status = random.choice(['normal', 'processing', 'fault'])
            latest = Event.query.filter_by(line=str(line)).order_by(Event.id.desc()).first()

            req_time = None
            start_time = None
            now = datetime.now(timezone.utc)

            if status == 'fault':
                req_time = now if not latest or latest.type != 'fault' else latest.req_time
            elif status == 'processing':
                req_time = latest.req_time if latest else None
                start_time = now if not latest or latest.type != 'processing' else latest.start_time
            else:
                if latest:
                    req_time = latest.req_time
                    start_time = latest.start_time

            event = Event(
                line=str(line),
                type=status,
                timestamp=now,
                req_time=req_time,
                start_time=start_time
            )
            db.session.add(event)
            db.session.commit()

            socketio.emit('line_update', {
                'line': line,
                'status': status,
                'req_time': req_time.strftime('%H:%M:%S') if req_time else None,
                'start_time': start_time.strftime('%H:%M:%S') if start_time else None
            })

if ENABLE_SAMPLE:
    threading.Thread(target=emit_sample_data, daemon=True).start()
else:
    print("Sample emitter is disabled. Set ENABLE_SAMPLE_EMITTER=1 to enable.")

# ===================== INIT DATABASE =====================
with app.app_context():
    db.create_all()
    if Event.query.count() == 0:
        for i in range(1, 58):
            e = Event(line=str(i), type='normal', timestamp=datetime.now(timezone.utc))
            db.session.add(e)
        db.session.commit()

# ===================== API ROUTES =====================
@app.route('/api/lines')
def get_lines():
    with app.app_context():
        events = Event.query.order_by(Event.id.desc()).limit(57).all()
        latest = {}
        for e in events:
            if e.line not in latest:
                latest[e.line] = e

        result = []
        counters = {'Assembly': 0, 'Panel': 0, 'Visor': 0}
        for line in range(1, 58):
            area = 'Assembly' if line <= 40 else 'Panel' if line <= 52 else 'Visor'
            counters[area] += 1
            e = latest.get(str(line))
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

@app.route('/api/events')
def get_events():
    with app.app_context():
        events = Event.query.order_by(Event.id.desc()).limit(500).all()
        return jsonify([{
            'id': e.id,
            'line': e.line,
            'type': e.type,
            'timestamp': e.timestamp.strftime('%Y-%m-%d %H:%M:%S'),
            'req_time': e.req_time.strftime('%Y-%m-%d %H:%M:%S') if e.req_time else None,
            'start_time': e.start_time.strftime('%Y-%m-%d %H:%M:%S') if e.start_time else None
        } for e in events])

# ===================== DASHBOARD ROUTES =====================
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/statistics')
def statistics():
    return render_template('statistics.html')

@app.route('/history')
def history():
    return render_template('history.html')

# ===================== SOCKET EVENTS =====================
from socket_events import register_socket_events
register_socket_events(socketio, mqtt_handler)

# ===================== RUN SERVER =====================
if __name__ == '__main__':
    print(f"Server running at http://{Config.SERVER_HOST}:{Config.SERVER_PORT}")
    socketio.run(app, host=Config.SERVER_HOST, port=Config.SERVER_PORT, debug=True)
