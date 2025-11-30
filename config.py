import os

class Config:
    # --- DATABASE ---
    # Dùng đường dẫn tuyệt đối để tránh lỗi khi chạy service background
    BASE_DIR = os.path.abspath(os.path.dirname(__file__))
    SQLALCHEMY_DATABASE_URI = os.getenv('DB_URI', f'sqlite:///{os.path.join(BASE_DIR, "events.db")}')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # Tối ưu cho SQLite/PostgreSQL trong môi trường công nghiệp
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,  # Tự động kiểm tra kết nối sống trước khi query
        "pool_recycle": 300,    # Tái tạo kết nối mỗi 5 phút
    }

    # --- SECURITY ---
    SECRET_KEY = os.getenv('SECRET_KEY', 'Hwaseung_Secret_Key_2025') # Cần thiết cho Session

    # --- MQTT ---
    MQTT_ENABLED = bool(int(os.getenv('MQTT_ENABLED', '1')))
    MQTT_BROKER = os.getenv('MQTT_BROKER', '127.0.0.1')
    MQTT_PORT = int(os.getenv('MQTT_PORT', '1883'))
    MQTT_KEEPALIVE = int(os.getenv('MQTT_KEEPALIVE', '60'))
    MQTT_TOPIC_PREFIX = os.getenv('MQTT_TOPIC_PREFIX', 'factory')
    
    # QoS 1: At least once (Đảm bảo tin nhắn đến ít nhất 1 lần - Quan trọng cho công nghiệp)
    MQTT_QOS = 1 

    # --- SERVER ---
    SERVER_HOST = os.getenv('SERVER_HOST', '0.0.0.0')
    SERVER_PORT = int(os.getenv('SERVER_PORT', '5050'))
    
    # --- LOGGING ---
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')