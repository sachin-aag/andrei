import json
import sys

raw = sys.stdin.read()
start = raw.find("{")
if start < 0:
    print(raw[:4000])
    sys.exit(1)
envelope = json.loads(raw[start:])
body = envelope.get("body", envelope)
items = body.get("data") if isinstance(body, dict) else None
if items is None and isinstance(body, dict) and body.get("id"):
    items = [body]
if not isinstance(items, list):
    print(json.dumps(envelope, indent=2)[:8000])
    sys.exit(0)

MAX = 8000


def clip(obj, n=MAX):
    s = obj if isinstance(obj, str) else json.dumps(obj, ensure_ascii=False)
    if len(s) > n:
        return s[:n] + f"\n...[truncated {len(s)-n} chars]"
    return s


for o in items:
    print("=" * 80)
    print(
        f"{o.get('startTime')} type={o.get('type')} name={o.get('name')} "
        f"id={o.get('id')} trace={o.get('traceId')} parent={o.get('parentObservationId')}"
    )
    if o.get("input") is not None:
        print("--- INPUT ---")
        print(clip(o.get("input")))
    if o.get("output") is not None:
        print("--- OUTPUT ---")
        print(clip(o.get("output")))
