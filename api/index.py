"""
Vercel Serverless Function entry point for the Xeno CRM FastAPI backend.
Vercel discovers this file and exposes it at /api/* routes.
The 'app' variable must be a valid ASGI application.
"""
import sys
import os

# In Vercel serverless, the project root is at /var/task
# __file__ = /var/task/api/index.py
# We need /var/task/backend on the path so 'from app.xxx import' works
_this_dir = os.path.dirname(os.path.abspath(__file__))
_project_root = os.path.dirname(_this_dir)          # /var/task
_backend_dir = os.path.join(_project_root, "backend")  # /var/task/backend

for _p in [_backend_dir, _project_root]:
    if _p not in sys.path:
        sys.path.insert(0, _p)

# Import the FastAPI app — Vercel serves the 'app' object directly as ASGI
from app.main import app  # noqa: E402
