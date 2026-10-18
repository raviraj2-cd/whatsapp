import crypto from "node:crypto";
import logger from "@/lib/logger";

export interface DecryptedFlowRequest<T = Record<string, unknown>> {
  decryptedBody: T;
  aesKey: Buffer;
  initialVector: Buffer;
}

/**
 * Decrypts an incoming WhatsApp Flow request from Meta.
 * Protocol:
 * 1. encrypted_aes_key decrypted using RSA-OAEP with SHA-256 and your Private Key.
 * 2. encrypted_flow_data decrypted using AES-128-GCM with initial_vector and 16-byte trailing auth tag.
 * Reference: https://developers.facebook.com/docs/whatsapp/flows/guides/implementingyourflowendpoint
 */
export function decryptFlowRequest<T = Record<string, unknown>>(
  encryptedFlowData: string,
  encryptedAesKey: string,
  initialVector: string,
  privateKeyPem: string,
  passphrase?: string
): DecryptedFlowRequest<T> {
  try {
    // 1. Decrypt 16-byte AES Key using RSA Private Key
    const decryptedAesKey = crypto.privateDecrypt(
      {
        key: privateKeyPem,
        passphrase: passphrase || undefined,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      Buffer.from(encryptedAesKey, "base64")
    );

    // 2. Separate ciphertext and 16-byte auth tag
    const flowDataBuffer = Buffer.from(encryptedFlowData, "base64");
    if (flowDataBuffer.length < 16) {
      throw new Error("encrypted_flow_data too short to contain 16-byte authentication tag");
    }

    const authTag = flowDataBuffer.subarray(flowDataBuffer.length - 16);
    const ciphertext = flowDataBuffer.subarray(0, flowDataBuffer.length - 16);
    const iv = Buffer.from(initialVector, "base64");

    // 3. Decrypt with AES-128-GCM
    const decipher = crypto.createDecipheriv("aes-128-gcm", decryptedAesKey, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const decryptedBody = JSON.parse(decrypted.toString("utf8")) as T;

    return {
      decryptedBody,
      aesKey: decryptedAesKey,
      initialVector: iv,
    };
  } catch (error) {
    logger.warn({ error }, "WhatsApp Flow request decryption failed");
    throw new Error("FLOW_DECRYPTION_FAILED");
  }
}

/**
 * Encrypts a WhatsApp Flow response to return to Meta.
 * Protocol:
 * 1. Flip each byte of the initial_vector (iv[i] ^ 0xFF).
 * 2. Encrypt plaintext response with AES-128-GCM.
 * 3. Concatenate ciphertext and 16-byte auth tag, returned as base64 string.
 */
export function encryptFlowResponse(
  responseObj: Record<string, unknown>,
  aesKey: Buffer,
  initialVector: Buffer
): string {
  // 1. Invert/flip IV
  const flippedIv = Buffer.alloc(initialVector.length);
  for (let i = 0; i < initialVector.length; i++) {
    flippedIv[i] = initialVector[i] ^ 0xff;
  }

  // 2. Encrypt with AES-128-GCM
  const cipher = crypto.createCipheriv("aes-128-gcm", aesKey, flippedIv);
  const plainTextBuffer = Buffer.from(JSON.stringify(responseObj), "utf8");

  const ciphertext = Buffer.concat([cipher.update(plainTextBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // 3. Concatenate ciphertext + authTag -> base64
  return Buffer.concat([ciphertext, authTag]).toString("base64");
}

/**
 * Test helper: Encrypts a mock Flow request simulating Meta's outbound client.
 */
export function encryptFlowRequestForTest(
  payloadObj: Record<string, unknown>,
  publicKeyPem: string
): {
  encrypted_flow_data: string;
  encrypted_aes_key: string;
  initial_vector: string;
} {
  // 1. Generate 16-byte AES key and 12-byte IV
  const aesKey = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);

  // 2. Encrypt AES key with RSA Public Key
  const encryptedAesKey = crypto.publicEncrypt(
    {
      key: publicKeyPem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    aesKey
  );

  // 3. Encrypt payload with AES-128-GCM
  const cipher = crypto.createCipheriv("aes-128-gcm", aesKey, iv);
  const plainText = Buffer.from(JSON.stringify(payloadObj), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plainText), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const encryptedFlowData = Buffer.concat([ciphertext, authTag]);

  return {
    encrypted_flow_data: encryptedFlowData.toString("base64"),
    encrypted_aes_key: encryptedAesKey.toString("base64"),
    initial_vector: iv.toString("base64"),
  };
}
