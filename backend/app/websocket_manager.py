from typing import List
from fastapi import WebSocket
from sqlalchemy.orm import Session
from app import crud

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        print(f"[WebSocket] Connected client. Total active: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            print(f"[WebSocket] Disconnected client. Total active: {len(self.active_connections)}")

    async def broadcast_campaign_stats(self, campaign_id: int, db: Session):
        if not self.active_connections:
            return

        # Fetch updated stats
        stats = crud.get_campaign_stats(db, campaign_id)
        stats_a = crud.get_campaign_variant_stats(db, campaign_id, "A")
        stats_b = crud.get_campaign_variant_stats(db, campaign_id, "B")
        
        payload = {
            "type": "stats_update",
            "campaign_id": campaign_id,
            "stats": stats.dict(),
            "stats_a": stats_a.dict(),
            "stats_b": stats_b.dict()
        }
        
        print(f"[WebSocket] Broadcasting campaign {campaign_id} stats update to {len(self.active_connections)} clients")
        for connection in self.active_connections:
            try:
                await connection.send_json(payload)
            except Exception as e:
                # Connection might have died
                print(f"[WebSocket] Error broadcasting to connection: {e}")

manager = ConnectionManager()
