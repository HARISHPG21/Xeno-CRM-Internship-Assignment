import os
from datetime import datetime
from sqlalchemy.orm import Session
from .models import Customer

# Standard RFM Segments mapping from FDE spec page 5
RFM_SEGMENTS = {
    (5, 5, 5): "Champions",
    (4, 5, 5): "Champions",
    (5, 4, 4): "Loyal Customers",
    (4, 4, 4): "Loyal Customers",
    (5, 1, 1): "Recent Customers",
    (3, 3, 3): "Potential Loyalists",
    (1, 5, 5): "Can't Lose Them",
    (1, 4, 4): "At Risk",
    (1, 1, 5): "Lost High Value",
    (1, 1, 1): "Lost",
}

def get_closest_segment(r: int, f: int, m: int) -> str:
    """Helper to map any (R,F,M) tuple to the nearest defined segment using Euclidean distance."""
    if (r, f, m) in RFM_SEGMENTS:
        return RFM_SEGMENTS[(r, f, m)]
        
    min_dist = float('inf')
    closest_seg = "Lost"
    for (sr, sf, sm), seg_name in RFM_SEGMENTS.items():
        dist = (r - sr)**2 + (f - sf)**2 + (m - sm)**2
        if dist < min_dist:
            min_dist = dist
            closest_seg = seg_name
    return closest_seg

def calculate_rfm(db: Session):
    """
    Recalculates RFM scores (1-5), maps to segments, and assigns personas 
    for all customers in the database.
    """
    customers = db.query(Customer).all()
    now = datetime.utcnow()

    for customer in customers:
        # 1. Recency Score
        if customer.last_order_date:
            days_inactive = (now - customer.last_order_date).days
        else:
            days_inactive = 365 # Default if no order recorded
            
        if days_inactive <= 14:
            r_score = 5
        elif days_inactive <= 30:
            r_score = 4
        elif days_inactive <= 60:
            r_score = 3
        elif days_inactive <= 180:
            r_score = 2
        else:
            r_score = 1

        # 2. Frequency Score
        orders_count = customer.order_count or 0
        if orders_count == 1:
            f_score = 1
        elif orders_count <= 3:
            f_score = 2
        elif orders_count <= 5:
            f_score = 3
        elif orders_count <= 8:
            f_score = 4
        else:
            f_score = 5

        # 3. Monetary Score
        spend = customer.total_spend or 0.0
        if spend < 500:
            m_score = 1
        elif spend < 1500:
            m_score = 2
        elif spend < 5000:
            m_score = 3
        elif spend < 10000:
            m_score = 4
        else:
            m_score = 5

        # 4. Map to Segment Name
        segment_name = get_closest_segment(r_score, f_score, m_score)

        # 5. Determine Marketing Persona (Deterministic Rule-based fallback matching FDE spec page 6)
        # - VIP Dormants — High historical spend, haven't ordered in 6+ months
        # - Loyal High-Spenders — Gold tier, Champions, order monthly
        # - Lapsed Buyers — Previously active, now At Risk or Lost
        # - New Shoppers — Recent first-timers, low frequency
        # - Bargain Hunters — Frequent but low spend, respond to offers
        
        if spend >= 5000 and days_inactive >= 180:
            persona = "VIP Dormants"
        elif customer.tier == "gold" or segment_name in ["Champions", "Loyal Customers"]:
            persona = "Loyal High-Spenders"
        elif segment_name in ["At Risk", "Lost"]:
            persona = "Lapsed Buyers"
        elif segment_name == "Recent Customers" or (orders_count == 1 and days_inactive <= 30):
            persona = "New Shoppers"
        elif orders_count >= 3 and (spend / orders_count) <= 1200:
            persona = "Bargain Hunters"
        else:
            # Smart fallbacks
            if spend >= 2000:
                persona = "Loyal High-Spenders"
            elif days_inactive <= 60:
                persona = "New Shoppers"
            else:
                persona = "Lapsed Buyers"

        # Save to database record
        customer.rfm_recency = r_score
        customer.rfm_frequency = f_score
        customer.rfm_monetary = m_score
        customer.rfm_segment = segment_name
        customer.persona = persona

    db.commit()
    print(f"[RFM Recalculate] Completed RFM scoring and persona matching for {len(customers)} customers.")
