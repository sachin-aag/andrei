import json
import sys

raw = sys.stdin.read()
start = raw.find("{")
if start < 0:
    print(raw[:2000])
    sys.exit(1)
d = json.loads(raw[start:])
print("top keys", list(d.keys())[:30])
items = None
if isinstance(d.get("data"), list):
    items = d["data"]
elif isinstance(d.get("result"), dict):
    print("result keys", list(d["result"].keys())[:30])
    inner = d["result"]
    if isinstance(inner.get("data"), list):
        items = inner["data"]
    elif isinstance(inner.get("data"), dict) and isinstance(inner["data"].get("data"), list):
        items = inner["data"]["data"]
print("n items", len(items) if items is not None else None)
if not items:
    print(json.dumps(d, indent=2)[:4000])
    sys.exit(0)
for i, o in enumerate(items[:50]):
    start_time = o.get("startTime", "")
    name = o.get("name")
    typ = o.get("type")
    session = (o.get("sessionId") or "")[:18]
    tags = o.get("tags")
    trace = (o.get("traceId") or "")[:16]
    oid = (o.get("id") or "")[:16]
    latency = o.get("latency")
    print(
        f"{i:02d} {start_time} name={name} type={typ} session={session} "
        f"tags={tags} trace={trace} id={oid} latency={latency}"
    )
