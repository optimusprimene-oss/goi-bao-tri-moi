# mqtt_client_optimized.py
import logging

try:
    import paho.mqtt.client as mqtt
except ImportError:
    mqtt = None

class MqttClientOptimized:
    def __init__(self, broker: str, port: int, keepalive: int, enabled: bool, prefix: str = "andon"):
        self.enabled = enabled and mqtt is not None
        self.prefix = prefix
        self.client = None
        if self.enabled:
            self.client = mqtt.Client()
            self.client.on_connect = self.on_connect
            self.client.on_disconnect = self.on_disconnect
            try:
                self.client.connect(broker, port, keepalive)
                self.client.loop_start()
                logging.info(f"[MQTT] Connected to {broker}:{port}")
            except Exception as e:
                logging.error(f"[MQTT] Connect failed: {e}")
                self.enabled = False
        else:
            logging.warning("[MQTT] Disabled or paho-mqtt not installed. Using print-only mode.")

    def on_connect(self, client, userdata, flags, rc):
        logging.info(f"[MQTT] on_connect rc={rc}")

    def on_disconnect(self, client, userdata, rc):
        logging.warning(f"[MQTT] on_disconnect rc={rc}")

    def publish(self, topic: str, payload: str, qos: int = 0, retain: bool = False):
        full_topic = f"{self.prefix}/{topic}".strip("/")
        if self.enabled and self.client:
            try:
                self.client.publish(full_topic, payload, qos=qos, retain=retain)
            except Exception as e:
                logging.error(f"[MQTT] Publish failed: {e} ({full_topic}={payload})")
        else:
            print(f"[MQTT] {full_topic} <= {payload}")

    def publish_led_off(self, line_code: str):
        self.publish(f"led/{line_code}", "OFF")

    def publish_led_on(self, line_code: str):
        self.publish(f"led/{line_code}", "ON")

    def publish_alarm(self, line_code: str):
        self.publish(f"alarm/{line_code}", "RING")
