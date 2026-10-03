#!/bin/sh
# Runs the whole thing on your computer: http://localhost:8000
set -e
cd "$(dirname "$0")"
[ -f backend/.env ] && export $(grep -v '^#' backend/.env | grep '=' | xargs)
python3 -m pip install -q -r backend/requirements.txt
python3 scripts/export_static.py
python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
