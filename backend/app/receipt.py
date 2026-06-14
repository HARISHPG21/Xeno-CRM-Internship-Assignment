from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from datetime import datetime
from app.database import get_db
from app.models import Communication, Campaign, ReceiptEvent
from app.schemas import ReceiptPayload

router = APIRouter(prefix="/api")

# Weighting to handle duplicate/out-of-order callbacks safely
STATUS_WEIGHTS = {
    "queued": 0,
    "sent": 1,
    "failed": 2,
    "delivered": 3,
    "read": 4,
    "opened": 5,
    "clicked": 6,
    "converted": 7
}

# =====================================================================
# SCALE TRADEOFFS & ARCHITECTURAL MITIGATIONS FOR CAMPAIGN WEBHOOKS:
# 1. DATABASE CONTENTION (ROW LOCKS):
#    We use `with_for_update()` to block concurrent counter increments on the Campaign table. 
#    At scale (e.g., 10k+ concurrent callbacks/sec), this creates severe DB lock contention.
#    Mitigation: Decouple webhook ingestion from DB persistence. Push receipts to a broker (e.g., Kafka)
#    and batch-update counts, or use Redis atomic counters (INCR) with periodic sync to SQLite/PG.
#
# 2. DEDUPLICATION (IDEMPOTENCY LOG GROWTH):
#    We write every event to the `receipt_events` table for exact-once delivery guarantees.
#    For millions of communications, this table grows exponentially.
#    Mitigation: Use a Redis Bloom Filter for instant duplicate detection or set a TTL (e.g., 48h) on
#    deduplication keys in Redis, since duplicate callbacks typically arrive in short windows.
#
# 3. OUT-OF-ORDER CALLBACK HANDLING:
#    We use a linear weight-based state machine (`STATUS_WEIGHTS`). If an "opened" callback arrives 
#    before "delivered" due to network jitter, the heavier status (opened) wins and we ignore 
#    the late "delivered" event, keeping the funnel moving forward.
# =====================================================================
@router.post("/receipt", status_code=status.HTTP_200_OK)
async def receive_receipt(payload: ReceiptPayload, db: Session = Depends(get_db)):
    # 1. Idempotency check - silently ignore duplicates
    existing = db.query(ReceiptEvent).filter_by(
        communication_id=payload.communication_id,
        event=payload.event.lower()
    ).first()
    if existing:
        return {"status": "duplicate", "ignored": True}

    comm = db.query(Communication).filter(Communication.id == payload.communication_id).first()
    if not comm:
        return {"status": "ignored", "detail": "idempotent - ignore unknown ID"}
        
    current_status = comm.status.lower()
    new_status = payload.event.lower()
    
    current_weight = STATUS_WEIGHTS.get(current_status, 0)
    new_weight = STATUS_WEIGHTS.get(new_status, 0)
    
    # Only update status if the state progression is forward
    if new_weight > current_weight:
        comm.status = new_status
        
        # Dynamically set timestamp attribute if exists (e.g. sent_at, delivered_at, opened_at, clicked_at, converted_at)
        timestamp_attr = f"{new_status}_at"
        if hasattr(comm, timestamp_attr):
            setattr(comm, timestamp_attr, payload.timestamp)
            
        # Atomic increment on campaign aggregate (use SELECT FOR UPDATE style lock)
        campaign = db.query(Campaign).filter(Campaign.id == comm.campaign_id).with_for_update().first()
        if campaign:
            count_attr = f"{new_status}_count"
            if hasattr(campaign, count_attr):
                setattr(campaign, count_attr, getattr(campaign, count_attr) + 1)

        # Log receipt event for idempotency
        event_log = ReceiptEvent(
            communication_id=payload.communication_id,
            event=new_status,
            received_at=payload.timestamp
        )
        db.add(event_log)

        db.commit()
        
        # Trigger WebSocket broadcast of updated stats
        try:
            from app.websocket_manager import manager
            await manager.broadcast_campaign_stats(comm.campaign_id, db)
        except Exception as e:
            print(f"[Receipt Webhook] Error triggering WebSocket broadcast: {e}")
            
        return {"status": "success", "detail": f"Updated state to {new_status}"}
        
    return {"status": "ignored", "detail": f"State remained {comm.status} (received {new_status})"}
