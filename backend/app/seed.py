import random
import json
from datetime import datetime, timedelta
from faker import Faker
from sqlalchemy.orm import Session
from app.database import engine, Base, SessionLocal
from app.models import Customer, Order, Segment, Campaign, Communication, Message
from app import crud

# Setup Faker with Indian locale
fake = Faker("en_IN")

CITIES = ["Mumbai", "Delhi", "Bengaluru", "Chennai", "Hyderabad", "Pune"]
TIERS = ["bronze", "silver", "gold"]

PRODUCT_CATEGORIES = {
    "fashion": [
        "Slim Fit Denim Jeans", "Classic White Sneaker", "Oversized Cotton Hoodie", 
        "Casual Checked Shirt", "Summer Floral Dress", "Leather Bomber Jacket"
    ],
    "beauty": [
        "Hydrating Matte Lipstick", "Organic Aloe Moisturizer", "Vitamin C Face Serum", 
        "Charcoal Cleansing Scrub", "Longwear Liquid Eyeliner", "Mineral Sunscreen SPF 50"
    ],
    "coffee": [
        "Dark Roast Arabica Beans (500g)", "Medium Roast Ground Coffee (250g)", 
        "Cold Brew Concentrate", "Vanilla Hazelnut Blend", "Pour-Over Coffee Dripper"
    ],
    "electronics": [
        "Wireless Noise-Canceling Earbuds", "Fast Charging Power Bank 10000mAh", 
        "Ergonomic Mechanical Keyboard", "USB-C Multi-Port Hub", "Smart Fitness Tracker"
    ],
    "home": [
        "Aromatic Soy Candle", "Ceramic Flower Vase", "Thread Count Cotton Sheets", 
        "Memory Foam Pillow", "LED Desk Lamp"
    ]
}

def seed_data(db: Session, num_customers: int = 50):
    print("Clearing database tables...")
    db.query(Communication).delete()
    db.query(Campaign).delete()
    db.query(Segment).delete()
    db.query(Order).delete()
    db.query(Customer).delete()
    db.query(Message).delete()
    db.commit()

    print(f"Setting deterministic seed for reproducibility...")
    random.seed(42)
    Faker.seed(42)
    fake.seed_instance(42)

    # We need exactly 50 customers for standard seed
    # Bronze: 25, Silver: 15, Gold: 10
    tiers_list = (["bronze"] * 25) + (["silver"] * 15) + (["gold"] * 10)
    # Ensure they are shuffled deterministically
    random.shuffle(tiers_list)

    # Total orders must equal 200 for standard seed, average 4 per customer
    # Assign order count per customer based on tier to reach exactly 200 orders
    # 10 gold, 15 silver, 25 bronze
    gold_indices = [i for i, t in enumerate(tiers_list) if t == "gold"]
    silver_indices = [i for i, t in enumerate(tiers_list) if t == "silver"]
    bronze_indices = [i for i, t in enumerate(tiers_list) if t == "bronze"]
    
    order_allocations = [0] * 50
    # Gold: 10 customers get orders summing to 75
    gold_orders = [7, 8, 6, 9, 7, 8, 6, 7, 8, 9] 
    for idx, count in zip(gold_indices, gold_orders):
        order_allocations[idx] = count
    # Silver: 15 customers get orders summing to 66
    silver_orders = [4, 5, 4, 5, 4, 4, 5, 4, 5, 4, 4, 5, 4, 4, 5]
    for idx, count in zip(silver_indices, silver_orders):
        order_allocations[idx] = count
    # Bronze: 25 customers get orders summing to 59
    bronze_orders = [2, 3, 2, 2, 3, 2, 3, 2, 2, 3, 2, 3, 2, 2, 3, 2, 2, 3, 2, 2, 3, 2, 2, 3, 2]
    for idx, count in zip(bronze_indices, bronze_orders):
        order_allocations[idx] = count

    # Recency mix: 20% in last 14 days, 30% in 15-60 days, 50% >60 days
    # For 50 customers: 10 active (0-14 days), 15 moderate (15-60 days), 25 dormant (>60 days)
    recency_categories = (["active"] * 10) + (["moderate"] * 15) + (["dormant"] * 25)
    random.shuffle(recency_categories)

    print(f"Generating {num_customers} customers...")
    customers = []
    now = datetime.utcnow()

    for i in range(num_customers):
        name = fake.name()
        email = f"{name.lower().replace(' ', '.')}@example.com"
        phone = f"+91 {random.randint(7, 9)}{random.randint(10000000, 99999999)}"
        # Deterministic city assignment
        city = CITIES[i % len(CITIES)]
        tier = tiers_list[i % len(tiers_list)]

        customer = Customer(
            name=name,
            email=email,
            phone=phone,
            city=city,
            tier=tier,
            total_spend=0.0,
            order_count=0,
            created_at=now - timedelta(days=365)
        )
        db.add(customer)
        customers.append(customer)

    db.commit()  # Flush to get IDs

    print("Generating 200 orders matching price and recency rules...")
    total_orders_created = 0

    for i, customer in enumerate(customers):
        num_orders = order_allocations[i % len(order_allocations)]
        recency = recency_categories[i % len(recency_categories)]
        
        # Calculate target last order date
        if recency == "active":
            last_order_days_ago = random.randint(1, 14)
        elif recency == "moderate":
            last_order_days_ago = random.randint(15, 60)
        else: # dormant
            last_order_days_ago = random.randint(61, 300)

        last_order_date = now - timedelta(days=last_order_days_ago)

        # Generate timestamps for other orders (all older than last order)
        order_dates = [last_order_date]
        for _ in range(num_orders - 1):
            offset_days = random.randint(15, 60)
            order_dates.append(last_order_date - timedelta(days=offset_days))
        
        # Sort so oldest is first
        order_dates.sort()

        total_spend = 0.0
        for order_date in order_dates:
            # Order amount based on customer tier
            if customer.tier == "gold":
                amount = random.randint(2000, 15000)
            elif customer.tier == "silver":
                amount = random.randint(800, 5000)
            else: # bronze
                amount = random.randint(200, 1500)

            # Select product items
            category = random.choice(list(PRODUCT_CATEGORIES.keys()))
            product = random.choice(PRODUCT_CATEGORIES[category])
            items_list = [{"name": product, "category": category, "qty": 1}]

            order = Order(
                customer_id=customer.id,
                amount=amount,
                items=json.dumps(items_list),
                channel=random.choice(["online", "in-store"]),
                status="completed",
                created_at=order_date
            )
            db.add(order)
            total_spend += amount
            total_orders_created += 1

        customer.order_count = num_orders
        customer.total_spend = total_spend
        customer.last_order_date = last_order_date

    db.commit()
    print(f"Database successfully seeded with {len(customers)} customers and {total_orders_created} orders.")

    # Run RFM scoring & Persona assignment for all customers immediately
    from app.rfm import calculate_rfm
    calculate_rfm(db)

    # Pre-seed 4 named segments for instant demo (spec page 21-22)
    print("Pre-seeding FDE spec segments (v2)...")
    
    # 1. VIP Dormants (Can't Lose Them segment)
    seg1 = Segment(
        name="VIP Dormants",
        description="High-value customers who haven't ordered in 90+ days",
        filter_config={"rfm_segment": "Can't Lose Them"},
        created_by="system"
    )
    seg1.customer_count = crud.get_segment_customers_count(db, seg1.filter_config)
    db.add(seg1)

    # 2. At-Risk Champions (At Risk segment and spend > 3000)
    seg2 = Segment(
        name="At-Risk Champions",
        description="Previously loyal, now disengaging",
        filter_config={"rfm_segment": "At Risk", "min_spend": 3000},
        created_by="system"
    )
    seg2.customer_count = crud.get_segment_customers_count(db, seg2.filter_config)
    db.add(seg2)

    # 3. Chennai Gold (city=Chennai, tier=gold)
    seg3 = Segment(
        name="Chennai Gold",
        description="Gold tier customers in Chennai",
        filter_config={"city": "Chennai", "tier": "gold"},
        created_by="system"
    )
    seg3.customer_count = crud.get_segment_customers_count(db, seg3.filter_config)
    db.add(seg3)

    # 4. New High-Potential (Recent Customers segment and spend > 2000)
    seg4 = Segment(
        name="New High-Potential",
        description="New customers with strong first purchase",
        filter_config={"rfm_segment": "Recent Customers", "min_spend": 2000},
        created_by="system"
    )
    seg4.customer_count = crud.get_segment_customers_count(db, seg4.filter_config)
    db.add(seg4)

    db.commit()
    print("Pre-seeded segments created successfully.")

    # Pre-seed some default campaigns for demonstration
    print("Pre-seeding demo campaigns...")
    camp1 = Campaign(
        name="Win Back VIP Dormants",
        segment_id=seg1.id,
        message_template="Hi [Name], we miss you! Use code WELCOMEBACK for 20% off your next purchase: https://xeno.shop/wb",
        is_ab_test=False,
        channel="sms",
        status="draft",
        created_by="system"
    )
    db.add(camp1)

    camp2 = Campaign(
        name="Chennai Gold Exclusive Offer",
        segment_id=seg3.id,
        message_template="Dear [Name], enjoy an exclusive 15% discount at our Chennai store this weekend: https://xeno.shop/chennai",
        message_template_b="Hello [Name], exclusive Chennai Gold rewards await you! Details: https://xeno.shop/rewards",
        is_ab_test=True,
        channel="email",
        status="draft",
        created_by="system"
    )
    db.add(camp2)
    db.commit()
    print("Pre-seeded campaigns created successfully.")


if __name__ == "__main__":
    db = SessionLocal()
    # Create tables
    Base.metadata.create_all(bind=engine)
    seed_data(db)
    db.close()
