#!/usr/bin/env python3
"""
Local TTS worker for ALIA using Chatterbox.
Line-delimited JSON protocol on stdin/stdout with request correlation via `_id`.

Input:
  {"_id":"req-2", "text":"Hello world"}

Output:
  {"_id":"req-2", "ok":true, "audioBase64":"...", "sampleRate":24000}
"""

from __future__ import annotations

import base64
import io
import json
import os
import sys
from typing import Any, Dict

import soundfile as sf
import torch
from chatterbox.tts import ChatterboxTTS

VOICE_REF = os.getenv("ALIA_VOICE_REF", "alia_voice_reference.wav")


def emit(payload: Dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=True) + "\n")
    sys.stdout.flush()


def main() -> None:
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = ChatterboxTTS.from_pretrained(device=device)

    emit({"ok": True, "event": "tts_worker_ready", "device": device, "voiceRef": VOICE_REF})

    for raw in sys.stdin:
        raw = raw.strip()
        if not raw:
            continue

        req_id = None
        try:
            req = json.loads(raw)
            req_id = req.get("_id")
            text = (req.get("text") or "").strip()
            if not text:
                raise ValueError("Missing required field: text")

            wav = model.generate(
                text,
                audio_prompt_path=VOICE_REF,
                exaggeration=float(req.get("exaggeration", 0.3)),
                cfg_weight=float(req.get("cfg_weight", 0.5)),
            )

            # Chatterbox returns a tensor; write to in-memory WAV.
            audio_np = wav.detach().cpu().numpy().T
            buf = io.BytesIO()
            sf.write(buf, audio_np, model.sr, format="WAV")
            audio_b64 = base64.b64encode(buf.getvalue()).decode("ascii")

            emit(
                {
                    "_id": req_id,
                    "ok": True,
                    "audioBase64": audio_b64,
                    "sampleRate": int(model.sr),
                }
            )
        except Exception as exc:  # noqa: BLE001
            emit({"_id": req_id, "ok": False, "error": str(exc)})


if __name__ == "__main__":
    main()
