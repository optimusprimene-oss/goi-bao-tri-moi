from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timezone

db = SQLAlchemy()

class Event(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    line = db.Column(db.String(32), nullable=False)
    type = db.Column(db.String(32), nullable=False)  # fault / processing / done
    
    # THÊM CỘT MỚI CHO LOẠI LỖI (FAULT_TYPE)
    description = db.Column(db.String(128), nullable=True) 
    
    req_time = db.Column(db.DateTime(timezone=True), nullable=True)
    start_time = db.Column(db.DateTime(timezone=True), nullable=True)
    finish_time = db.Column(db.DateTime(timezone=True), nullable=True)
    mttr = db.Column(db.String(64), nullable=True)
    timestamp = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'line': self.line,
            'type': self.type,
            'description': self.description, # Thêm cột mới vào dictionary
            'req_time': self.req_time.isoformat() if self.req_time else None,
            'start_time': self.start_time.isoformat() if self.start_time else None,
            'finish_time': self.finish_time.isoformat() if self.finish_time else None,
            'mttr': self.mttr,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None
        }