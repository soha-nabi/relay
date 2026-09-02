from backend.db import mongo_adapter


class EmailLogRepository:
    """Repository for email_logs collection."""

    def __init__(self, adapter=None):
        self.adapter = adapter or mongo_adapter

    @property
    def collection(self):
        db = self.adapter.db
        if db is not None:
            return db["email_logs"]
        return None

    def create_log(self, entry: dict):
        coll = self.collection
        if coll is None:
            return None
        # Ensure required fields and timestamp
        entry = entry.copy()
        entry.setdefault("timestamp", __import__("datetime").datetime.utcnow().isoformat())
        try:
            coll.insert_one(entry)
            return entry
        except Exception:
            return None
