from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text, JSON, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base

class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    phone = Column(String, nullable=False)
    city = Column(String, nullable=False)
    tier = Column(String, nullable=False)  # bronze, silver, gold
    total_spend = Column(Float, default=0.0)
    order_count = Column(Integer, default=0)
    last_order_date = Column(DateTime, nullable=True)
    opted_out = Column(Boolean, default=False)
    rfm_recency = Column(Integer, nullable=True)
    rfm_frequency = Column(Integer, nullable=True)
    rfm_monetary = Column(Integer, nullable=True)
    rfm_segment = Column(String, nullable=True)
    persona = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    orders = relationship("Order", back_populates="customer", cascade="all, delete-orphan")
    communications = relationship("Communication", back_populates="customer", cascade="all, delete-orphan")

class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False)
    amount = Column(Float, nullable=False)
    items = Column(Text, nullable=False)  # Store JSON representation of items
    channel = Column(String, nullable=False)  # online, retail, etc.
    status = Column(String, nullable=False)  # completed, returned, etc.
    created_at = Column(DateTime, default=datetime.utcnow)

    customer = relationship("Customer", back_populates="orders")

class Segment(Base):
    __tablename__ = "segments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    filter_config = Column(JSON, nullable=False)  # JSON field to store rules
    customer_count = Column(Integer, default=0)
    created_by = Column(String, default="human")  # human, ai
    created_at = Column(DateTime, default=datetime.utcnow)

    campaigns = relationship("Campaign", back_populates="segment")

class Campaign(Base):
    __tablename__ = "campaigns"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    segment_id = Column(Integer, ForeignKey("segments.id"), nullable=False)
    message_template = Column(Text, nullable=False)
    message_template_b = Column(Text, nullable=True)
    is_ab_test = Column(Boolean, default=False)
    channel = Column(String, nullable=False)  # whatsapp, sms, email, rcs
    status = Column(String, default="draft")  # draft, scheduled, sent
    scheduled_at = Column(DateTime, nullable=True)
    launched_at = Column(DateTime, nullable=True)
    created_by = Column(String, default="human")  # human, ai
    winner_variant = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Aggregate metric counters
    sent_count = Column(Integer, default=0)
    delivered_count = Column(Integer, default=0)
    failed_count = Column(Integer, default=0)
    read_count = Column(Integer, default=0)
    opened_count = Column(Integer, default=0)
    clicked_count = Column(Integer, default=0)
    converted_count = Column(Integer, default=0)

    segment = relationship("Segment", back_populates="campaigns")
    communications = relationship("Communication", back_populates="campaign", cascade="all, delete-orphan")

class Communication(Base):
    __tablename__ = "communications"

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id"), nullable=False)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False)
    message = Column(Text, nullable=False)
    channel = Column(String, nullable=False)
    variant = Column(String, default="A", nullable=False)  # 'A' or 'B'
    status = Column(String, default="queued")  # queued, sent, delivered, read, opened, clicked, failed, converted
    sent_at = Column(DateTime, nullable=True)
    delivered_at = Column(DateTime, nullable=True)
    read_at = Column(DateTime, nullable=True)
    opened_at = Column(DateTime, nullable=True)
    clicked_at = Column(DateTime, nullable=True)
    converted_at = Column(DateTime, nullable=True)

    campaign = relationship("Campaign", back_populates="communications")
    customer = relationship("Customer", back_populates="communications")

class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    role = Column(String, nullable=False)  # user, assistant
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class ReceiptEvent(Base):
    __tablename__ = "receipt_events"

    id = Column(Integer, primary_key=True, index=True)
    communication_id = Column(Integer, ForeignKey("communications.id"), nullable=False)
    event = Column(String, nullable=False)
    received_at = Column(DateTime, default=datetime.utcnow)

    from sqlalchemy import UniqueConstraint
    __table_args__ = (
        UniqueConstraint('communication_id', 'event', name='_comm_event_uc'),
    )
