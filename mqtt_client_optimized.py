import logging
import json
import time

try:
    import paho.mqtt.client as mqtt
except ImportError:
    mqtt = None

class MqttClientOptimized:
    def __init__(self, broker: str, port: int, keepalive: int, enabled: bool, prefix: str = "factory", qos: int = 1):
        self.enabled = enabled and mqtt is not None
        self.prefix = prefix
        self.qos = qos
        self.client = None
        self.message_callback = None 

        if self.enabled:
            # Protocol V5 là chuẩn mới, nhưng V3.1.1 ổn định hơn cho ESP32 cũ
            self.client = mqtt.Client(protocol=mqtt.MQTTv311) 
            self.client.on_connect = self.on_connect
            self.client.on_disconnect = self.on_disconnect
            self.client.on_message = self.on_message
            
            try:
                self.client.connect(broker, port, keepalive)
                self.client.loop_start() # Chạy thread nền
                logging.info(f"[MQTT] Service started at {broker}:{port}")
            except Exception as e:
                logging.error(f"[MQTT] Init failed: {e}")
                self.enabled = False

    def set_callback(self, callback_func):
        self.message_callback = callback_func

    def on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            logging.info("[MQTT] Connected successfully")
            topics = [(f"{self.prefix}/register", self.qos), (f"{self.prefix}/event", self.qos)]
            client.subscribe(topics)
            logging.info(f"[MQTT] Subscribed: {topics}")
        else:
            logging.error(f"[MQTT] Connection failed. RC: {rc}")

    def on_disconnect(self, client, userdata, rc):
        if rc != 0:
            logging.warning(f"[MQTT] Unexpected disconnection. Reconnecting...")

    def on_message(self, client, userdata, msg):
        try:
            payload = msg.payload.decode('utf-8')
            if self.message_callback:
                self.message_callback(msg.topic, payload)
        except Exception as e:
            logging.error(f"[MQTT] Message error: {e}")

    def publish(self, topic: str, payload: str):
        if not self.enabled or not self.client: return

        full_topic = topic if topic.startswith(self.prefix) else f"{self.prefix}/{topic}"
        try:
            info = self.client.publish(full_topic, payload, qos=self.qos)
            info.wait_for_publish(timeout=2.0) # Đợi xác nhận gửi thành công (quan trọng)
        except Exception as e:
            logging.error(f"[MQTT] Publish failed: {e}")

    def publish_command(self, mac_address: str, command: str):
        # cmd topic: factory/cmd/MAC_ADDRESS
        self.publish(f"cmd/{mac_address}", command)