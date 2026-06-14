import os
import asyncio
import random
import httpx
from datetime import datetime
from typing import List
from pydantic import BaseModel
from fastapi import FastAPI, BackgroundTasks, status
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

CRM_BACKEND_URL = os.getenv("CRM_BACKEND_URL", "http://localhost:8000")
PORT = int(os.getenv("PORT", "8001"))

app = FastAPI(title="Zeno Channel Service Stub", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class CommunicationPayload(BaseModel):
    communication_id: int
    recipient_phone: str
    recipient_email: str
    message: str
    channel: str

class SendBatchPayload(BaseModel):
    communications: List[CommunicationPayload]

# Ingest Celery task
from tasks import simulate_communication_lifecycle_task

@app.post("/send", status_code=status.HTTP_200_OK)
def send_communications(payload: SendBatchPayload):
    print(f"[Simulated Channel] Queuing batch of size {len(payload.communications)} to Celery worker...")
    for comm in payload.communications:
        simulate_communication_lifecycle_task.delay(
            comm.communication_id,
            comm.recipient_phone,
            comm.recipient_email,
            comm.message,
            comm.channel
        )
    return {"status": "success", "message": f"Successfully queued {len(payload.communications)} simulations to Celery task queue"}
