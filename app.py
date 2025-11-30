import eventlet
eventlet.monkey_patch()

import logging
from flask import Flask
from flask_socketio import SocketIO

from config import Config
from models import db
from routes import register_routes
from socket_events import register_socket_events
from mqtt_client_optimized import MqttClientOptimized
from services import FactoryService # Import Service mới

# --- SETUP ---
logging.basicConfig(level=getattr(logging, Config.LOG_LEVEL), 
                    format="%(asctime)s [%(levelname)s] %(message)s")

app = Flask(__name__, static_folder='static', template_folder='templates')
app.config.from_object(Config)

db.init_app(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

# Khởi tạo các module
register_routes(app)

mqtt_client = MqttClientOptimized(
    Config.MQTT_BROKER, Config.MQTT_PORT, Config.MQTT_KEEPALIVE,
    Config.MQTT_ENABLED, prefix=Config.MQTT_TOPIC_PREFIX, qos=Config.MQTT_QOS
)

# Khởi tạo Service logic
factory_service = FactoryService(socketio, mqtt_client)

# Đăng ký Callback MQTT để gọi vào Service
# Lưu ý: Cần truyền app.app_context để Service có thể truy cập DB
def mqtt_callback_wrapper(topic, payload):
    factory_service.handle_mqtt_message(app.app_context, topic, payload)

mqtt_client.set_callback(mqtt_callback_wrapper)
register_socket_events(socketio, mqtt_client)

if __name__ == "__main__":
    with app.app_context():
        db.create_all()
        # Nếu muốn seed dữ liệu thì thêm ở đây
        
    print(f"\n>>> INDUSTRIAL IOT SERVER STARTED ON PORT {Config.SERVER_PORT} <<<\n")
    socketio.run(app, 
                 host=Config.SERVER_HOST, 
                 port=Config.SERVER_PORT, 
                 debug=False)