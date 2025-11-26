# mqtt_client.py
import paho.mqtt.client as mqtt
import json
import time
from threading import Timer
from models import db, Event

class MQTTHandler:
    def __init__(self, broker, port, keepalive, socketio):
        self.broker = broker
        self.port = port
        self.keepalive = keepalive
        self.socketio = socketio
        self.client = mqtt.Client()
        self.timers = {}
        self.setup_callbacks()

    def setup_callbacks(self):
        self.client.on_connect = self.on_connect
        self.client.on_message = self.on_message
        self.client.on_disconnect = self.on_disconnect

    def on_connect(self, client, userdata, flags, rc):
        print("Connected to MQTT Broker")
        client.subscribe("factory/line/+/event")

    def on_message(self, client, userdata, msg):
        try:
            line = msg.topic.split("/")[2]
            data = json.loads(msg.payload.decode())
            event_type = data.get("type", "unknown")
            ts = time.strftime("%H:%M:%S")

            # Lưu DB
            event = Event(line=line, type=event_type, time=ts)
            db.session.add(event)
            db.session.commit()

            # Gửi realtime
            self.socketio.emit("line_update", {"line": line, "type": event_type, "time": ts})

            # Auto-reset nếu cần
            if event_type == "emergency":
                self.start_auto_reset(line)

        except Exception as e:
            print(f"MQTT error: {e}")

    def on_disconnect(self, client, userdata, rc):
        print("MQTT mất kết nối → Tự động kết nối lại...")
        while True:
            try:
                client.reconnect()
                break
            except:
                time.sleep(5)

    def start_auto_reset(self, line):
        if line in self.timers:
            self.timers[line].cancel()
        timer = Timer(600, self.auto_reset, [line])
        timer.start()
        self.timers[line] = timer

    def auto_reset(self, line):
        self.publish_led_off(line)
        self.save_event(line, "auto_reset")
        self.socketio.emit("line_ack", {"line": line, "type": "auto_reset"})
        self.timers.pop(line, None)

    def save_event(self, line, event_type):
        event = Event(line=line, type=event_type, time=time.strftime("%H:%M:%S"))
        db.session.add(event)
        db.session.commit()

    def publish_led_off(self, line):
        self.client.publish(f"factory/line/{line}/led", json.dumps({"action": "off"}))

    def connect(self):
        self.client.connect(self.broker, self.port, self.keepalive)
        self.client.loop_start()