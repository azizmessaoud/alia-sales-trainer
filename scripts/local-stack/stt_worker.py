#!/usr/bin/env python3
"""
Local STT worker for ALIA.
Line-delimited JSON protocol on stdin/stdout with request correlation via `_id`.

Input:
  {"_id":"req-1", "audio":"<base64 wav/mp3 bytes>", "beam_size":5}

Output:
  {"_id":"req-1", "ok":true, "text":"...", "language":"en", "segments":[...]} 
"""

from __future__ import annotations

import base64
import io
import json
import os
import sys
import tempfile
from typing import Any, Dict

import torch
from faster_whisper import WhisperModel

MODEL_NAME = os.getenv("ALIA_STT_MODEL", "deepdml/faster-whisper-large-v3-turbo-ct2")


def emit(payload: Dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=True) + "\n")
    sys.stdout.flush()


def main() -> None:
    device = "cuda" if torch.cuda.is_available() else "cpu"
    compute_type = "float16" if device == "cuda" else "int8"

    model = WhisperModel(
        MODEL_NAME,
        device=device,
        compute_type=compute_type,
    )

    emit({"ok": True, "event": "stt_worker_ready", "device": device, "compute_type": compute_type})

    for raw in sys.stdin:
        raw = raw.strip()
        if not raw:
            continue

        req_id = None
        tmp_path = None
        try:
            req = json.loads(raw)
            req_id = req.get("_id")
            audio_b64 = req.get("audio")
            if not audio_b64:
                raise ValueError("Missing required field: audio")

            audio_bytes = base64.b64decode(audio_b64)
            with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
                tmp.write(audio_bytes)
                tmp_path = tmp.name

            segments, info = model.transcribe(
                tmp_path,
                beam_size=int(req.get("beam_size", 5)),
                vad_filter=True,
            )

            seg_list = []
            for s in segments:
                seg_list.append(
                    {
                        "start": float(s.start),
                        "end": float(s.end),
                        "text": s.text,
                    }
                )

            text = " ".join([s["text"].strip() for s in seg_list]).strip()
            emit(
                {
                    "_id": req_id,
                    "ok": True,
                    "text": text,
                    "language": getattr(info, "language", "unknown"),
                    "segments": seg_list,
                }
            )
        except Exception as exc:  # noqa: BLE001
            emit({"_id": req_id, "ok": False, "error": str(exc)})
        finally:
            if tmp_path and os.path.exists(tmp_path):
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass


if __name__ == "__main__":
    main()
