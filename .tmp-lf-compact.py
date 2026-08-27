import json
import sys

raw = sys.stdin.read()
start = raw.find("{")
envelope = json.loads(raw[start:])
body = envelope.get("body", envelope)
items = body.get("data") if isinstance(body, dict) else []


def as_obj(x):
    if isinstance(x, str):
        try:
            return json.loads(x)
        except json.JSONDecodeError:
            return x
    return x


def last_user(inp):
    obj = as_obj(inp)
    if not isinstance(obj, dict):
        return None
    messages = obj.get("messages") or []
    texts = []
    for m in messages:
        if not isinstance(m, dict) or m.get("role") != "user":
            continue
        content = m.get("content")
        if isinstance(content, list):
            bits = []
            for c in content:
                if isinstance(c, dict) and c.get("type") == "text":
                    bits.append(c.get("text", ""))
                elif isinstance(c, str):
                    bits.append(c)
            content = "\n".join(bits)
        if isinstance(content, str) and content.strip():
            texts.append(content.strip())
    return texts[-1] if texts else None


print("n", len(items))
for o in items:
    name = o.get("name")
    typ = o.get("type")
    print("=" * 72)
    print(f"{o.get('startTime')} {typ} {name} id={o.get('id')}")
    inp = as_obj(o.get("input"))
    out = as_obj(o.get("output"))
    if typ == "GENERATION":
        user = last_user(inp)
        if user:
            print("USER:", user[:1500])
        if isinstance(out, dict):
            print("OUT:", json.dumps(out, ensure_ascii=False)[:1500])
        elif isinstance(out, str):
            print("OUT:", out[:1500])
    elif name == "write_column":
        print("IN:", json.dumps(inp, ensure_ascii=False)[:2000])
        print("OUT:", json.dumps(out, ensure_ascii=False)[:800])
    elif name == "manage_worksheet":
        print("IN:", json.dumps(inp, ensure_ascii=False)[:1200])
        print("OUT:", json.dumps(out, ensure_ascii=False)[:800])
    elif name in ("read_document_page", "scan_attachments"):
        if isinstance(inp, dict):
            print("IN:", json.dumps({k: inp.get(k) for k in ("attachmentId", "pageNumber", "pages", "filenameContains", "query") if k in inp}))
        text = ""
        if isinstance(out, dict):
            text = out.get("transcript") or out.get("text") or out.get("pageText") or ""
            vis = out.get("visualInterpretation") or ""
            print("page", out.get("pageNumber"), "filename", out.get("filename"), "transcript_len", len(text or ""), "visual_len", len(vis or ""))
            blob = (text or "") + "\n" + (vis or "")
            print(blob[:4000])
            if len(blob) > 4000:
                print(f"...[{len(blob)-4000} more]")
        else:
            print("OUT:", str(out)[:2000])
    else:
        print("IN:", json.dumps(inp, ensure_ascii=False)[:800] if inp is not None else None)
        print("OUT:", json.dumps(out, ensure_ascii=False)[:800] if out is not None else None)
