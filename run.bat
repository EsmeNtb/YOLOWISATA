@echo off
rem Runs the whole thing on your computer: http://localhost:8000
cd /d %~dp0
python -m pip install -q -r backend\requirements.txt
python scripts\export_static.py
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
