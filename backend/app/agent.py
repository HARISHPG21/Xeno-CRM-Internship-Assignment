import os
import json
import re
from datetime import datetime
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from anthropic import Anthropic
from google import genai
from google.genai import types

from . import crud, models, schemas
from .database import SessionLocal

# Setup Anthropic client if key is available
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
client = Anthropic(api_key=ANTHROPIC_API_KEY) if ANTHROPIC_API_KEY else None

# Setup Gemini client if key is available
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
gemini_client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None


# Helper to run database tools directly from python
class CRMTools:
    @staticmethod
    def create_customer(db: Session, args: Dict[str, Any]) -> Dict[str, Any]:
        cust_in = schemas.CustomerCreate(
            name=args.get("name"),
            email=args.get("email"),
            phone=args.get("phone", ""),
            city=args.get("city", ""),
            tier=args.get("tier", "bronze")
        )
        existing = db.query(models.Customer).filter(models.Customer.email == cust_in.email).first()
        if existing:
            return {"error": "Customer email already exists"}
        cust = crud.create_customer(db, cust_in)
        return {
            "id": cust.id,
            "name": cust.name,
            "email": cust.email,
            "tier": cust.tier
        }

    @staticmethod
    def create_order(db: Session, args: Dict[str, Any]) -> Dict[str, Any]:
        order_in = schemas.OrderCreate(
            customer_id=args.get("customer_id"),
            amount=args.get("amount"),
            items=args.get("items", "[]"),
            channel=args.get("channel", "online"),
            status=args.get("status", "completed")
        )
        customer = db.query(models.Customer).filter(models.Customer.id == order_in.customer_id).first()
        if not customer:
            return {"error": "Customer not found"}
        order = crud.create_order(db, order_in)
        return {
            "id": order.id,
            "customer_id": order.customer_id,
            "amount": order.amount,
            "status": order.status
        }

    @staticmethod
    def preview_segment(db: Session, filter_config: Dict[str, Any]) -> Dict[str, Any]:
        count = crud.get_segment_customers_count(db, filter_config)
        sample_customers = crud.get_segment_customers(db, filter_config, limit=5)
        samples = [{"name": c.name, "city": c.city, "tier": c.tier, "spend": c.total_spend} for c in sample_customers]
        return {
            "customer_count": count,
            "sample_customers": samples
        }

    @staticmethod
    def create_segment(db: Session, name: str, filter_config: Dict[str, Any], description: str = None) -> Dict[str, Any]:
        segment_in = schemas.SegmentCreate(
            name=name,
            description=description or f"AI created segment for: {filter_config}",
            filter_config=filter_config,
            created_by="ai"
        )
        db_segment = crud.create_segment(db, segment_in)
        return {
            "id": db_segment.id,
            "name": db_segment.name,
            "customer_count": db_segment.customer_count,
            "description": db_segment.description
        }

    @staticmethod
    def create_campaign(db: Session, name: str, segment_id: int, message_template: str, channel: str, message_template_b: str = None, is_ab_test: bool = False) -> Dict[str, Any]:
        campaign_in = schemas.CampaignCreate(
            name=name,
            segment_id=segment_id,
            message_template=message_template,
            message_template_b=message_template_b,
            is_ab_test=is_ab_test,
            channel=channel.lower(),
            created_by="ai"
        )
        db_campaign = crud.create_campaign(db, campaign_in)
        return {
            "id": db_campaign.id,
            "name": db_campaign.name,
            "segment_id": db_campaign.segment_id,
            "channel": db_campaign.channel,
            "status": db_campaign.status
        }

    @staticmethod
    def launch_campaign(db: Session, campaign_id: int, channel_service_url: str) -> Dict[str, Any]:
        # Update campaign status to sent/launching
        campaign = crud.get_campaign(db, campaign_id)
        if not campaign:
            return {"error": "Campaign not found"}
        
        campaign.status = "sent"
        campaign.launched_at = datetime.utcnow()
        db.commit()

        # In a real tool, the router calls this launch logic which contacts Channel Service.
        # This function acts as the database hook.
        return {
            "id": campaign.id,
            "name": campaign.name,
            "status": "launched",
            "message": "Campaign launch triggered. Communications are queued."
        }

    @staticmethod
    def get_campaign_stats(db: Session, campaign_id: int) -> Dict[str, Any]:
        stats = crud.get_campaign_stats(db, campaign_id)
        return stats.dict()

    @staticmethod
    def list_campaigns(db: Session) -> List[Dict[str, Any]]:
        campaigns = crud.get_campaigns(db)
        return [{"id": c.id, "name": c.name, "channel": c.channel, "status": c.status} for c in campaigns]

    @staticmethod
    def recommend_channel_and_time(db: Session, segment_id: int, goal: str) -> Dict[str, Any]:
        # Determine channel recommendation and send window based on goal
        if goal == "win-back":
            channel = "whatsapp"
            send_window = "Tuesday 10-12 AM"
            reasoning = "High-risk segments respond best to high-open rate channels like WhatsApp. Mid-morning Tuesday optimizes engagement."
        elif goal == "upsell":
            channel = "rcs"
            send_window = "Friday 4-6 PM"
            reasoning = "RCS rich card layouts are perfect for showcasing product carousels to gold/silver tier shoppers on Friday evenings."
        elif goal == "loyalty":
            channel = "email"
            send_window = "Thursday 2-4 PM"
            reasoning = "Email allows for rich narrative newsletters rewarding loyal shoppers. Mid-afternoon Thursday is a high email open window."
        else:
            channel = "sms"
            send_window = "Wednesday 11 AM"
            reasoning = "Standard announcement campaigns can be sent via cost-effective SMS. Late morning Wednesday ensures high visibility."

        return {
            "segment_id": segment_id,
            "goal": goal,
            "channel": channel,
            "send_window": send_window,
            "reasoning": reasoning
        }

    @staticmethod
    def create_and_launch_campaign(db: Session, name: str, segment_id: int, message_template: str, channel: str) -> Dict[str, Any]:
        # Reuse existing endpoints/crud methods
        campaign_in = schemas.CampaignCreate(
            name=name,
            segment_id=segment_id,
            message_template=message_template,
            channel=channel.lower(),
            created_by="ai"
        )
        db_campaign = crud.create_campaign(db, campaign_in)
        # Note: launching is performed asynchronously. For tool purposes, we update to sent.
        db_campaign.status = "sent"
        db_campaign.launched_at = datetime.utcnow()
        db.commit()
        return {
            "id": db_campaign.id,
            "name": db_campaign.name,
            "status": "launched",
            "message": "Campaign created and immediately queued for dispatch."
        }

    @staticmethod
    def schedule_campaign(db: Session, campaign_id: int, scheduled_at: str) -> Dict[str, Any]:
        # Import scheduler to schedule
        try:
            from .main import scheduler, launch_scheduled_campaign_job
            from datetime import datetime
            
            # Clean string and parse
            dt_str = scheduled_at.replace("Z", "+00:00")
            dt = datetime.fromisoformat(dt_str)
            
            campaign = db.query(models.Campaign).filter(models.Campaign.id == campaign_id).first()
            if not campaign:
                return {"error": "Campaign not found"}
                
            campaign.status = "scheduled"
            campaign.scheduled_at = dt
            db.commit()
            
            if scheduler:
                scheduler.add_job(
                    launch_scheduled_campaign_job,
                    trigger="date",
                    run_date=dt,
                    args=[campaign_id],
                    id=f"campaign_{campaign_id}",
                    replace_existing=True
                )
            else:
                print(f"[Vercel Serverless] Mocking campaign schedule from AI Agent for ID {campaign_id} at {dt}")
            return {
                "campaign_id": campaign_id,
                "scheduled_at": scheduled_at,
                "status": "scheduled",
                "message": f"Successfully registered background schedule task for {dt.isoformat()}"
            }
        except Exception as e:
            return {"error": f"Failed to schedule: {str(e)}"}

    @staticmethod
    def create_ab_campaign(db: Session, name: str, segment_id: int, message_template: str, message_template_b: str, channel: str) -> Dict[str, Any]:
        campaign_in = schemas.CampaignCreate(
            name=name,
            segment_id=segment_id,
            message_template=message_template,
            message_template_b=message_template_b,
            is_ab_test=True,
            channel=channel.lower(),
            created_by="ai"
        )
        db_campaign = crud.create_campaign(db, campaign_in)
        return {
            "id": db_campaign.id,
            "name": db_campaign.name,
            "is_ab_test": True,
            "status": "draft"
        }

    @staticmethod
    def analyse_campaign(db: Session, campaign_id: int) -> Dict[str, Any]:
        from .main import analyse_campaign_results
        try:
            res = analyse_campaign_results(campaign_id, db)
            return res
        except Exception as e:
            return {"error": f"Analysis failed: {str(e)}"}

    @staticmethod
    def get_rfm_overview(db: Session) -> Dict[str, Any]:
        # Count customers per rfm_segment
        from sqlalchemy import func
        res = db.query(models.Customer.rfm_segment, func.count(models.Customer.id)).group_by(models.Customer.rfm_segment).all()
        return {segment or "Unknown": count for segment, count in res}

    @staticmethod
    def list_personas(db: Session) -> List[Dict[str, Any]]:
        # Count customers per persona
        from sqlalchemy import func
        res = db.query(models.Customer.persona, func.count(models.Customer.id)).group_by(models.Customer.persona).all()
        return [{"persona": p or "New Shoppers", "count": count} for p, count in res]

    @staticmethod
    def suggest_message(tone: str, offer: str, channel: str) -> Dict[str, str]:
        templates = {
            "whatsapp": {
                "option_a": "Hey *{name}*! 👋 We noticed you haven't visited us in a bit. We miss you! Here's a special *{offer}* just for you on your next order. Valid this week only! Use code XENO10. shop here: xeno.in/10",
                "option_b": "🚨 *LIMITED TIME OFFER* 🚨 Hey *{name}*, don't miss out! Get *{offer}* off on your favorite products. Complete your purchase within 24 hours to use code RUSH15. xeno.in/rush"
            },
            "sms": {
                "option_a": "Hi {name}! Missed you. Get {offer} off on your next purchase at Xeno! Use code XENO10. Shop now: xeno.in/10",
                "option_b": "Hurry {name}! Your {offer} coupon is expiring soon. Use code RUSH15 at checkout today: xeno.in/rush"
            },
            "email": {
                "option_a": "Subject: We miss you, {name}! ❤️ Here's {offer} off...\n\nHey {name},\n\nIt's been a while since your last purchase! We wanted to check in and see how you are doing. To welcome you back, here is a special offer: {offer} off your next order. Just use the coupon code XENO10 at checkout.\n\nCheers,\nThe Xeno Team",
                "option_b": "Subject: Urgent: {name}, your {offer} welcome back discount is expiring!\n\nDear {name},\n\nThis is a quick reminder that you have an unused {offer} voucher waiting in your account. This discount will expire in 48 hours. Use code RUSH15 at checkout to claim it now.\n\nWarm regards,\nThe Xeno Team"
            },
            "rcs": {
                "option_a": "Hey {name}! 🌟 Missed shopping with us? Enjoy {offer} off on your next purchase. Valid this week only. Code: XENO10. Click to shop: xeno.in/10",
                "option_b": "🔥 FLASH SALE! 🔥 Hello {name}, get an extra {offer} off. Offer expires tonight at midnight! Use code RUSH15. View catalog: xeno.in/10"
            }
        }
        return templates.get(channel.lower(), templates["whatsapp"])

# Tools shared by both Claude and Gemini agent paths
CRM_AGENT_TOOLS = [
    {
        "name": "create_customer",
        "description": "Create a new customer profile. Use this when the marketer asks to add a customer or create a shopper profile.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Full name of the customer"},
                "email": {"type": "string", "description": "Email address of the customer"},
                "phone": {"type": "string", "description": "Phone number, e.g. '+91 9876543210'"},
                "city": {"type": "string", "description": "City of residence"},
                "tier": {"type": "string", "enum": ["bronze", "silver", "gold"], "description": "Customer tier"}
            },
            "required": ["name", "email"]
        }
    },
    {
        "name": "create_order",
        "description": "Create a new order for an existing customer. This automatically updates their total spend and order count aggregates.",
        "input_schema": {
            "type": "object",
            "properties": {
                "customer_id": {"type": "integer", "description": "ID of the customer placing the order"},
                "amount": {"type": "number", "description": "The order price/amount"},
                "items": {"type": "string", "description": "JSON string containing order items, e.g. '[{\"name\": \"Product\", \"qty\": 1}]'"},
                "channel": {"type": "string", "description": "Order sales channel (e.g. online, retail)"},
                "status": {"type": "string", "description": "Status of the order (completed, returned)"}
            },
            "required": ["customer_id", "amount"]
        }
    },
    {
        "name": "preview_segment",
        "description": "Preview a segment matching filters, returning the number of customers and sample names. Use this when the marketer asks for a count or to see a list before creating a segment.",
        "input_schema": {
            "type": "object",
            "properties": {
                "filter_config": {
                    "type": "object",
                    "description": "Dynamic filter parameters including 'tier' (bronze/silver/gold), 'city' (string), 'min_spend' (number), 'max_spend' (number), 'min_orders' (number), and 'inactive_days' (number of days of no orders).",
                    "properties": {
                        "tier": {"type": "string", "enum": ["bronze", "silver", "gold"]},
                        "city": {"type": "string"},
                        "min_spend": {"type": "number"},
                        "max_spend": {"type": "number"},
                        "min_orders": {"type": "number"},
                        "inactive_days": {"type": "number"}
                    }
                }
            },
            "required": ["filter_config"]
        }
    },
    {
        "name": "create_segment",
        "description": "Create and save a segment configuration into the database.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Descriptive name for the segment, e.g. 'High Spenders in Delhi'"},
                "description": {"type": "string", "description": "Brief description of who matches this segment"},
                "filter_config": {
                    "type": "object",
                    "properties": {
                        "tier": {"type": "string"},
                        "city": {"type": "string"},
                        "min_spend": {"type": "number"},
                        "max_spend": {"type": "number"},
                        "min_orders": {"type": "number"},
                        "inactive_days": {"type": "number"}
                    }
                }
            },
            "required": ["name", "filter_config"]
        }
    },
    {
        "name": "create_campaign",
        "description": "Create a marketing campaign with a name, message, and target segment. Can support A/B testing by providing an optional second message copy.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "A campaign name, e.g. 'Gold Members WhatsApp Winback'"},
                "segment_id": {"type": "integer", "description": "ID of the segment to target"},
                "message_template": {"type": "string", "description": "Personalized message template containing variables like {name} and {offer}"},
                "message_template_b": {"type": "string", "description": "Optional second message template copy for A/B testing"},
                "is_ab_test": {"type": "boolean", "description": "Set to True if this campaign includes A/B testing message copy templates"},
                "channel": {"type": "string", "enum": ["whatsapp", "sms", "email", "rcs"], "description": "The communications channel"}
            },
            "required": ["name", "segment_id", "message_template", "channel"]
        }
    },
    {
        "name": "launch_campaign",
        "description": "Triggers immediate sending of campaign communications. MUST be called only after a campaign has been created.",
        "input_schema": {
            "type": "object",
            "properties": {
                "campaign_id": {"type": "integer", "description": "The ID of the campaign to launch"}
            },
            "required": ["campaign_id"]
        }
    },
    {
        "name": "suggest_message",
        "description": "Generate a personalized message copy structure using a tone, channel, and discount offer.",
        "input_schema": {
            "type": "object",
            "properties": {
                "tone": {"type": "string", "enum": ["personal", "professional"]},
                "offer": {"type": "string", "description": "The coupon/offer value, e.g. '10% off' or '₹500 discount'"},
                "channel": {"type": "string", "enum": ["whatsapp", "sms", "email", "rcs"]}
            },
            "required": ["tone", "offer", "channel"]
        }
    },
    {
        "name": "get_campaign_stats",
        "description": "Fetch real-time delivery and engagement counts (queued, sent, opened, clicked, failed) for a launched campaign.",
        "input_schema": {
            "type": "object",
            "properties": {
                "campaign_id": {"type": "integer"}
            },
            "required": ["campaign_id"]
        }
    },
    {
        "name": "list_campaigns",
        "description": "Get a list of all existing campaigns in the system.",
        "input_schema": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "name": "recommend_channel_and_time",
        "description": "Recommend the best messaging channel and optimal send window based on segment details and campaign goal.",
        "input_schema": {
            "type": "object",
            "properties": {
                "segment_id": {"type": "integer", "description": "ID of the target customer segment"},
                "goal": {"type": "string", "enum": ["win-back", "upsell", "loyalty", "general"], "description": "Goal of the campaign"}
            },
            "required": ["segment_id", "goal"]
        }
    },
    {
        "name": "create_and_launch_campaign",
        "description": "Create a marketing campaign and launch it immediately.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Name of the campaign"},
                "segment_id": {"type": "integer", "description": "ID of the target customer segment"},
                "message_template": {"type": "string", "description": "Personalized message template"},
                "channel": {"type": "string", "enum": ["whatsapp", "sms", "email", "rcs"], "description": "Messaging channel"}
            },
            "required": ["name", "segment_id", "message_template", "channel"]
        }
    },
    {
        "name": "schedule_campaign",
        "description": "Schedule a campaign for background dispatch at a future time.",
        "input_schema": {
            "type": "object",
            "properties": {
                "campaign_id": {"type": "integer", "description": "ID of the campaign to schedule"},
                "scheduled_at": {"type": "string", "description": "ISO-8601 formatted datetime string when the campaign should be dispatched, e.g. '2026-06-15T10:00:00Z'"}
            },
            "required": ["campaign_id", "scheduled_at"]
        }
    },
    {
        "name": "create_ab_campaign",
        "description": "Create an A/B test campaign with two variants of message templates.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Name of the campaign"},
                "segment_id": {"type": "integer", "description": "ID of the target customer segment"},
                "message_template": {"type": "string", "description": "Message template variant A"},
                "message_template_b": {"type": "string", "description": "Message template variant B"},
                "channel": {"type": "string", "enum": ["whatsapp", "sms", "email", "rcs"], "description": "Messaging channel"}
            },
            "required": ["name", "segment_id", "message_template", "message_template_b", "channel"]
        }
    },
    {
        "name": "analyse_campaign",
        "description": "Analyse the delivery and conversion results of a launched campaign, including A/B test comparison if applicable.",
        "input_schema": {
            "type": "object",
            "properties": {
                "campaign_id": {"type": "integer", "description": "ID of the campaign to analyze"}
            },
            "required": ["campaign_id"]
        }
    },
    {
        "name": "get_rfm_overview",
        "description": "Get an overview count of customers in each RFM segment.",
        "input_schema": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "name": "list_personas",
        "description": "List all dynamic AI marketing personas and the count of customers associated with each.",
        "input_schema": {
            "type": "object",
            "properties": {}
        }
    }
]

# Real LLM Agent Execution using Claude tool calling
async def run_llm_agent(db: Session, message: str, history: List[Dict[str, str]], channel_service_url: str) -> str:
    tools = CRM_AGENT_TOOLS


    messages = []
    # Convert history format to Anthropic's expected list
    for h in history:
        messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": message})

    system_prompt = (
        "You are Xeno, the intelligent AI Agent for Xeno Mini CRM. "
        "Your task is to help the marketer segment shoppers, draft messages, and launch campaigns. "
        "Be conversational and professional. Always use tool calling when performing actions or pulling customer/campaign info. "
        "Explain tool outputs in simple markdown. Under the hood, you have full access to CRM tools."
    )

    response = client.messages.create(
        model="claude-3-5-sonnet-20241022",
        max_tokens=4000,
        system=system_prompt,
        tools=tools,
        messages=messages
    )

    content_blocks = response.content
    tool_use = None
    text_response = ""

    for block in content_blocks:
        if block.type == "text":
            text_response += block.text
        elif block.type == "tool_use":
            tool_use = block

    if not tool_use:
        return text_response

    # Execute tool
    tool_name = tool_use.name
    tool_args = tool_use.input_amount if hasattr(tool_use, 'input_amount') else tool_use.input
    tool_result = {}

    try:
        if tool_name == "create_customer":
            tool_result = CRMTools.create_customer(db, tool_args)
        elif tool_name == "create_order":
            tool_result = CRMTools.create_order(db, tool_args)
        elif tool_name == "preview_segment":
            tool_result = CRMTools.preview_segment(db, tool_args.get("filter_config"))
        elif tool_name == "create_segment":
            tool_result = CRMTools.create_segment(db, tool_args.get("name"), tool_args.get("filter_config"), tool_args.get("description"))
        elif tool_name == "create_campaign":
            tool_result = CRMTools.create_campaign(
                db, 
                tool_args.get("name"), 
                tool_args.get("segment_id"), 
                tool_args.get("message_template"), 
                tool_args.get("channel"),
                message_template_b=tool_args.get("message_template_b"),
                is_ab_test=tool_args.get("is_ab_test", False)
            )
        elif tool_name == "launch_campaign":
            # Real launch is handled by the main application router trigger, but we update database state here
            tool_result = CRMTools.launch_campaign(db, tool_args.get("campaign_id"), channel_service_url)
        elif tool_name == "suggest_message":
            msg = CRMTools.suggest_message(tool_args.get("tone"), tool_args.get("offer"), tool_args.get("channel"))
            tool_result = {"suggested_message": msg}
        elif tool_name == "get_campaign_stats":
            tool_result = CRMTools.get_campaign_stats(db, tool_args.get("campaign_id"))
        elif tool_name == "list_campaigns":
            tool_result = CRMTools.list_campaigns(db)
        elif tool_name == "recommend_channel_and_time":
            tool_result = CRMTools.recommend_channel_and_time(db, tool_args.get("segment_id"), tool_args.get("goal"))
        elif tool_name == "create_and_launch_campaign":
            tool_result = CRMTools.create_and_launch_campaign(db, tool_args.get("name"), tool_args.get("segment_id"), tool_args.get("message_template"), tool_args.get("channel"))
        elif tool_name == "schedule_campaign":
            tool_result = CRMTools.schedule_campaign(db, tool_args.get("campaign_id"), tool_args.get("scheduled_at"))
        elif tool_name == "create_ab_campaign":
            tool_result = CRMTools.create_ab_campaign(db, tool_args.get("name"), tool_args.get("segment_id"), tool_args.get("message_template"), tool_args.get("message_template_b"), tool_args.get("channel"))
        elif tool_name == "analyse_campaign":
            tool_result = CRMTools.analyse_campaign(db, tool_args.get("campaign_id"))
        elif tool_name == "get_rfm_overview":
            tool_result = CRMTools.get_rfm_overview(db)
        elif tool_name == "list_personas":
            tool_result = CRMTools.list_personas(db)
    except Exception as e:
        tool_result = {"error": str(e)}

    # Send the tool output back to the LLM to get the final conversational response
    follow_up_messages = messages + [
        {
            "role": "assistant",
            "content": content_blocks
        },
        {
            "role": "user",
            "content": [
                {
                    "type": "tool_result",
                    "tool_use_id": tool_use.id,
                    "content": json.dumps(tool_result)
                }
            ]
        }
    ]

    final_response = client.messages.create(
        model="claude-3-5-sonnet-20241022",
        max_tokens=2000,
        system=system_prompt,
        tools=tools,
        messages=follow_up_messages
    )

    final_text = ""
    for block in final_response.content:
        if block.type == "text":
            final_text += block.text
            
    # Include tool call traces in return response for UI inspection
    trace = f"\n\n⚙️ **Tool Executed:** `{tool_name}`\n👉 **Arguments:** `{json.dumps(tool_args)}`\n📊 **Result:** `{json.dumps(tool_result)}`"
    return final_text + trace


# Real LLM Agent Execution using Gemini tool calling
async def run_gemini_agent(db: Session, message: str, history: List[Dict[str, str]], channel_service_url: str) -> str:
    # 1. Map CRM_AGENT_TOOLS to Gemini-compatible tools
    gemini_functions = []
    for tool in CRM_AGENT_TOOLS:
        gemini_functions.append(
            types.FunctionDeclaration(
                name=tool["name"],
                description=tool["description"],
                parametersJsonSchema=tool["input_schema"]
            )
        )
    gemini_tools = [types.Tool(function_declarations=gemini_functions)]

    # 2. Build history contents
    contents = []
    for h in history:
        role = "model" if h["role"] == "assistant" else "user"
        contents.append(
            types.Content(
                role=role,
                parts=[types.Part.from_text(text=h["content"])]
            )
        )
    contents.append(
        types.Content(
            role="user",
            parts=[types.Part.from_text(text=message)]
        )
    )

    system_prompt = (
        "You are Xeno, the intelligent AI Agent for Xeno Mini CRM. "
        "Your task is to help the marketer segment shoppers, draft messages, and launch campaigns. "
        "Be conversational and professional. Always use tool calling when performing actions or pulling customer/campaign info. "
        "Explain tool outputs in simple markdown. Under the hood, you have full access to CRM tools."
    )

    # 3. Call Gemini
    response = gemini_client.models.generate_content(
        model="gemini-2.5-flash",
        contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            tools=gemini_tools,
        )
    )

    function_calls = response.function_calls
    text_response = response.text or ""

    if not function_calls:
        return text_response

    # Execute the first function call
    tool_use = function_calls[0]
    tool_name = tool_use.name
    tool_args = tool_use.args or {}
    tool_result = {}

    try:
        if tool_name == "create_customer":
            tool_result = CRMTools.create_customer(db, tool_args)
        elif tool_name == "create_order":
            tool_result = CRMTools.create_order(db, tool_args)
        elif tool_name == "preview_segment":
            tool_result = CRMTools.preview_segment(db, tool_args.get("filter_config"))
        elif tool_name == "create_segment":
            tool_result = CRMTools.create_segment(db, tool_args.get("name"), tool_args.get("filter_config"), tool_args.get("description"))
        elif tool_name == "create_campaign":
            tool_result = CRMTools.create_campaign(
                db, 
                tool_args.get("name"), 
                tool_args.get("segment_id"), 
                tool_args.get("message_template"), 
                tool_args.get("channel"),
                message_template_b=tool_args.get("message_template_b"),
                is_ab_test=tool_args.get("is_ab_test", False)
            )
        elif tool_name == "launch_campaign":
            tool_result = CRMTools.launch_campaign(db, tool_args.get("campaign_id"), channel_service_url)
        elif tool_name == "suggest_message":
            msg = CRMTools.suggest_message(tool_args.get("tone"), tool_args.get("offer"), tool_args.get("channel"))
            tool_result = {"suggested_message": msg}
        elif tool_name == "get_campaign_stats":
            tool_result = CRMTools.get_campaign_stats(db, tool_args.get("campaign_id"))
        elif tool_name == "list_campaigns":
            tool_result = CRMTools.list_campaigns(db)
        elif tool_name == "recommend_channel_and_time":
            tool_result = CRMTools.recommend_channel_and_time(db, tool_args.get("segment_id"), tool_args.get("goal"))
        elif tool_name == "create_and_launch_campaign":
            tool_result = CRMTools.create_and_launch_campaign(db, tool_args.get("name"), tool_args.get("segment_id"), tool_args.get("message_template"), tool_args.get("channel"))
        elif tool_name == "schedule_campaign":
            tool_result = CRMTools.schedule_campaign(db, tool_args.get("campaign_id"), tool_args.get("scheduled_at"))
        elif tool_name == "create_ab_campaign":
            tool_result = CRMTools.create_ab_campaign(db, tool_args.get("name"), tool_args.get("segment_id"), tool_args.get("message_template"), tool_args.get("message_template_b"), tool_args.get("channel"))
        elif tool_name == "analyse_campaign":
            tool_result = CRMTools.analyse_campaign(db, tool_args.get("campaign_id"))
        elif tool_name == "get_rfm_overview":
            tool_result = CRMTools.get_rfm_overview(db)
        elif tool_name == "list_personas":
            tool_result = CRMTools.list_personas(db)
    except Exception as e:
        tool_result = {"error": str(e)}

    # Send the tool output back to the LLM to get the final conversational response
    model_content = types.Content(
        role="model",
        parts=[types.Part.from_function_call(name=tool_use.name, args=tool_use.args)]
    )
    tool_content = types.Content(
        role="tool",
        parts=[types.Part.from_function_response(name=tool_name, response={"result": tool_result})]
    )

    follow_up_contents = contents + [model_content, tool_content]

    final_response = gemini_client.models.generate_content(
        model="gemini-2.5-flash",
        contents=follow_up_contents,
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            tools=gemini_tools,
        )
    )

    final_text = final_response.text or ""

    # Include tool call traces in return response for UI inspection
    trace = f"\n\n⚙️ **Tool Executed:** `{tool_name}`\n👉 **Arguments:** `{json.dumps(tool_args)}`\n📊 **Result:** `{json.dumps(tool_result)}`"
    return final_text + trace


# Rule-Based / Smart Regex Fallback Agent (Runs if no Anthropic API key is found)
def run_regex_fallback_agent(db: Session, message: str, history: List[Dict[str, str]], channel_service_url: str) -> str:
    msg_lower = message.lower()
    
    # Check if this is a Customer Ingestion request
    # Example: "add customer name: Jane Miller, email: jane.miller@example.com, city: Mumbai, tier: silver"
    if "add customer" in msg_lower or "create customer" in msg_lower or "new customer" in msg_lower:
        email_match = re.search(r'email:\s*([a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)', msg_lower)
        name_match = re.search(r'name:\s*([^,\n]+)', message, re.IGNORECASE)
        phone_match = re.search(r'phone:\s*([^,\n]+)', message, re.IGNORECASE)
        city_match = re.search(r'city:\s*([^,\n]+)', message, re.IGNORECASE)
        tier_match = re.search(r'tier:\s*([^,\n]+)', message, re.IGNORECASE)
        
        if not name_match:
            name_match = re.search(r'(?:customer|name)\s+([^,\n]+)', message, re.IGNORECASE)
            
        name = name_match.group(1).strip() if name_match else "Unknown Shopper"
        email = email_match.group(1).strip() if email_match else f"{name.lower().replace(' ', '.')}@example.com"
        phone = phone_match.group(1).strip() if phone_match else "+91 9999999999"
        city = city_match.group(1).strip() if city_match else "Mumbai"
        tier = tier_match.group(1).strip().lower() if tier_match else "bronze"
        if tier not in ["bronze", "silver", "gold"]:
            tier = "bronze"
            
        args = {"name": name, "email": email, "phone": phone, "city": city, "tier": tier}
        res = CRMTools.create_customer(db, args)
        
        if "error" in res:
            response = f"❌ **Error creating customer**: {res['error']}"
        else:
            response = (
                f"👤 **Customer Profile Created!**\n\n"
                f"Shopper **\"{res['name']}\"** has been successfully registered in the database.\n"
                f"- 📧 **Email**: {res['email']}\n"
                f"- 🏷️ **Tier**: {res['tier'].upper()}\n"
                f"- 🆔 **Customer ID**: `{res['id']}`"
            )
        trace = f"\n\n⚙️ **Tool Executed:** `create_customer`\n👉 **Arguments:** `{json.dumps(args)}`\n📊 **Result:** `{json.dumps(res)}`"
        return response + trace

    # Check if this is an Order Ingestion request
    # Example: "add order for customer: 5, amount: 2500"
    if "add order" in msg_lower or "create order" in msg_lower or "new order" in msg_lower:
        cust_id_match = re.search(r'(?:customer|customer_id|id):\s*(\d+)', msg_lower)
        amount_match = re.search(r'(?:amount|price|value):\s*(\d+(?:\.\d+)?)', msg_lower)
        channel_match = re.search(r'(?:channel):\s*([^,\n]+)', message, re.IGNORECASE)
        items_match = re.search(r'(?:items):\s*([^,\n]+)', message, re.IGNORECASE)
        
        if not cust_id_match:
            cust_id_match = re.search(r'(?:customer|id)\s+(\d+)', msg_lower)
        if not amount_match:
            amount_match = re.search(r'(?:amount|value)\s+(\d+(?:\.\d+)?)', msg_lower)
            
        customer_id = int(cust_id_match.group(1)) if cust_id_match else None
        amount = float(amount_match.group(1)) if amount_match else 0.0
        channel = channel_match.group(1).strip() if channel_match else "online"
        items_str = items_match.group(1).strip() if items_match else '[{"name": "General Purchase", "qty": 1}]'
        
        if not customer_id:
            return "Before recording an order, please specify the target Customer ID (e.g. *'add order for customer 5, amount 1500'*)."
            
        args = {"customer_id": customer_id, "amount": amount, "items": items_str, "channel": channel}
        res = CRMTools.create_order(db, args)
        
        if "error" in res:
            response = f"❌ **Error recording order**: {res['error']}"
        else:
            response = (
                f"🛍️ **Order Successfully Ingested!**\n\n"
                f"Recorded Order ID `{res['id']}` for Customer ID `{res['customer_id']}`.\n"
                f"- 💸 **Order Amount**: ₹{res['amount']:.2f}\n"
                f"- 📊 **Status**: {res['status'].upper()}\n\n"
                f"The shopper's aggregate lifetime spend and order count have been dynamically updated in real time."
            )
        trace = f"\n\n⚙️ **Tool Executed:** `create_order`\n👉 **Arguments:** `{json.dumps(args)}`\n📊 **Result:** `{json.dumps(res)}`"
        return response + trace
    
    # Check if this is the start of a segmentation query
    # Example: "I want to re-engage customers who spent over 5000 but haven't ordered in 90 days"
    # Or "spend over 5000", "inactive 3 months" etc.
    spend_match = re.search(r'(?:spent|spend|spenders|amount)\s*(?:over|>|>=|more than|above)?\s*₹?\s*(\d+)', msg_lower)
    inactive_match = re.search(r'(?:inactive|no orders|haven\'t ordered|quiet)\s*(?:for)?\s*(\d+)\s*(days|months|year)', msg_lower)
    tier_match = re.search(r'\b(gold|silver|bronze)\b', msg_lower)
    city_match = re.search(r'\b(mumbai|delhi|bengluru|bengaluru|chennai|hyderabad|pune)\b', msg_lower)

    # 1. SEGMENTATION AND PREVIEW STEP
    if spend_match or inactive_match or tier_match or city_match:
        filter_config = {}
        desc_parts = []
        
        if spend_match:
            min_spend = int(spend_match.group(1))
            filter_config["min_spend"] = min_spend
            desc_parts.append(f"spent over ₹{min_spend}")
            
        if inactive_match:
            val = int(inactive_match.group(1))
            unit = inactive_match.group(2)
            days = val * 30 if "month" in unit else (val * 365 if "year" in unit else val)
            filter_config["inactive_days"] = days
            desc_parts.append(f"inactive for {days} days")
            
        if tier_match:
            tier = tier_match.group(1)
            filter_config["tier"] = tier
            desc_parts.append(f"{tier.capitalize()} tier")
            
        if city_match:
            city = city_match.group(1).capitalize()
            # Fix spelling variation
            if city == "Bengluru":
                city = "Bengaluru"
            filter_config["city"] = city
            desc_parts.append(f"in {city}")

        preview = CRMTools.preview_segment(db, filter_config)
        count = preview["customer_count"]
        samples = ", ".join([s["name"] for s in preview["sample_customers"]])

        # Recommend Channel based on Segment Criteria
        # Premium recommendations for high spenders / gold tier
        if filter_config.get("tier") == "gold" or filter_config.get("min_spend", 0) >= 5000:
            rec_channel = "RCS"
            rec_reason = "This premium segment has high lifetime spending. Sending via RCS enables rich card carousels and verified sender branding for maximum engagement."
        else:
            rec_channel = "WhatsApp"
            rec_reason = "This audience has standard ticket values. Sending via WhatsApp ensures optimal open rates (98%) at minimal operational costs."

        # Auto-create segment to avoid manual lookup steps, saving state in SessionLocal
        seg_name = f"Segment: " + " & ".join(desc_parts)
        seg_res = CRMTools.create_segment(db, seg_name, filter_config)
        
        # Suggesting next action: draft a message
        channel = rec_channel.lower()
        
        response = (
            f"🔍 **Analysis complete!**\n\n"
            f"I found **{count} customers** matching this criteria: *{', '.join(desc_parts)}*.\n"
            f"Some representative shoppers: *{samples}*.\n\n"
            f"✅ I have automatically created the segment: **\"{seg_name}\"** (ID: `{seg_res['id']}`).\n\n"
            f"💡 **AI Channel Recommendation**: I recommend using **{rec_channel}** for this segment.\n"
            f"📝 *Reason*: {rec_reason}\n\n"
            f"Shall I draft a personalized **{rec_channel}** message for these {count} customers? "
            f"Just tell me what offer or discount you'd like to include (e.g. *'10% off'*, *'₹500 voucher'*)."
        )
        trace = f"\n\n⚙️ **Tool Executed:** `create_segment`\n👉 **Arguments:** `{json.dumps({'name': seg_name, 'filter_config': filter_config})}`\n📊 **Result:** `Created segment ID {seg_res['id']} with {count} customers`"
        return response + trace

    # 2. SUGGEST MESSAGE AND DRAFT CAMPAIGN STEP
    # Example: "Yes, make it personal and offer 10% off"
    offer_match = re.search(r'(\d+%\s*off|₹\d+|discount\s*of\s*\d+|coupon|voucher)', msg_lower)
    if offer_match or "draft" in msg_lower or "message" in msg_lower or "offer" in msg_lower:
        offer = offer_match.group(1) if offer_match else "10% off"
        
        # Look up last created segment to connect it
        last_seg = db.query(models.Segment).order_by(models.Segment.created_at.desc()).first()
        if not last_seg:
            return (
                "Before I can draft a message, let's build the customer audience first. "
                "For example, you can say: *'I want to reach customers who spent over ₹5000'*"
            )

        # Detect channel (whatsapp, sms, email, rcs)
        channel = "whatsapp"
        for ch in ["whatsapp", "sms", "email", "rcs"]:
            if ch in msg_lower:
                channel = ch
                break
        else:
            # Fallback to recommended channel of segment
            if "gold" in last_seg.name or "spend over 5000" in last_seg.name:
                channel = "rcs"

        # Suggest templates for A/B Testing
        msg_options = CRMTools.suggest_message("personal", offer, channel)

        # Auto-create campaign in draft status using Option A as default
        campaign_name = f"Campaign - {last_seg.name} ({offer})"
        camp_res = CRMTools.create_campaign(db, campaign_name, last_seg.id, msg_options["option_a"], channel, message_template_b=msg_options["option_b"], is_ab_test=True)

        response = (
            f"✍️ **A/B Test Copy Options Created!**\n\n"
            f"Here are two personalized drafts for your campaign (targeting **{last_seg.name}**):\n\n"
            f"🅰️ **Option A (Friendly & Casual):**\n"
            f"```text\n{msg_options['option_a']}\n```\n"
            f"🅱️ **Option B (Urgent / FOMO):**\n"
            f"```text\n{msg_options['option_b']}\n```\n"
            f"📂 Draft A/B campaign **\"{campaign_name}\"** is configured (ID: `{camp_res['id']}`).\n\n"
            f"Should I launch it? You can say *'Launch Option A'* or *'Launch Option B'*."
        )
        trace = f"\n\n⚙️ **Tool Executed:** `create_campaign`\n👉 **Arguments:** `{json.dumps({'name': campaign_name, 'segment_id': last_seg.id, 'channel': channel})}`\n📊 **Result:** `Created draft campaign ID {camp_res['id']} with A/B options`"
        return response + trace

    # 3. LAUNCH CAMPAIGN STEP
    # Example: "Yes, launch it" or "Send it" or "Launch Option B"
    if "launch" in msg_lower or "send" in msg_lower or "confirm" in msg_lower:
        # Get last draft campaign
        last_camp = db.query(models.Campaign).filter(models.Campaign.status == "draft").order_by(models.Campaign.created_at.desc()).first()
        if not last_camp:
            return (
                "I couldn't find any draft campaign ready to launch. "
                "Let's create a segment first, draft a message, and then launch it."
            )

        # Handle Option B selection
        option_desc = "Option A"
        if "option b" in msg_lower:
            option_desc = "Option B"
            # Extract offer value from name if possible
            offer_val = "10% off"
            if "(" in last_camp.name:
                parts = last_camp.name.split("(")
                offer_val = parts[1].replace(")", "")
            # Regenerate templates and assign Option B
            msg_options = CRMTools.suggest_message("personal", offer_val, last_camp.channel)
            last_camp.message_template = msg_options["option_b"]
            db.commit()

        # The actual campaign trigger is called asynchronously by the main FastAPI endpoint.
        # But we report what happens.
        response = (
            f"🚀 **Campaign Launched ({option_desc})!**\n\n"
            f"I have triggered the launch for campaign **\"{last_camp.name}\"** (ID: `{last_camp.id}`) using **{option_desc}**.\n\n"
            f"The communications are now queued. Check the *Campaigns* tab to see the live delivery callbacks update in real time!"
        )
        trace = f"\n\n⚙️ **Tool Executed:** `launch_campaign`\n👉 **Arguments:** `{json.dumps({'campaign_id': last_camp.id, 'ab_version': option_desc})}`\n📊 **Result:** `Campaign ID {last_camp.id} queued for send`"
        return response + trace

    # 4. STATS STEP
    # Example: "how is my campaign doing?" or "campaign stats"
    if "stat" in msg_lower or "report" in msg_lower or "performance" in msg_lower:
        last_camp = db.query(models.Campaign).order_by(models.Campaign.created_at.desc()).first()
        if not last_camp:
            return "No campaigns have been created yet."
            
        stats = CRMTools.get_campaign_stats(db, last_camp.id)
        response = (
            f"📊 **Campaign Performance Report**\n\n"
            f"Campaign: **\"{last_camp.name}\"** (ID: `{last_camp.id}`)\n"
            f"Status: `{last_camp.status.upper()}`\n\n"
            f"- 📦 **Total Audience**: {stats['total']}\n"
            f"- 🕒 **Queued**: {stats['queued']}\n"
            f"- 📨 **Sent**: {stats['sent']}\n"
            f"- ✅ **Delivered**: {stats['delivered']}\n"
            f"- 👁️ **Opened**: {stats['opened']}\n"
            f"- 🖱️ **Clicked**: {stats['clicked']}\n"
            f"- ❌ **Failed**: {stats['failed']}\n"
        )
        trace = f"\n\n⚙️ **Tool Executed:** `get_campaign_stats`\n👉 **Arguments:** `{json.dumps({'campaign_id': last_camp.id})}`\n📊 **Result:** `{json.dumps(stats)}`"
        return response + trace

    # Default fallback welcome message
    return (
        "Hi! I'm Xeno, your AI CRM Agent. I can help you reach shoppers intelligently. "
        "Here are things you can tell me:\n\n"
        "- *'I want to re-engage gold tier customers in Delhi'*\n"
        "- *'Find customers who spent over ₹5000 and haven't ordered in 90 days'*\n"
        "- *'Draft a friendly WhatsApp message with 15% discount'*\n"
        "- *'Show me stats for my last campaign'*\n\n"
        "How would you like to start?"
    )

# Unified interface to invoke the agent
async def chat_with_agent(db: Session, message: str, history: List[Dict[str, str]], channel_service_url: str) -> str:
    # Prioritize Gemini if client is initialized
    if gemini_client:
        try:
            return await run_gemini_agent(db, message, history, channel_service_url)
        except Exception as e:
            print(f"Gemini API failed, falling back to other providers: {e}")
            
    # Then fall back to Anthropic
    if client:
        try:
            return await run_llm_agent(db, message, history, channel_service_url)
        except Exception as e:
            # If Claude API fails (e.g. rate limit, invalid key), fallback to regex agent
            print(f"Anthropic API failed, falling back to regex parser: {e}")
            return run_regex_fallback_agent(db, message, history, channel_service_url)
    
    # Final fallback to regex parser
    return run_regex_fallback_agent(db, message, history, channel_service_url)

