"""
Vercel Serverless Function entry point for the FastAPI backend.
This file is discovered by Vercel at /api/* routes.

@vercel/python serves the ASGI app object directly.
"""
import sys
import os

# Add the backend directory to the Python path
# In Vercel, the project root is the working directory
_backend_dir = os.path.join(os.path.dirname(__file__), '..', 'backend')
if _backend_dir not in sys.path:
    sys.path.insert(0, os.path.abspath(_backend_dir))

# Import the FastAPI app from the backend package
from app.main import app
