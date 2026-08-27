import json
import sys

raw = sys.stdin.read()
start = raw.find("{")
if start < 0:
    print(raw[:2000])
    sys.exit(1)
envelope = json.loads(raw[start:])
body = envelope.get("body", envelope)
items = body.get("data") if isinstance(body, dict) else None
meta = body.get("meta") if isinstance(body, dict) else None
if meta:
    print("meta", json.dumps(meta)[:500])
if not isinstance(items, list):
    print(json.dumps(envelope, indent=2)[:3000])
    sys.exit(0)
print("n", len(items))
for i, o in enumerate(items):
    name = o.get("name")
    typ = o.get("type")
    start_time = o.get("startTime")
    trace = o.get("traceId")
    oid = o.get("id")
    parent = o.get("parentObservationId")
    session = o.get("sessionId")
    latency = o.get("latency")
    print(
        f"{i:02d} {start_time} {typ:10} {name} latency={latency} "
        f"trace={trace} id={oid} parent={parent} session={session}"
    )
