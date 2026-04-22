export const SITE_ACCESS_COOKIE = "mjb_site_access";

const encoder = new TextEncoder();

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function base64urlEncode(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(s: string): ArrayBuffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/** Issue token: `${exp}:${base64url(hmac)}` — exp is unix seconds. */
export async function mintSiteAccessToken(
  sitePassword: string,
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
  const payload = String(exp);
  const key = await hmacKey(sitePassword);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return `${payload}:${base64urlEncode(sig)}`;
}

export async function verifySiteAccessToken(
  token: string,
  sitePassword: string,
): Promise<boolean> {
  const colon = token.indexOf(":");
  if (colon <= 0) return false;
  const expStr = token.slice(0, colon);
  const sigPart = token.slice(colon + 1);
  const exp = Number.parseInt(expStr, 10);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
    return false;
  }
  let sigBuf: ArrayBuffer;
  try {
    sigBuf = base64urlDecode(sigPart);
  } catch {
    return false;
  }
  const key = await hmacKey(sitePassword);
  return crypto.subtle.verify("HMAC", key, sigBuf, encoder.encode(expStr));
}
