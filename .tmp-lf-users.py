import json
import sys

raw = sys.stdin.read()
start = raw.find("{")
d = json.loads(raw[start:])
items = d["body"]["data"]


def as_obj(x):
    if isinstance(x, str):
        try:
            return json.loads(x)
        except json.JSONDecodeError:
            return x
    return x


def walk_user(obj, acc):
    if isinstance(obj, dict):
        if obj.get("role") == "user":
            content = obj.get("content")
            if isinstance(content, list):
                bits = []
                for c in content:
                    if isinstance(c, dict) and "text" in c:
                        bits.append(c["text"])
                    elif isinstance(c, str):
                        bits.append(c)
                acc.append("\n".join(bits))
            elif isinstance(content, str):
                acc.append(content)
        for v in obj.values():
            walk_user(v, acc)
    elif isinstance(obj, list):
        for v in obj:
            walk_user(v, acc)


for o in items:
    print("=" * 72)
    print(o.get("startTime"), o.get("name"), o.get("id"))
    inp = as_obj(o.get("input"))
    users = []
    walk_user(inp, users)
    # unique preserve order
    seen = []
    for u in users:
        u = u.strip()
        if u and u not in seen:
            seen.append(u)
    for i, u in enumerate(seen):
        print(f"-- user[{i}] --")
        print(u[:2000])
    out = as_obj(o.get("output"))
    if isinstance(out, str):
        print("OUT:", out[:1200])
    elif isinstance(out, dict) and out.get("content"):
        print("OUT:", str(out.get("content"))[:1200])
