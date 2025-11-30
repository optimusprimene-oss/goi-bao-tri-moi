import logging
import json
import pytz
from datetime import datetime
from models import db, Event, Device

logger = logging.getLogger(__name__)
VN_TIMEZONE = pytz.timezone('Asia/Ho_Chi_Minh')

# --- HELPERS ---
def get_display_time(dt):
    if not dt: return None
    # Chuyển về múi giờ VN để hiển thị
    return dt.astimezone(VN_TIMEZONE).strftime('%H:%M:%S')

def calculate_mttr(req_time, finish_time):
    if not req_time or not finish_time: return "-"
    secs = int((finish_time - req_time).total_seconds())
    h, r = divmod(secs, 3600)
    m, s = divmod(r, 60)
    if h: return f"{h}h{m:02d}m"
    return f"{m}m{s:02d}s"

# --- CORE LOGIC ---
class FactoryService:
    def __init__(self, socketio, mqtt_client):
        self.socketio = socketio
        self.mqtt = mqtt_client

    def handle_mqtt_message(self, app_context, topic, payload):
        """Xử lý tin nhắn MQTT trong App Context"""
        with app_context():
            try:
                data = json.loads(payload)
                mac = data.get('mac')
                if not mac: return

                if 'register' in topic:
                    self._handle_register(mac)
                elif 'event' in topic:
                    self._handle_event(mac, data)
            except Exception as e:
                logger.error(f"[Service] MQTT Error: {e}")
                db.session.rollback()

    def _handle_register(self, mac):
        device = Device.query.filter_by(mac_address=mac).first()
        if not device:
            # Auto-provisioning: Tự động thêm thiết bị mới
            new_dev = Device(mac_address=mac, status='online', last_seen=datetime.now())
            db.session.add(new_dev)
            logger.info(f"✨ New Device: {mac}")
        else:
            device.status = 'online'
            device.last_seen = datetime.now()
        db.session.commit()

    def _handle_event(self, mac, data):
        event_type = data.get('type')
        desc = data.get('description', '')
        
        device = Device.query.filter_by(mac_address=mac).first()
        if not device or not device.line_id:
            logger.warning(f"⚠️ Event from Unassigned Device: {mac}")
            return

        line_id = device.line_id
        area = device.area or "Unknown"
        now = datetime.now()

        # Logic xử lý từng loại sự kiện
        if event_type == 'fault':
            self._process_fault(mac, line_id, area, desc, now)
        elif event_type == 'processing':
            self._process_processing(mac, line_id, area, now)
        elif event_type == 'done':
            self._process_done(mac, line_id, area, now)

    def _process_fault(self, mac, line, area, desc, now):
        event = Event(line=str(line), type='fault', description=desc, req_time=now, timestamp=now)
        db.session.add(event)
        db.session.commit()
        
        self.mqtt.publish_command(mac, "FAULT")
        self._broadcast_update(line, 'fault', area, mac, req_time=now, desc=desc)
        logger.info(f"🔴 Line {line}: FAULT")

    def _process_processing(self, mac, line, area, now):
        # Lấy sự kiện lỗi gần nhất chưa xong
        last_fault = Event.query.filter_by(line=str(line), type='fault').order_by(Event.id.desc()).first()
        req_time = last_fault.req_time if last_fault else now

        event = Event(line=str(line), type='processing', req_time=req_time, start_time=now, timestamp=now)
        db.session.add(event)
        db.session.commit()

        self.mqtt.publish_command(mac, "PROCESSING")
        self._broadcast_update(line, 'processing', area, mac, req_time=req_time, start_time=now)
        logger.info(f"🟡 Line {line}: PROCESSING")

    def _process_done(self, mac, line, area, now):
        # Lấy thông tin các bước trước
        last_fault = Event.query.filter_by(line=str(line), type='fault').order_by(Event.id.desc()).first()
        req_time = last_fault.req_time if last_fault else now
        
        last_proc = Event.query.filter_by(line=str(line), type='processing').order_by(Event.id.desc()).first()
        start_time = last_proc.start_time if last_proc else req_time

        mttr = calculate_mttr(req_time, now)

        event = Event(line=str(line), type='done', req_time=req_time, start_time=start_time, finish_time=now, mttr=mttr, timestamp=now)
        db.session.add(event)
        db.session.commit()

        self.mqtt.publish_command(mac, "NORMAL")
        self._broadcast_update(line, 'normal', area, mac, finish_time=now, mttr=mttr)
        logger.info(f"🟢 Line {line}: DONE (MTTR: {mttr})")

    def _broadcast_update(self, line, status, area, mac, **kwargs):
        payload = {
            'line': line, 'status': status, 'area': area, 'device_mac': mac
        }
        # Format thời gian trước khi gửi socket
        if 'req_time' in kwargs: payload['req_time'] = get_display_time(kwargs['req_time'])
        if 'start_time' in kwargs: payload['start_time'] = get_display_time(kwargs['start_time'])
        if 'finish_time' in kwargs: payload['finish_time'] = get_display_time(kwargs['finish_time'])
        if 'mttr' in kwargs: payload['mttr'] = kwargs['mttr']
        if 'desc' in kwargs: payload['description'] = kwargs['desc']

        self.socketio.emit('line_update', payload)