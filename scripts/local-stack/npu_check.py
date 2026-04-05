#!/usr/bin/env python3
"""Check whether ONNX Runtime exposes the AMD Vitis AI execution provider."""

from onnxruntime import get_available_providers


providers = get_available_providers()
if "VitisAIExecutionProvider" in providers:
    print("✅ NPU ready")
else:
    print("⚠️ NPU unavailable — providers:", providers)
    print("→ Falling back to faster-whisper CPU path")
