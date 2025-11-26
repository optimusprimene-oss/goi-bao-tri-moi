# config.py
import os

class Config:
    # Database
    SQLALCHEMY_DATABASE_URI = os.getenv('DB_URI', 'sqlite:///events.db')
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # MQTT
    MQTT_ENABLED = bool(int(os.getenv('MQTT_ENABLED', '0')))  # 1 để bật khi có broker
    MQTT_BROKER = os.getenv('MQTT_BROKER', 'localhost')
    MQTT_PORT = int(os.getenv('MQTT_PORT', '1883'))
    MQTT_KEEPALIVE = int(os.getenv('MQTT_KEEPALIVE', '60'))
    MQTT_TOPIC_PREFIX = os.getenv('MQTT_TOPIC_PREFIX', 'andon')

    # Server
    SERVER_HOST = os.getenv('SERVER_HOST', '0.0.0.0')
    SERVER_PORT = int(os.getenv('SERVER_PORT', '5050'))

    # Simulation
    ENABLE_SIMULATION = bool(int(os.getenv('ENABLE_SIMULATION', '1')))
    FAST_MODE = bool(int(os.getenv('FAST_MODE', '1')))
    MAX_PARALLEL_FAULTS = int(os.getenv('MAX_PARALLEL_FAULTS', '7'))

    # Auto reset (dự phòng)
    AUTO_RESET_TIMEOUT = int(os.getenv('AUTO_RESET_TIMEOUT', '600'))

    # Logging
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')
