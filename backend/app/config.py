import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    if os.getenv("VERCEL") or os.getenv("VERCEL_ENV"):
        DATABASE_URL = "sqlite:////tmp/xeno.db"
    else:
        DATABASE_URL = "sqlite:///./xeno.db"
CHANNEL_SERVICE_URL = os.getenv("CHANNEL_SERVICE_URL", "http://localhost:8001")
PORT = int(os.getenv("PORT", "8000"))
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

