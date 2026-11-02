import {
  randomBytes,
  scrypt as nodeScrypt,
  timingSafeEqual,
} from "node:crypto";

const keyLength = 64;
const scryptOptions = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

async function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeScrypt(password, salt, keyLength, scryptOptions, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const passwordBytes = Buffer.byteLength(password, "utf8");
  if (passwordBytes < 12 || passwordBytes > 128) {
    throw new Error("Admin password must be 12-128 UTF-8 bytes.");
  }
  const salt = randomBytes(16);
  const derivedKey = await deriveKey(password, salt);
  return [
    "scrypt",
    String(scryptOptions.N),
    String(scryptOptions.r),
    String(scryptOptions.p),
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  encodedHash: string | null,
): Promise<boolean> {
  const parts = encodedHash?.split("$") ?? [];
  const [algorithm, n, r, p, saltEncoded, keyEncoded] = parts;
  const parametersValid =
    algorithm === "scrypt" &&
    n === String(scryptOptions.N) &&
    r === String(scryptOptions.r) &&
    p === String(scryptOptions.p) &&
    typeof saltEncoded === "string" &&
    typeof keyEncoded === "string";

  const salt = parametersValid
    ? Buffer.from(saltEncoded, "base64url")
    : Buffer.alloc(16);
  const expectedKey = parametersValid
    ? Buffer.from(keyEncoded, "base64url")
    : Buffer.alloc(keyLength);
  if (salt.length !== 16 || expectedKey.length !== keyLength) return false;

  const actualKey = await deriveKey(password, salt);
  const matches = timingSafeEqual(actualKey, expectedKey);
  return parametersValid && matches;
}
