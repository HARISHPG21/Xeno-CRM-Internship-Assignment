import os
import time
import random
import httpx
from datetime import datetime
from celery import Celery

CRM_BACKEND_URL = os.getenv("CRM_BACKEND_URL", "http://localhost:8000")
CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "sqla+sqlite:///celery_broker.db")

# Setup Celery app
app = Celery("tasks", broker=CELERY_BROKER_URL, backend="db+sqlite:///celery_results.db")

app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)

# Sync HTTP callback with retry logic
@app.task(bind=True, max_retries=3, default_retry_delay=5)
def send_callback_task(self, comm_id: int, event: str, timestamp_str: str):
    payload = {
        "communication_id": comm_id,
        "event": event,
        "timestamp": timestamp_str
    }
    url = f"{CRM_BACKEND_URL}/api/receipt"
    try:
        print(f"[Celery Worker] Sending callback: ID {comm_id} -> {event}")
        res = httpx.post(url, json=payload, timeout=5.0)
        print(f"[Celery Worker] Receipt Response (ID {comm_id} -> {event}): {res.status_code}")
        
        # Raise exception for 5xx server errors to trigger a retry
        if res.status_code >= 500:
            res.raise_for_status()
    except Exception as exc:
        print(f"[Celery Worker] Error sending callback for ID {comm_id}: {exc}")
        # Exponential backoff countdown: 2^retry + 2 seconds
        retry_countdown = 2 ** self.request.retries + 2
        try:
            self.retry(exc=exc, countdown=retry_countdown)
        except Exception as retry_exc:
            print(f"[Celery Worker] Dead-letter queue (Max retries reached) for ID {comm_id}")
            raise retry_exc

# Multi-stage communication lifecycle simulation
@app.task
def simulate_communication_lifecycle_task(comm_id: int, phone: str, email: str, message: str, channel: str):
    # Step 1: SENT (sleep random 1-3s)
    time.sleep(random.uniform(1.0, 3.0))
    send_callback_task.delay(comm_id, "sent", datetime.utcnow().isoformat())
    
    # Step 2: DELIVERED (85% probability) or FAILED (5% probability)
    time.sleep(random.uniform(2.0, 4.0))
    rand = random.random()
    if rand < 0.85:
        send_callback_task.delay(comm_id, "delivered", datetime.utcnow().isoformat())
    elif rand < 0.90:  # 5% fail
        send_callback_task.delay(comm_id, "failed", datetime.utcnow().isoformat())
        return
    else:  # 10% remain sent
        return
        
    # Step 2.5: READ (45% probability of delivered)
    time.sleep(random.uniform(1.5, 3.0))
    if random.random() >= 0.45:
        return
    send_callback_task.delay(comm_id, "read", datetime.utcnow().isoformat())
    
    # Step 3: OPENED (60% probability of read)
    time.sleep(random.uniform(2.0, 4.0))
    if random.random() >= 0.60:
        return
    send_callback_task.delay(comm_id, "opened", datetime.utcnow().isoformat())
    
    # Step 4: CLICKED (25% probability of opened)
    time.sleep(random.uniform(3.0, 5.0))
    if random.random() >= 0.25:
        return
    send_callback_task.delay(comm_id, "clicked", datetime.utcnow().isoformat())
    
    # Step 5: CONVERTED (15% probability of clicked)
    time.sleep(random.uniform(5.0, 10.0))
    if random.random() >= 0.15:
        return
    send_callback_task.delay(comm_id, "converted", datetime.utcnow().isoformat())
