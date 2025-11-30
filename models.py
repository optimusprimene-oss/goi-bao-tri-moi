from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timezone

db = SQLAlchemy()

class Event(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    line = db.Column(db.String(32), nullable=False, index=True) # Index để tìm kiếm nhanh hơn
    type = db.Column(db.String(32), nullable=False) 
    description = db.Column(db.String(128), nullable=True) 
    
    req_time = db.Column(db.DateTime(timezone=True))
    start_time = db.Column(db.DateTime(timezone=True))
    finish_time = db.Column(db.DateTime(timezone=True))
    mttr = db.Column(db.String(64))
    timestamp = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)

    def to_dict(self):
        return {
            'id': self.id,
            'line': self.line,
            'type': self.type,
            'description': self.description,
            'req_time': self.req_time.isoformat() if self.req_time else None,
            'start_time': self.start_time.isoformat() if self.start_time else None,
            'finish_time': self.finish_time.isoformat() if self.finish_time else None,
            'mttr': self.mttr,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None
        }

class Device(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    mac_address = db.Column(db.String(50), unique=True, nullable=False, index=True)
    line_id = db.Column(db.String(50), nullable=True, index=True)
    area = db.Column(db.String(100), nullable=True)
    status = db.Column(db.String(20), default='offline')
    last_seen = db.Column(db.DateTime, default=datetime.now) 

    def to_dict(self):
        return {
            'mac': self.mac_address,
            'line': self.line_id,
            'area': self.area,
            'status': self.status,
            'last_seen': self.last_seen.isoformat() if self.last_seen else None
        }