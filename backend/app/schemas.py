from pydantic import BaseModel
from datetime import datetime
from typing import List, Dict, Any, Optional

# Customer Schemas
class CustomerBase(BaseModel):
    name: str
    email: str
    phone: str
    city: str
    tier: str
    total_spend: float = 0.0
    order_count: int = 0
    last_order_date: Optional[datetime] = None
    opted_out: bool = False
    rfm_recency: Optional[int] = None
    rfm_frequency: Optional[int] = None
    rfm_monetary: Optional[int] = None
    rfm_segment: Optional[str] = None
    persona: Optional[str] = None

class CustomerCreate(CustomerBase):
    pass

class CustomerResponse(CustomerBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

# Order Schemas
class OrderBase(BaseModel):
    customer_id: int
    amount: float
    items: str
    channel: str
    status: str

class OrderCreate(OrderBase):
    pass

class OrderResponse(OrderBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

# Segment Schemas
class SegmentBase(BaseModel):
    name: str
    description: Optional[str] = None
    filter_config: Dict[str, Any]
    created_by: str = "human"

class SegmentCreate(SegmentBase):
    pass

class SegmentResponse(SegmentBase):
    id: int
    customer_count: int
    created_at: datetime

    class Config:
        from_attributes = True

# Campaign Schemas
class CampaignBase(BaseModel):
    name: str
    segment_id: int
    message_template: str
    message_template_b: Optional[str] = None
    is_ab_test: bool = False
    channel: str  # whatsapp, sms, email, rcs
    scheduled_at: Optional[datetime] = None
    winner_variant: Optional[str] = None
    created_by: str = "human"

class CampaignCreate(CampaignBase):
    pass

class CampaignStats(BaseModel):
    total: int
    queued: int
    sent: int
    delivered: int
    read: int
    opened: int
    clicked: int
    converted: int
    failed: int

class CampaignResponse(CampaignBase):
    id: int
    status: str
    launched_at: Optional[datetime] = None
    created_at: datetime
    stats: Optional[CampaignStats] = None
    stats_a: Optional[CampaignStats] = None
    stats_b: Optional[CampaignStats] = None

    class Config:
        from_attributes = True

# Communication Schemas
class CommunicationBase(BaseModel):
    campaign_id: int
    customer_id: int
    message: str
    channel: str
    variant: str = "A"
    status: str

class CommunicationResponse(CommunicationBase):
    id: int
    sent_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    read_at: Optional[datetime] = None
    opened_at: Optional[datetime] = None
    clicked_at: Optional[datetime] = None
    converted_at: Optional[datetime] = None
    customer: CustomerResponse

    class Config:
        from_attributes = True

# Message Schemas (Chat)
class MessageBase(BaseModel):
    role: str  # user, assistant
    content: str

class MessageCreate(MessageBase):
    pass

class MessageResponse(MessageBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

class ChatRequest(BaseModel):
    message: str
    history: List[MessageBase] = []

class ReceiptPayload(BaseModel):
    communication_id: int
    event: str  # sent, delivered, opened, clicked, failed
    timestamp: datetime

# Customer Detail & Timeline Schemas
class OrderMinimalResponse(BaseModel):
    id: int
    amount: float
    items: str
    channel: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True

class CommunicationMinimalResponse(BaseModel):
    id: int
    message: str
    channel: str
    status: str
    sent_at: Optional[datetime] = None
    converted_at: Optional[datetime] = None
    campaign_name: Optional[str] = None

    class Config:
        from_attributes = True

class CustomerDetailResponse(BaseModel):
    id: int
    name: str
    email: str
    phone: str
    city: str
    tier: str
    total_spend: float
    order_count: int
    last_order_date: Optional[datetime] = None
    opted_out: bool = False
    rfm_recency: Optional[int] = None
    rfm_frequency: Optional[int] = None
    rfm_monetary: Optional[int] = None
    rfm_segment: Optional[str] = None
    persona: Optional[str] = None
    created_at: datetime
    orders: List[OrderMinimalResponse] = []
    communications: List[CommunicationMinimalResponse] = []

    class Config:
        from_attributes = True

