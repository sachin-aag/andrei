import json
import sys

raw = sys.stdin.read()
start = raw.find("{")
envelope = json.loads(raw[start:])
body = envelope.get("body", envelope)
items = body.get("data") if isinstance(body, dict) else []


def preview(obj, n=2500):
    s = obj if isinstance(obj, str) else json.dumps(obj, ensure_ascii=False)
    return s[:n] + (f"\n...[{len(s)-n} more]" if len(s) > n else "")


def extract_user_text(inp):
    if inp is None:
        return None
    if isinstance(inp, str):
        try:
            inp = json.loads(inp)
        except json.JSONDecodeError:
            return inp[:1500]
    if isinstance(inp, dict):
        msgs = inp.get("messages") or inp.get("prompt") or inp.get("input")
        if isinstance(msgs, list):
            texts = []
            for m in msgs[-8:]:
                role = m.get("role") if isinstance(m, dict) else None
                content = m.get("content") if isinstance(m, dict) else m
                if role in ("user", "assistant") or role is None:
                    if isinstance(content, list):
                        bits = []
                        for c in content:
                            if isinstance(c, dict) and c.get("type") == "text":
                                bits.append(c.get("text", "")[:800])
                            elif isinstance(c, str):
                                bits.append(c[:800])
                        content = "\n".join(bits)
                    if isinstance(content, str) and content.strip():
                        texts.append(f"[{role}] {content[:1200]}")
            return "\n---\n".join(texts[-4:])
        return preview(inp, 2000)
    return preview(inp, 2000)


print("n", len(items))
for o in items:
    print("=" * 80)
    print(f"{o.get('startTime')} {o.get('type')} {o.get('name')} id={o.get('id')}")
    inp = o.get("input")
    out = o.get("output")
    user = extract_user_text(inp)
    if user:
        print("--- CONV TAIL ---")
        print(user)
    elif inp is not None:
        print("--- INPUT ---")
        print(preview(inp, 2000))
    if out is not None:
        print("--- OUTPUT ---")
        print(preview(out, 2500))
