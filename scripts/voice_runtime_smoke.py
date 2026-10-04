"""Measure local STT loading on silence, hardware and memory. NOT a speech accuracy test."""
import ctypes
import importlib.metadata
import io
import json
import platform
import sys
import time
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend import voice


def hardware():
    result = {"os": platform.platform(), "cpu": platform.processor(), "ram_bytes": None, "gpu_used": False}
    if sys.platform == "win32":
        import winreg
        try:
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"HARDWARE\DESCRIPTION\System\CentralProcessor\0") as key:
                result["cpu"] = winreg.QueryValueEx(key, "ProcessorNameString")[0].strip()
            class MemoryStatus(ctypes.Structure):
                _fields_ = [("length", ctypes.c_ulong), ("load", ctypes.c_ulong)] + [(k, ctypes.c_ulonglong) for k in
                    ("total_physical", "available_physical", "total_pagefile", "available_pagefile", "total_virtual", "available_virtual", "extended")]
            status = MemoryStatus()
            status.length = ctypes.sizeof(status)
            if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
                result["ram_bytes"] = status.total_physical
        except OSError:
            pass
    return result


def main():
    out = io.BytesIO()
    with wave.open(out, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(16000)
        wav.writeframes(b"\0\0" * 32000)
    started = time.perf_counter()
    status = "unexpected_transcript"
    try:
        voice.transcribe_audio(out.getvalue(), "en")
    except voice.STTError:
        status = "model_loaded_and_silence_safely_rejected"
    result = {"hardware": hardware(), "stt_smoke": {"status": status,
              "processing_ms_including_load": round((time.perf_counter() - started)*1000, 2),
              "audio": "generated two seconds of silence, not natural speech", "accuracy_or_wer": "not measured",
              "model": voice._stt_name, "runtime": importlib.metadata.version("faster-whisper"), "compute_type": "int8"}}
    (ROOT / "data/processed/voice_runtime_smoke.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
