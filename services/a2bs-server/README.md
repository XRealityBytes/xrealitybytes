# A2BS Server (Stub + Streaming WebSocket)

Local development service for audio-to-blendshape streaming.

## Endpoints

- `GET /health`
- `WS /ws/a2bs`

## Run (local python)

```bash
cd services/a2bs-server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8765
```

## Run (docker)

```bash
docker compose up a2bs-server
```

## Env

- `A2BS_STUB=1` (default): amplitude-driven blendshape simulation.
- `A2BS_STUB=0`: loads the checkpoint and enables real-model mode placeholder runtime.
- `A2BS_CHECKPOINT_PATH`:
  - default (local python run):
    `/Users/gregchapter/Developer/XRB_Web_2026/.local/a2bs/ckpt/simplenet1.pth`
  - docker-compose path:
    `/models/simplenet1.pth`
