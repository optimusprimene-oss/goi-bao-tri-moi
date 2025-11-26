# socket_events.py
import logging
from flask_socketio import emit
from flask import current_app
from models import db, Event
from datetime import datetime, timezone

def register_socket_events(socketio, mqtt_client):
    @socketio.on("ack_line")
    def ack_line(data):
        try:
            line = data.get("line")
            if line is None:
                emit("line_ack_error", {"error": "Thiếu dữ liệu line"}, broadcast=True)
                return

            line_str = str(line).strip()
            if not line_str.isdigit():
                emit("line_ack_error", {"error": f"Line không phải số: {line_str}"}, broadcast=True)
                return

            line_num = int(line_str)
            if not (1 <= line_num <= 57):
                emit("line_ack_error", {"error": f"Line ngoài phạm vi: {line_num}"}, broadcast=True)
                return

            line_padded = str(line_num).zfill(2)
            now = datetime.now(timezone.utc)
            logging.info(f"[ACK] Nhận ACK từ line {line_num}")

            # 1) Tắt LED qua MQTT (nếu có)
            try:
                if mqtt_client:
                    mqtt_client.publish_led_off(line_padded)
            except Exception as mqtt_err:
                logging.error(f"[MQTT] Lỗi khi tắt LED line {line_num}: {mqtt_err}")

            # 2) Lưu DB
            with current_app.app_context():
                event = Event(line=str(line_num), type='ack', timestamp=now)
                db.session.add(event)
                try:
                    db.session.commit()
                except Exception as db_err:
                    db.session.rollback()
                    logging.error(f"[DB] Lỗi commit ACK line {line_num}: {db_err}")
                    emit("line_ack_error", {"line": line_num, "error": "DB commit failed"}, broadcast=True)
                    return

            # 3) Broadcast đến các client
            emit("line_ack", {"line": line_num, "timestamp": now.isoformat()}, broadcast=True)

        except Exception as e:
            logging.exception(f"[ACK] Lỗi xử lý ACK line: {e}")
            emit("line_ack_error", {
                "line": line_num if 'line_num' in locals() else None,
                "error": str(e)
            }, broadcast=True)
