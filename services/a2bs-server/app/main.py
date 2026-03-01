from __future__ import annotations

import json
import math
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse


@dataclass
class SessionState:
    sample_rate: int = 16000
    frame_samples: int = 320
    stub_mode: bool = True


@dataclass
class ModelRuntime:
    loaded: bool = False
    checkpoint_path: str = ""
    checkpoint_exists: bool = False
    model_kind: str = "none"
    error: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


def clamp01(value: float) -> float:
    if not math.isfinite(value):
        return 0.0
    if value < 0:
        return 0.0
    if value > 1:
        return 1.0
    return value


def make_zero_frame() -> dict[str, float]:
    return {
        "jawOpen": 0.0,
        "mouthSmileLeft": 0.0,
        "mouthSmileRight": 0.0,
        "mouthFunnel": 0.0,
        "mouthPucker": 0.0,
        "mouthClose": 0.0,
        "cheekPuff": 0.0,
        "cheekSquintLeft": 0.0,
        "cheekSquintRight": 0.0,
        "eyeBlinkLeft": 0.0,
        "eyeBlinkRight": 0.0,
        "browInnerUp": 0.0,
    }


def infer_stub_blendshapes(audio_frame: np.ndarray, now_s: float) -> dict[str, float]:
    energy = float(np.sqrt(np.mean(np.square(audio_frame))) if audio_frame.size > 0 else 0.0)
    jaw_open = clamp01(energy * 5.6)
    voice_shape = 0.5 + 0.5 * math.sin(now_s * 9.0)
    smile_mod = 0.5 + 0.5 * math.sin(now_s * 2.6 + 0.35)

    frame = make_zero_frame()
    frame["jawOpen"] = jaw_open
    frame["mouthFunnel"] = clamp01(jaw_open * (0.24 + (1.0 - voice_shape) * 0.56))
    frame["mouthPucker"] = clamp01(jaw_open * (0.16 + voice_shape * 0.43))
    frame["mouthSmileLeft"] = clamp01(jaw_open * 0.25 * smile_mod)
    frame["mouthSmileRight"] = clamp01(jaw_open * 0.25 * (1.0 - smile_mod * 0.25))
    frame["mouthClose"] = clamp01((1.0 - jaw_open) * 0.38)
    frame["cheekPuff"] = clamp01(jaw_open * 0.28 + (1.0 - voice_shape) * 0.08)
    frame["cheekSquintLeft"] = clamp01(jaw_open * 0.08 * smile_mod)
    frame["cheekSquintRight"] = clamp01(jaw_open * 0.08 * (1.0 - smile_mod * 0.3))
    frame["browInnerUp"] = clamp01(jaw_open * 0.12 + 0.04)
    frame["eyeBlinkLeft"] = clamp01(0.02 + max(0.0, math.sin(now_s * 0.9 + 0.2)) * 0.015)
    frame["eyeBlinkRight"] = clamp01(0.02 + max(0.0, math.sin(now_s * 0.95 + 0.35)) * 0.015)
    return frame


def infer_real_placeholder(audio_frame: np.ndarray, now_s: float) -> dict[str, float]:
    # Real-model mode currently loads checkpoint metadata and keeps inference lightweight.
    # This function remains a placeholder until full model-forward wiring is added.
    frame = infer_stub_blendshapes(audio_frame, now_s)

    if MODEL_RUNTIME.loaded:
        key_count = int(MODEL_RUNTIME.metadata.get("state_keys", 0))
        phase_bias = (key_count % 17) / 100.0
        frame["mouthSmileLeft"] = clamp01(frame["mouthSmileLeft"] + phase_bias * 0.7)
        frame["mouthSmileRight"] = clamp01(frame["mouthSmileRight"] + phase_bias * 0.6)

    return frame


def parse_hello(payload: dict[str, Any], state: SessionState) -> SessionState:
    sample_rate = payload.get("sampleRate")
    frame_samples = payload.get("frameSamples")

    next_state = SessionState(
        sample_rate=state.sample_rate,
        frame_samples=state.frame_samples,
        stub_mode=state.stub_mode,
    )

    if isinstance(sample_rate, int) and 8000 <= sample_rate <= 96000:
        next_state.sample_rate = sample_rate

    if isinstance(frame_samples, int) and 64 <= frame_samples <= 4096:
        next_state.frame_samples = frame_samples

    return next_state


APP_NAME = "xrb-a2bs-server"
APP_VERSION = "0.1.0"
STUB_MODE = os.getenv("A2BS_STUB", "1").strip() != "0"
REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_CHECKPOINT_PATH = REPO_ROOT / ".local" / "a2bs" / "ckpt" / "simplenet1.pth"
CHECKPOINT_PATH = Path(os.getenv("A2BS_CHECKPOINT_PATH", str(DEFAULT_CHECKPOINT_PATH))).expanduser()

MODEL_RUNTIME = ModelRuntime(
    checkpoint_path=str(CHECKPOINT_PATH),
    checkpoint_exists=CHECKPOINT_PATH.exists(),
)
REAL_MODEL_PAYLOAD: Any | None = None

app = FastAPI(title=APP_NAME, version=APP_VERSION)


def load_real_model(checkpoint_path: Path) -> tuple[ModelRuntime, Any | None]:
    runtime = ModelRuntime(
        loaded=False,
        checkpoint_path=str(checkpoint_path),
        checkpoint_exists=checkpoint_path.exists(),
    )

    if not runtime.checkpoint_exists:
        runtime.error = f"Checkpoint not found at {checkpoint_path}."
        return runtime, None

    try:
        import torch  # type: ignore
    except Exception as exc:  # pragma: no cover - environment dependent
        runtime.error = f"PyTorch import failed: {exc}."
        return runtime, None

    try:
        payload = torch.load(str(checkpoint_path), map_location="cpu")
    except Exception as exc:
        runtime.error = f"Checkpoint load failed: {exc}."
        return runtime, None

    state_dict: dict[str, Any] | None = None
    if isinstance(payload, dict):
        candidate = payload.get("state_dict")
        if isinstance(candidate, dict):
            state_dict = candidate
        elif all(isinstance(key, str) for key in payload.keys()):
            state_dict = payload
    else:
        candidate_state_dict = getattr(payload, "state_dict", None)
        if callable(candidate_state_dict):
            maybe_dict = candidate_state_dict()
            if isinstance(maybe_dict, dict):
                state_dict = maybe_dict

    param_count = 0
    state_keys = 0
    if state_dict is not None:
        state_keys = len(state_dict)
        for value in state_dict.values():
            numel = getattr(value, "numel", None)
            if callable(numel):
                try:
                    param_count += int(numel())
                except Exception:
                    continue

    runtime.loaded = True
    runtime.model_kind = type(payload).__name__
    runtime.metadata = {
        "state_keys": state_keys,
        "param_count": param_count,
    }
    return runtime, payload


@app.on_event("startup")
async def startup_event() -> None:
    global MODEL_RUNTIME, REAL_MODEL_PAYLOAD

    if STUB_MODE:
        return

    MODEL_RUNTIME, REAL_MODEL_PAYLOAD = load_real_model(CHECKPOINT_PATH)
    if not MODEL_RUNTIME.loaded:
        raise RuntimeError(
            f"A2BS_STUB=0 requires a loadable checkpoint at {CHECKPOINT_PATH}. {MODEL_RUNTIME.error or ''}".strip()
        )


@app.get("/health")
async def health() -> JSONResponse:
    return JSONResponse(
        {
            "ok": True,
            "service": APP_NAME,
            "version": APP_VERSION,
            "stub": STUB_MODE,
            "checkpoint": {
                "path": MODEL_RUNTIME.checkpoint_path,
                "exists": MODEL_RUNTIME.checkpoint_exists,
                "loaded": MODEL_RUNTIME.loaded,
                "model_kind": MODEL_RUNTIME.model_kind,
                "error": MODEL_RUNTIME.error,
                "metadata": MODEL_RUNTIME.metadata,
            },
            "time": time.time(),
        }
    )


@app.websocket("/ws/a2bs")
async def websocket_a2bs(websocket: WebSocket) -> None:
    await websocket.accept()
    state = SessionState(stub_mode=STUB_MODE)

    if not state.stub_mode and not MODEL_RUNTIME.loaded:
        await websocket.send_text(
            json.dumps(
                {
                    "type": "error",
                    "message": f"A2BS model is not loaded. Expected checkpoint at {MODEL_RUNTIME.checkpoint_path}.",
                }
            )
        )
        await websocket.close(code=1011)
        return

    await websocket.send_text(
        json.dumps(
            {
                "type": "ready",
                "stub": state.stub_mode,
                "sampleRate": state.sample_rate,
                "frameSamples": state.frame_samples,
                "checkpointPath": MODEL_RUNTIME.checkpoint_path,
                "checkpointLoaded": MODEL_RUNTIME.loaded,
            }
        )
    )

    try:
        while True:
            message = await websocket.receive()

            if "text" in message and message["text"] is not None:
                try:
                    payload = json.loads(message["text"])
                except json.JSONDecodeError:
                    await websocket.send_text(
                        json.dumps(
                            {
                                "type": "error",
                                "message": "Invalid JSON payload.",
                            }
                        )
                    )
                    continue

                event_type = payload.get("type")
                if event_type == "hello":
                    state = parse_hello(payload, state)
                    await websocket.send_text(
                        json.dumps(
                            {
                                "type": "hello-ack",
                                "sampleRate": state.sample_rate,
                                "frameSamples": state.frame_samples,
                                "stub": state.stub_mode,
                            }
                        )
                    )
                    continue

                if event_type == "ping":
                    await websocket.send_text(
                        json.dumps(
                            {
                                "type": "pong",
                                "clientTsMs": payload.get("clientTsMs"),
                                "serverTsMs": time.perf_counter() * 1000.0,
                            }
                        )
                    )
                    continue

                continue

            if "bytes" not in message or message["bytes"] is None:
                continue

            raw_bytes = message["bytes"]
            if len(raw_bytes) == 0:
                continue

            audio_frame = np.frombuffer(raw_bytes, dtype=np.float32)
            if audio_frame.size == 0:
                continue

            now_s = time.time()
            blendshapes = (
                infer_stub_blendshapes(audio_frame, now_s)
                if state.stub_mode
                else infer_real_placeholder(audio_frame, now_s)
            )

            await websocket.send_text(
                json.dumps(
                    {
                        "type": "bs",
                        "t": now_s,
                        "bs": blendshapes,
                    }
                )
            )
    except WebSocketDisconnect:
        return
