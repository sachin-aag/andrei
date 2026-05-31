import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";

const SCRYPT_KEYLEN = 64;

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, SCRYPT_KEYLEN, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

/** Returns `hex_salt.hex_hash` string suitable for storing in a single column. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(32);
  const derived = await scryptAsync(password, salt);
  return `${salt.toString("hex")}.${derived.toString("hex")}`;
}

/** Verifies a plain-text password against a stored `hex_salt.hex_hash` string. */
export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const [saltHex, hashHex] = storedHash.split(".");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const storedKey = Buffer.from(hashHex, "hex");
  const derived = await scryptAsync(password, salt);
  return timingSafeEqual(storedKey, derived);
}
