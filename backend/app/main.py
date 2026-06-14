import httpx
import asyncio
import csv
import io
import json
from fastapi import FastAPI, Depends, HTTPException, status, File, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session
from datetime import datetime
from typing import List, Optional
import os

# Safe import of APScheduler — disabled on Vercel serverless (no persistent threads)
try:
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    is_vercel = os.getenv("VERCEL") or os.getenv("VERCEL_ENV")
    scheduler = AsyncIOScheduler() if not is_vercel else None
except Exception:
    scheduler = None

from app import models, schemas, crud, config, database
from app.agent import chat_with_agent
from app.seed import seed_data
from app.receipt import router as receipt_router

# Initialize Database tables
models.Base.metadata.create_all(bind=database.engine)

app = FastAPI(title="Xeno Mini CRM API", version="1.0.0")

@app.on_event("startup")
def startup_event():
    if scheduler:
        scheduler.start()
        print("[APscheduler] Started scheduler...")
    
    # Auto-seed database if empty (useful for ephemeral serverless platforms like Vercel)
    db = database.SessionLocal()
    try:
        from app.models import Customer
        if db.query(Customer).count() == 0:
            print("[Startup] Database is empty. Seeding with default D2C data...")
            from app.seed import seed_data
            seed_data(db, num_customers=50)
            print("[Startup] Database auto-seeding completed successfully.")
    except Exception as e:
        print(f"[Startup] Failed to auto-seed database: {e}")
    finally:
        db.close()

@app.on_event("shutdown")
def shutdown_event():
    if scheduler:
        scheduler.shutdown()
        print("[APscheduler] Stopped scheduler.")

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all for development simplicity
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include receipt callbacks router
app.include_router(receipt_router)

# Ingestion Seeding endpoint
@app.post("/api/seed", status_code=status.HTTP_200_OK)
def run_db_seed(num_customers: Optional[int] = 50, db: Session = Depends(database.get_db)):
    try:
        seed_data(db, num_customers=num_customers)
        return {"status": "success", "message": f"Database successfully seeded with {num_customers} realistic D2C customer data"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail=f"Failed to seed database: {str(e)}"
        )

# Recalculate RFM scores and personas
@app.post("/api/rfm/recalculate", status_code=status.HTTP_200_OK)
def recalculate_rfm_scores(db: Session = Depends(database.get_db)):
    try:
        from app.rfm import calculate_rfm
        calculate_rfm(db)
        return {"status": "success", "message": "RFM scores and customer personas successfully recalculated."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to recalculate RFM scores: {str(e)}")

# Get dynamic personas with database counts
@app.get("/api/personas")
def get_personas(db: Session = Depends(database.get_db)):
    # 1. Fetch count of actual customers per persona in database
    db_personas = db.query(models.Customer.persona, func.count(models.Customer.id)).group_by(models.Customer.persona).all()
    persona_counts = {p or "New Shoppers": count for p, count in db_personas}
    
    # Ensure all 5 standard personas are listed
    all_personas = ["VIP Dormants", "Loyal High-Spenders", "Lapsed Buyers", "New Shoppers", "Bargain Hunters"]
    for p in all_personas:
        if p not in persona_counts:
            persona_counts[p] = 0
            
    # 2. Try calling Gemini to generate narrative profiles based on the distribution
    from app.agent import gemini_client
    if gemini_client:
        try:
            # Get segment distribution for context
            db_segments = db.query(models.Customer.rfm_segment, func.count(models.Customer.id)).group_by(models.Customer.rfm_segment).all()
            distribution_summary = {s or "Unknown": count for s, count in db_segments}
            
            prompt = (
                f"You are a retail CRM analyst. Given the following customer RFM segment distribution counts: {json.dumps(distribution_summary)} "
                f"and the customer persona counts: {json.dumps(persona_counts)}, generate a list of 5 marketing personas. "
                f"For each persona, provide a name, a professional description explaining their behavior, and the count of customers matching them. "
                f"The counts must match the database persona counts exactly: {json.dumps(persona_counts)}."
            )
            
            from google.genai import types
            from pydantic import BaseModel
            from typing import List

            class PersonaDetail(BaseModel):
                name: str
                description: str
                count: int

            class PersonasResponse(BaseModel):
                personas: List[PersonaDetail]

            response = gemini_client.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=PersonasResponse,
                ),
            )
            
            parsed = json.loads(response.text)
            return parsed.get("personas", [])
        except Exception as e:
            print(f"Gemini persona generation failed, falling back to static profiles: {e}")
            
    # Fallback: Static descriptions with live database counts
    descriptions = {
        "VIP Dormants": "High-historical spenders who have not placed an order in the last 6 months (180+ days). High risk of churning, require premium win-back offers.",
        "Loyal High-Spenders": "Gold tier members and Champions who order regularly (monthly). High lifetime value, responsive to loyalty rewards and exclusive early access.",
        "Lapsed Buyers": "Previously active customers who are now At Risk or Lost. Have low recency scores, require discount reactivation campaigns.",
        "New Shoppers": "Recent first-time buyers who placed their first order within the last 30 days. High potential for second-purchase conversion.",
        "Bargain Hunters": "Frequent purchasers with lower average ticket values. Highly responsive to deals, discount codes, and flash sales."
    }
    return [
        {"name": p, "description": descriptions[p], "count": persona_counts[p]}
        for p in all_personas
    ]

# Customers Endpoints
@app.get("/api/customers", response_model=List[schemas.CustomerResponse])
def read_customers(
    skip: int = 0, 
    limit: int = 100, 
    tier: Optional[str] = None, 
    city: Optional[str] = None,
    db: Session = Depends(database.get_db)
):
    return crud.get_customers(db, skip=skip, limit=limit, tier=tier, city=city)

@app.get("/api/customers/{id}", response_model=schemas.CustomerDetailResponse)
def read_customer_detail(id: int, db: Session = Depends(database.get_db)):
    customer = db.query(models.Customer).filter(models.Customer.id == id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    comms = []
    for comm in customer.communications:
        campaign_name = comm.campaign.name if comm.campaign else "Unknown Campaign"
        comms.append(
            schemas.CommunicationMinimalResponse(
                id=comm.id,
                message=comm.message,
                channel=comm.channel,
                status=comm.status,
                sent_at=comm.sent_at,
                campaign_name=campaign_name
            )
        )
        
    orders = [
        schemas.OrderMinimalResponse(
            id=o.id,
            amount=o.amount,
            items=o.items,
            channel=o.channel,
            status=o.status,
            created_at=o.created_at
        ) for o in customer.orders
    ]
    
    # Sort orders and communications by creation time descending (newest first)
    orders.sort(key=lambda x: x.created_at, reverse=True)
    comms.sort(key=lambda x: x.sent_at if x.sent_at else datetime.min, reverse=True)

    return schemas.CustomerDetailResponse(
        id=customer.id,
        name=customer.name,
        email=customer.email,
        phone=customer.phone,
        city=customer.city,
        tier=customer.tier,
        total_spend=customer.total_spend,
        order_count=customer.order_count,
        last_order_date=customer.last_order_date,
        created_at=customer.created_at,
        orders=orders,
        communications=comms
    )

@app.post("/api/customers", response_model=schemas.CustomerResponse, status_code=status.HTTP_201_CREATED)
def create_customer_record(customer: schemas.CustomerCreate, db: Session = Depends(database.get_db)):
    existing = db.query(models.Customer).filter(models.Customer.email == customer.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Customer with this email already exists")
    return crud.create_customer(db, customer)

@app.post("/api/orders", response_model=schemas.OrderResponse, status_code=status.HTTP_201_CREATED)
def create_order_record(order: schemas.OrderCreate, db: Session = Depends(database.get_db)):
    customer = db.query(models.Customer).filter(models.Customer.id == order.customer_id).first()
    if not customer:
        raise HTTPException(status_code=400, detail="Customer not found")
    return crud.create_order(db, order)

# Segments Endpoints
@app.get("/api/segments", response_model=List[schemas.SegmentResponse])
def read_segments(skip: int = 0, limit: int = 100, db: Session = Depends(database.get_db)):
    return crud.get_segments(db, skip=skip, limit=limit)

@app.post("/api/segments", response_model=schemas.SegmentResponse, status_code=status.HTTP_201_CREATED)
def create_new_segment(segment: schemas.SegmentCreate, db: Session = Depends(database.get_db)):
    return crud.create_segment(db, segment)

@app.get("/api/segments/{id}/customers", response_model=List[schemas.CustomerResponse])
def read_segment_customers(id: int, db: Session = Depends(database.get_db)):
    segment = crud.get_segment(db, id)
    if not segment:
        raise HTTPException(status_code=404, detail="Segment not found")
    return crud.get_segment_customers(db, segment.filter_config, limit=200)

@app.get("/api/segments/{id}/overlap")
def get_segment_overlap(id: int, db: Session = Depends(database.get_db)):
    target_segment = crud.get_segment(db, id)
    if not target_segment:
        raise HTTPException(status_code=404, detail="Segment not found")
        
    target_customers = crud.get_segment_customers(db, target_segment.filter_config, limit=1000)
    target_ids = {c.id for c in target_customers}
    
    all_segments = db.query(models.Segment).filter(models.Segment.id != id).all()
    overlaps = []
    
    for segment in all_segments:
        segment_customers = crud.get_segment_customers(db, segment.filter_config, limit=1000)
        overlap_count = sum(1 for c in segment_customers if c.id in target_ids)
        overlaps.append({
            "segment_id": segment.id,
            "segment_name": segment.name,
            "overlap_count": overlap_count,
            "percentage": round((overlap_count / len(target_ids) * 100), 1) if target_ids else 0
        })
        
    return overlaps

# Campaigns Endpoints
@app.get("/api/campaigns", response_model=List[schemas.CampaignResponse])
def read_campaigns(skip: int = 0, limit: int = 100, db: Session = Depends(database.get_db)):
    campaigns = crud.get_campaigns(db, skip=skip, limit=limit)
    response = []
    for camp in campaigns:
        stats = crud.get_campaign_stats(db, camp.id)
        camp_res = schemas.CampaignResponse.from_orm(camp)
        camp_res.stats = stats
        if camp.is_ab_test:
            camp_res.stats_a = crud.get_campaign_variant_stats(db, camp.id, "A")
            camp_res.stats_b = crud.get_campaign_variant_stats(db, camp.id, "B")
        response.append(camp_res)
    return response

@app.post("/api/campaigns", response_model=schemas.CampaignResponse, status_code=status.HTTP_201_CREATED)
def create_new_campaign(campaign: schemas.CampaignCreate, db: Session = Depends(database.get_db)):
    # Validate segment exists
    segment = crud.get_segment(db, campaign.segment_id)
    if not segment:
        raise HTTPException(status_code=400, detail="Target Segment does not exist")
    db_campaign = crud.create_campaign(db, campaign)
    camp_res = schemas.CampaignResponse.from_orm(db_campaign)
    camp_res.stats = schemas.CampaignStats(total=0, queued=0, sent=0, delivered=0, read=0, opened=0, clicked=0, converted=0, failed=0)
    return camp_res

@app.get("/api/campaigns/{id}", response_model=schemas.CampaignResponse)
def read_campaign_detail(id: int, db: Session = Depends(database.get_db)):
    campaign = crud.get_campaign(db, id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    stats = crud.get_campaign_stats(db, campaign.id)
    camp_res = schemas.CampaignResponse.from_orm(campaign)
    camp_res.stats = stats
    if campaign.is_ab_test:
        camp_res.stats_a = crud.get_campaign_variant_stats(db, campaign.id, "A")
        camp_res.stats_b = crud.get_campaign_variant_stats(db, campaign.id, "B")
    return camp_res

@app.get("/api/campaigns/{id}/communications", response_model=List[schemas.CommunicationResponse])
def read_campaign_communications(id: int, db: Session = Depends(database.get_db)):
    comms = db.query(models.Communication).filter(models.Communication.campaign_id == id).all()
    return comms

@app.get("/api/campaigns/{id}/analyse")
def analyse_campaign_results(id: int, db: Session = Depends(database.get_db)):
    campaign = crud.get_campaign(db, id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
        
    stats = crud.get_campaign_stats(db, id)
    
    analysis_data = {
        "campaign_name": campaign.name,
        "channel": campaign.channel,
        "total_audience": stats.total,
        "delivered": stats.delivered,
        "opened": stats.opened,
        "clicked": stats.clicked,
        "converted": stats.converted,
        "failed": stats.failed
    }
    
    ab_summary = ""
    if campaign.is_ab_test:
        stats_a = crud.get_campaign_variant_stats(db, id, "A")
        stats_b = crud.get_campaign_variant_stats(db, id, "B")
        
        open_rate_a = (stats_a.opened / stats_a.delivered * 100) if stats_a.delivered > 0 else 0.0
        open_rate_b = (stats_b.opened / stats_b.delivered * 100) if stats_b.delivered > 0 else 0.0
        
        click_rate_a = (stats_a.clicked / stats_a.delivered * 100) if stats_a.delivered > 0 else 0.0
        click_rate_b = (stats_b.clicked / stats_b.delivered * 100) if stats_b.delivered > 0 else 0.0
        
        # Decide winner based on click rate primarily, then open rate
        winner = "A" if (click_rate_a > click_rate_b or (click_rate_a == click_rate_b and open_rate_a >= open_rate_b)) else "B"
        
        # If stats are both 0 (e.g. campaign not launched yet), winner is None
        if stats_a.delivered == 0 and stats_b.delivered == 0:
            winner = None
        else:
            campaign.winner_variant = winner
            db.commit()
            
        ab_summary = (
            f"This was an A/B test campaign.\n"
            f"- Variant A: Delivered {stats_a.delivered}, Opened {stats_a.opened} ({open_rate_a:.1f}%), Clicked {stats_a.clicked} ({click_rate_a:.1f}%)\n"
            f"- Variant B: Delivered {stats_b.delivered}, Opened {stats_b.opened} ({open_rate_b:.1f}%), Clicked {stats_b.clicked} ({click_rate_b:.1f}%)\n"
            f"- Winner: Variant {winner if winner else 'TBD'}\n"
        )
        analysis_data["ab_test_details"] = {
            "variant_a": {"delivered": stats_a.delivered, "opened": stats_a.opened, "clicked": stats_a.clicked, "converted": stats_a.converted},
            "variant_b": {"delivered": stats_b.delivered, "opened": stats_b.opened, "clicked": stats_b.clicked, "converted": stats_b.converted},
            "winner": winner
        }
        
    # Call Gemini to write a narrative report
    from app.agent import gemini_client
    narrative = ""
    if gemini_client:
        try:
            prompt = (
                f"You are a retail CRM analyst. Write a brief, punchy marketing summary (max 3-4 bullet points) for the following campaign data: {json.dumps(analysis_data)}.\n"
                f"Explain the conversion performance, CTR, and A/B test results if applicable. Mention the winner variant. Keep it conversational."
            )
            response = gemini_client.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt
            )
            narrative = response.text or ""
        except Exception as e:
            print(f"Gemini campaign analysis failed: {e}")
            
    if not narrative:
        # Fallback static narrative
        open_rate = (stats.opened / stats.delivered * 100) if stats.delivered > 0 else 0
        conversion_rate = (stats.converted / stats.delivered * 100) if stats.delivered > 0 else 0
        winner_text = f" Variant {campaign.winner_variant} outperformed the control." if campaign.winner_variant else ""
        narrative = (
            f"• **Delivery Rate**: Successful dispatch to {stats.delivered} out of {stats.total} customers.\n"
            f"• **Engagement**: Achieved an open rate of {open_rate:.1f}% and total clicks of {stats.clicked}.\n"
            f"• **Conversions**: {stats.converted} customers went on to complete a purchase, representing a {conversion_rate:.1f}% conversion rate.{winner_text}"
        )
        
    return {
        "campaign_id": id,
        "is_ab_test": campaign.is_ab_test,
        "winner_variant": campaign.winner_variant,
        "analysis_data": analysis_data,
        "narrative": narrative
    }

# Synchronous simulation — writes all final statuses in one DB transaction.
# This is reliable on ephemeral/serverless platforms (Render free tier) where
# async background tasks die when the server spins down between requests.
def run_sync_simulation(campaign_id: int, comm_ids: List[int], db: Session):
    import random

    now = datetime.utcnow()

    # Probability thresholds
    P_DELIVERED = 0.90   # 90% get delivered
    P_FAILED    = 0.05   # 5% explicitly fail
    P_READ      = 0.50   # 50% of delivered get read
    P_OPENED    = 0.60   # 60% of read get opened
    P_CLICKED   = 0.30   # 30% of opened get clicked
    P_CONVERTED = 0.20   # 20% of clicked convert

    # Fetch campaign once for atomic counter update
    campaign = db.query(models.Campaign).filter(models.Campaign.id == campaign_id).first()
    if not campaign:
        return

    # Reset counters to 0 before simulation
    campaign.sent_count = 0
    campaign.delivered_count = 0
    campaign.read_count = 0
    campaign.opened_count = 0
    campaign.clicked_count = 0
    campaign.converted_count = 0
    campaign.failed_count = 0

    for comm_id in comm_ids:
        comm = db.query(models.Communication).filter(models.Communication.id == comm_id).first()
        if not comm:
            continue

        # All are sent
        comm.status = "sent"
        comm.sent_at = now
        campaign.sent_count += 1

        rand = random.random()
        if rand < P_FAILED:
            comm.status = "failed"
            campaign.failed_count += 1
            continue

        if rand < P_DELIVERED:
            comm.status = "delivered"
            comm.delivered_at = now
            campaign.delivered_count += 1
        else:
            # Neither delivered nor failed — stays at sent
            continue

        if random.random() < P_READ:
            comm.status = "read"
            comm.read_at = now
            campaign.read_count += 1
        else:
            continue

        if random.random() < P_OPENED:
            comm.status = "opened"
            comm.opened_at = now
            campaign.opened_count += 1
        else:
            continue

        if random.random() < P_CLICKED:
            comm.status = "clicked"
            comm.clicked_at = now
            campaign.clicked_count += 1
        else:
            continue

        if random.random() < P_CONVERTED:
            comm.status = "converted"
            comm.converted_at = now
            campaign.converted_count += 1

    db.commit()
    print(f"[Simulation] Campaign {campaign_id} finalised: sent={campaign.sent_count}, delivered={campaign.delivered_count}, "
          f"read={campaign.read_count}, opened={campaign.opened_count}, clicked={campaign.clicked_count}, "
          f"converted={campaign.converted_count}, failed={campaign.failed_count}")

# Launch Campaign
@app.post("/api/campaigns/{id}/launch", status_code=status.HTTP_200_OK)
def launch_campaign(id: int, db: Session = Depends(database.get_db)):
    campaign = crud.get_campaign(db, id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if campaign.status == "sent":
        raise HTTPException(status_code=400, detail="Campaign has already been launched")

    # Get Segment customers
    segment = crud.get_segment(db, campaign.segment_id)
    if not segment:
        raise HTTPException(status_code=400, detail="Segment associated with campaign not found")

    customers = crud.get_segment_customers(db, segment.filter_config, limit=200)
    if not customers:
        raise HTTPException(status_code=400, detail="Segment contains 0 customers. Cannot launch campaign.")

    campaign.status = "sent"
    campaign.launched_at = datetime.utcnow()
    
    # Create communication records in queued state first
    comm_ids = []
    for idx, customer in enumerate(customers):
        variant = "A"
        template = campaign.message_template
        if campaign.is_ab_test:
            variant = "A" if idx % 2 == 0 else "B"
            template = campaign.message_template if variant == "A" else campaign.message_template_b

        personalized_msg = template.replace("{name}", customer.name)
        
        offer_val = "10% off"
        if "₹" in campaign.name or "%" in campaign.name:
            parts = campaign.name.split("(")
            if len(parts) > 1:
                offer_val = parts[1].replace(")", "")
        personalized_msg = personalized_msg.replace("{offer}", offer_val)

        comm = models.Communication(
            campaign_id=campaign.id,
            customer_id=customer.id,
            message=personalized_msg,
            channel=campaign.channel,
            variant=variant,
            status="queued"
        )
        db.add(comm)
        db.flush()  # Flush to get comm.id
        comm_ids.append(comm.id)

    db.commit()

    # Run synchronous simulation — immediately finalises all statuses in one DB commit.
    # This is necessary for ephemeral deployments (Render free tier) where async background
    # tasks are killed when the dyno spins down, leaving stats at zero.
    print(f"[Launch] Running synchronous simulation for campaign {campaign.id} with {len(comm_ids)} communications...")
    run_sync_simulation(campaign.id, comm_ids, db)
    
    return {"status": "success", "message": f"Campaign launched for {len(customers)} customers. Stats are ready."}

class SchedulePayload(BaseModel):
    scheduled_at: datetime

async def launch_scheduled_campaign_job(campaign_id: int):
    print(f"[APscheduler Job] Starting launch sequence for scheduled campaign ID: {campaign_id}")
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        campaign = db.query(models.Campaign).filter(models.Campaign.id == campaign_id).first()
        if not campaign or campaign.status == "sent":
            return
            
        segment = db.query(models.Segment).filter(models.Segment.id == campaign.segment_id).first()
        if not segment:
            return
            
        customers = crud.get_segment_customers(db, segment.filter_config, limit=200)
        if not customers:
            return
            
        campaign.status = "sent"
        campaign.launched_at = datetime.utcnow()
        
        comm_data_list = []
        for idx, customer in enumerate(customers):
            variant = "A"
            template = campaign.message_template
            if campaign.is_ab_test:
                variant = "A" if idx % 2 == 0 else "B"
                template = campaign.message_template if variant == "A" else campaign.message_template_b
                
            personalized_msg = template.replace("{name}", customer.name)
            
            offer_val = "10% off"
            if "₹" in campaign.name or "%" in campaign.name:
                parts = campaign.name.split("(")
                if len(parts) > 1:
                    offer_val = parts[1].replace(")", "")
            personalized_msg = personalized_msg.replace("{offer}", offer_val)
            
            comm = models.Communication(
                campaign_id=campaign.id,
                customer_id=customer.id,
                message=personalized_msg,
                channel=campaign.channel,
                variant=variant,
                status="queued"
            )
            db.add(comm)
            db.flush()
            
            comm_data_list.append({
                "communication_id": comm.id,
                "recipient_phone": customer.phone,
                "recipient_email": customer.email,
                "message": personalized_msg,
                "channel": campaign.channel
            })
            
        db.commit()
        
        # Use synchronous simulation — same as the live launch endpoint
        comm_ids = [comm["communication_id"] for comm in comm_data_list]
        run_sync_simulation(campaign_id, comm_ids, db)
    except Exception as e:
        print(f"[APscheduler Job] Error running campaign {campaign_id}: {e}")
    finally:
        db.close()

@app.post("/api/campaigns/{id}/schedule", status_code=status.HTTP_200_OK)
async def schedule_campaign_launch(id: int, payload: SchedulePayload, db: Session = Depends(database.get_db)):
    campaign = crud.get_campaign(db, id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if campaign.status == "sent":
        raise HTTPException(status_code=400, detail="Campaign has already been launched")
        
    campaign.status = "scheduled"
    campaign.scheduled_at = payload.scheduled_at
    db.commit()
    
    # Schedule job using apscheduler if available
    if scheduler:
        scheduler.add_job(
            launch_scheduled_campaign_job,
            trigger="date",
            run_date=payload.scheduled_at,
            args=[id],
            id=f"campaign_{id}",
            replace_existing=True
        )
    else:
        print(f"[Vercel Serverless] Mocking campaign schedule for ID {id} at {payload.scheduled_at}")
    
    return {"status": "success", "message": f"Campaign {id} successfully scheduled for {payload.scheduled_at}"}

# AI Agent Chat Endpoints
@app.get("/api/chat/history", response_model=List[schemas.MessageResponse])
def get_chat_history(db: Session = Depends(database.get_db)):
    return crud.get_messages(db)

@app.post("/api/chat")
async def chat(chat_req: schemas.ChatRequest, db: Session = Depends(database.get_db)):
    # 1. Save user message to database
    user_msg_in = schemas.MessageCreate(role="user", content=chat_req.message)
    crud.create_message(db, user_msg_in)

    # 2. Multi-turn memory: load last 12 messages from DB
    db_history = crud.get_messages(db, limit=12)
    history_list = [{"role": h.role, "content": h.content} for h in db_history[:-1]] # exclude current user message

    # 3. Streaming response generator
    async def stream_generator():
        try:
            # Call AI agent (runs Anthropic or regex fallback parser)
            ai_response = await chat_with_agent(
                db=db, 
                message=chat_req.message, 
                history=history_list, 
                channel_service_url=config.CHANNEL_SERVICE_URL
            )

            # Save the final AI response to the database
            ai_msg_in = schemas.MessageCreate(role="assistant", content=ai_response)
            crud.create_message(db, ai_msg_in)

            # Stream response chunk-by-chunk in EventSource format
            chunk_size = 15
            for i in range(0, len(ai_response), chunk_size):
                chunk = ai_response[i:i+chunk_size]
                yield f"data: {json.dumps({'token': chunk})}\n\n"
                await asyncio.sleep(0.015)

            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(stream_generator(), media_type="text/event-stream")

@app.post("/api/chat/clear", status_code=status.HTTP_200_OK)
def clear_chat_history(db: Session = Depends(database.get_db)):
    crud.clear_messages(db)
    return {"status": "success", "message": "Chat history cleared"}

# CSV Customer Import Endpoint
@app.post("/api/customers/upload", status_code=status.HTTP_200_OK)
def upload_customers_csv(file: UploadFile = File(...), db: Session = Depends(database.get_db)):
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")
    try:
        content = file.file.read().decode('utf-8')
        csv_reader = csv.DictReader(io.StringIO(content))
        
        imported_count = 0
        errors = []
        
        for row_idx, row in enumerate(csv_reader, start=1):
            name = row.get("name", "").strip()
            email = row.get("email", "").strip()
            phone = row.get("phone", "").strip()
            city = row.get("city", "").strip()
            tier = row.get("tier", "").strip().lower()
            
            if not name or not email or not phone or not city or not tier:
                errors.append(f"Row {row_idx}: Missing required fields (name, email, phone, city, tier)")
                continue
                
            if tier not in ["bronze", "silver", "gold"]:
                errors.append(f"Row {row_idx}: Invalid tier '{tier}' (must be bronze, silver, or gold)")
                continue
                
            # Check if customer email already exists
            existing = db.query(models.Customer).filter(models.Customer.email == email).first()
            if existing:
                existing.name = name
                existing.phone = phone
                existing.city = city
                existing.tier = tier
                imported_count += 1
                continue
                
            customer = models.Customer(
                name=name,
                email=email,
                phone=phone,
                city=city,
                tier=tier,
                total_spend=0.0,
                order_count=0
            )
            db.add(customer)
            imported_count += 1
            
        db.commit()
        return {
            "status": "success", 
            "message": f"Successfully imported/updated {imported_count} customers.",
            "errors": errors
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"CSV processing error: {str(e)}")

# WebSocket Stats Endpoint
@app.websocket("/api/ws/campaigns")
async def websocket_campaign_stats(websocket: WebSocket):
    from app.websocket_manager import manager
    await manager.connect(websocket)
    try:
        while True:
            # Wait for any message (just to keep connection alive)
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        print(f"[WebSocket] Client disconnected with error: {e}")
        manager.disconnect(websocket)
