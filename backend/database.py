import os
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client, Client


# Always load backend/.env regardless of the current working directory.
ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(ENV_PATH)


SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SECRET_KEY = os.getenv("SUPABASE_SECRET_KEY")


if not SUPABASE_URL:
    raise RuntimeError(
        f"SUPABASE_URL is missing. Expected it in {ENV_PATH}"
    )

if not SUPABASE_SECRET_KEY:
    raise RuntimeError(
        f"SUPABASE_SECRET_KEY is missing. Expected it in {ENV_PATH}"
    )


supabase: Client = create_client(
    SUPABASE_URL,
    SUPABASE_SECRET_KEY,
)