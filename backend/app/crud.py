from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
from typing import Dict, Any, List
from . import models, schemas

# Customer CRUD
def create_customer(db: Session, customer: schemas.CustomerCreate):
    db_customer = models.Customer(
        name=customer.name,
        email=customer.email,
        phone=customer.phone,
        city=customer.city,
        tier=customer.tier,
        total_spend=customer.total_spend,
        order_count=customer.order_count,
        last_order_date=customer.last_order_date
    )
    db.add(db_customer)
    db.commit()
    db.refresh(db_customer)
    
    # Recalculate RFM and persona badges dynamically
    from .rfm import calculate_rfm
    calculate_rfm(db)
    db.refresh(db_customer)
    return db_customer

def create_order(db: Session, order: schemas.OrderCreate):
    db_order = models.Order(
        customer_id=order.customer_id,
        amount=order.amount,
        items=order.items,
        channel=order.channel,
        status=order.status
    )
    db.add(db_order)
    
    # Update customer spend aggregates
    customer = db.query(models.Customer).filter(models.Customer.id == order.customer_id).first()
    if customer:
        customer.total_spend += order.amount
        customer.order_count += 1
        customer.last_order_date = datetime.utcnow()
        
    db.commit()
    db.refresh(db_order)
    
    # Recalculate RFM and persona badges dynamically
    from .rfm import calculate_rfm
    calculate_rfm(db)
    return db_order

def get_customers(db: Session, skip: int = 0, limit: int = 100, tier: str = None, city: str = None):
    query = db.query(models.Customer)
    if tier:
        query = query.filter(models.Customer.tier.ilike(tier))
    if city:
        query = query.filter(models.Customer.city.ilike(city))
    return query.order_by(models.Customer.total_spend.desc()).offset(skip).limit(limit).all()

# Get customer count matching a segment filter config
def get_segment_customers_query(db: Session, filter_config: Dict[str, Any]):
    query = db.query(models.Customer)
    
    # Apply Tier Filter
    if "tier" in filter_config and filter_config["tier"]:
        query = query.filter(models.Customer.tier.ilike(filter_config["tier"]))
        
    # Apply City Filter
    if "city" in filter_config and filter_config["city"]:
        query = query.filter(models.Customer.city.ilike(filter_config["city"]))
        
    # Apply Total Spend Filters
    if "min_spend" in filter_config and filter_config["min_spend"] is not None:
        query = query.filter(models.Customer.total_spend >= float(filter_config["min_spend"]))
    if "max_spend" in filter_config and filter_config["max_spend"] is not None:
        query = query.filter(models.Customer.total_spend <= float(filter_config["max_spend"]))
        
    # Apply Order Count Filters
    if "min_orders" in filter_config and filter_config["min_orders"] is not None:
        query = query.filter(models.Customer.order_count >= int(filter_config["min_orders"]))
        
    # Apply Inactivity Filter (Last Order Date)
    if "inactive_days" in filter_config and filter_config["inactive_days"] is not None:
        cutoff = datetime.utcnow() - timedelta(days=int(filter_config["inactive_days"]))
        # Includes dormant customer order histories or new customers who registered but haven't bought yet
        query = query.filter(
            (models.Customer.last_order_date == None) | 
            (models.Customer.last_order_date <= cutoff)
        )
        
    # Apply Activity Recency Filter (Last Order Date)
    if "active_within_days" in filter_config and filter_config["active_within_days"] is not None:
        cutoff = datetime.utcnow() - timedelta(days=int(filter_config["active_within_days"]))
        query = query.filter(models.Customer.last_order_date >= cutoff)
        
    # Apply RFM Segment Filter
    if "rfm_segment" in filter_config and filter_config["rfm_segment"]:
        query = query.filter(models.Customer.rfm_segment.ilike(filter_config["rfm_segment"]))
        
    # Apply Persona Filter
    if "persona" in filter_config and filter_config["persona"]:
        query = query.filter(models.Customer.persona.ilike(filter_config["persona"]))
        
    return query

def get_segment_customers(db: Session, filter_config: Dict[str, Any], limit: int = 100):
    query = get_segment_customers_query(db, filter_config)
    return query.limit(limit).all()

def get_segment_customers_count(db: Session, filter_config: Dict[str, Any]) -> int:
    query = get_segment_customers_query(db, filter_config)
    return query.count()

# Segment CRUD
def create_segment(db: Session, segment: schemas.SegmentCreate):
    count = get_segment_customers_count(db, segment.filter_config)
    db_segment = models.Segment(
        name=segment.name,
        description=segment.description,
        filter_config=segment.filter_config,
        customer_count=count,
        created_by=segment.created_by
    )
    db.add(db_segment)
    db.commit()
    db.refresh(db_segment)
    return db_segment

def get_segments(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Segment).order_by(models.Segment.created_at.desc()).offset(skip).limit(limit).all()

def get_segment(db: Session, segment_id: int):
    return db.query(models.Segment).filter(models.Segment.id == segment_id).first()

# Campaign CRUD
def create_campaign(db: Session, campaign: schemas.CampaignCreate):
    db_campaign = models.Campaign(
        name=campaign.name,
        segment_id=campaign.segment_id,
        message_template=campaign.message_template,
        message_template_b=campaign.message_template_b,
        is_ab_test=campaign.is_ab_test,
        channel=campaign.channel,
        status="draft",
        scheduled_at=campaign.scheduled_at,
        created_by=campaign.created_by
    )
    db.add(db_campaign)
    db.commit()
    db.refresh(db_campaign)
    return db_campaign

def get_campaigns(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Campaign).order_by(models.Campaign.created_at.desc()).offset(skip).limit(limit).all()

def get_campaign(db: Session, campaign_id: int):
    return db.query(models.Campaign).filter(models.Campaign.id == campaign_id).first()

# Calculate Campaign Stats
def get_campaign_stats(db: Session, campaign_id: int) -> schemas.CampaignStats:
    campaign = db.query(models.Campaign).filter(models.Campaign.id == campaign_id).first()
    if not campaign:
        return schemas.CampaignStats(total=0, queued=0, sent=0, delivered=0, read=0, opened=0, clicked=0, converted=0, failed=0)
        
    total = db.query(models.Communication).filter(models.Communication.campaign_id == campaign_id).count()
    queued = db.query(models.Communication).filter(
        (models.Communication.campaign_id == campaign_id) & 
        (models.Communication.status == "queued")
    ).count()

    return schemas.CampaignStats(
        total=total,
        queued=queued,
        sent=campaign.sent_count,
        delivered=campaign.delivered_count,
        read=campaign.read_count,
        opened=campaign.opened_count,
        clicked=campaign.clicked_count,
        converted=campaign.converted_count,
        failed=campaign.failed_count
    )

def get_campaign_variant_stats(db: Session, campaign_id: int, variant: str) -> schemas.CampaignStats:
    coms = db.query(models.Communication).filter(
        (models.Communication.campaign_id == campaign_id) &
        (models.Communication.variant == variant)
    ).all()
    
    total = len(coms)
    queued = sum(1 for c in coms if c.status == "queued")
    
    # Calculate cumulative counts
    sent = sum(1 for c in coms if c.status in ["sent", "delivered", "read", "opened", "clicked", "converted"])
    delivered = sum(1 for c in coms if c.status in ["delivered", "read", "opened", "clicked", "converted"])
    read = sum(1 for c in coms if c.status in ["read", "opened", "clicked", "converted"])
    opened = sum(1 for c in coms if c.status in ["opened", "clicked", "converted"])
    clicked = sum(1 for c in coms if c.status in ["clicked", "converted"])
    converted = sum(1 for c in coms if c.status == "converted")
    failed = sum(1 for c in coms if c.status == "failed")
    
    return schemas.CampaignStats(
        total=total,
        queued=queued,
        sent=sent,
        delivered=delivered,
        read=read,
        opened=opened,
        clicked=clicked,
        converted=converted,
        failed=failed
    )

# Messages (Chat History) CRUD
def create_message(db: Session, message: schemas.MessageCreate):
    db_message = models.Message(
        role=message.role,
        content=message.content
    )
    db.add(db_message)
    db.commit()
    db.refresh(db_message)
    return db_message

def get_messages(db: Session, limit: int = 50):
    return db.query(models.Message).order_by(models.Message.created_at.asc()).limit(limit).all()

def clear_messages(db: Session):
    db.query(models.Message).delete()
    db.commit()
