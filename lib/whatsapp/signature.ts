import crypto from "node:crypto";

/**
 * Validates the Meta X-Hub-Signature-256 header using the META_APP_SECRET.
 * Meta sends: `sha256=<hex_digest>`
 * Uses crypto.timingSafeEqual to prevent timing attacks.
 */
export function verifyMetaSignature(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  appSecret: string | undefined
): boolean {
  if (!signatureHeader || !appSecret) {
    return false;
  }

  const parts = signatureHeader.split("=");
  if (parts.length !== 2 || parts[0] !== "sha256") {
    return false;
  }

  const signatureHash = parts[1];

  const expectedHash = crypto
    .createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex");

  const expectedBuffer = Buffer.from(expectedHash, "utf8");
  const actualBuffer = Buffer.from(signatureHash, "utf8");

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

/**
 * Helper to compute the signature (used for testing or outgoing requests)
 */
export function computeMetaSignature(rawBody: string | Buffer, appSecret: string): string {
  const hash = crypto
    .createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex");
  return `sha256=${hash}`;
}
