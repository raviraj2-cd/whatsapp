import assert from "node:assert";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  decryptFlowRequest,
  encryptFlowRequestForTest,
  encryptFlowResponse,
} from "../lib/whatsapp/flow-crypto";

function runCryptoTests() {
  console.log("Starting WhatsApp Flow Crypto Unit Tests...");

  const privateKeyPem = fs.readFileSync(path.join(process.cwd(), "flows", "flow_private_key.pem"), "utf8");
  const publicKeyPem = fs.readFileSync(path.join(process.cwd(), "flows", "flow_public_key.pem"), "utf8");

  const originalPayload = {
    version: "3.0",
    action: "data_exchange",
    screen: "MENU",
    flow_token: "mock_token_12345",
    data: { items_selected: ["item_1", "item_2"] },
  };

  // 1. Round-trip request decryption
  const mockEncrypted = encryptFlowRequestForTest(originalPayload, publicKeyPem);

  const decrypted = decryptFlowRequest(
    mockEncrypted.encrypted_flow_data,
    mockEncrypted.encrypted_aes_key,
    mockEncrypted.initial_vector,
    privateKeyPem
  );

  assert.deepStrictEqual(
    decrypted.decryptedBody,
    originalPayload,
    "Decrypted flow body must match original input"
  );
  assert.strictEqual(decrypted.aesKey.length, 16, "AES key must be 16 bytes");
  assert.strictEqual(decrypted.initialVector.length, 12, "IV must be 12 bytes");

  // 2. Response encryption with flipped IV
  const mockResponse = {
    version: "3.0",
    screen: "SUMMARY",
    data: { total: 450, status: "ok" },
  };

  const encryptedResponseBase64 = encryptFlowResponse(
    mockResponse,
    decrypted.aesKey,
    decrypted.initialVector
  );

  assert.ok(typeof encryptedResponseBase64 === "string" && encryptedResponseBase64.length > 0);

  // Verify response decryption using flipped IV
  const flippedIv = Buffer.alloc(decrypted.initialVector.length);
  for (let i = 0; i < decrypted.initialVector.length; i++) {
    flippedIv[i] = decrypted.initialVector[i] ^ 0xff;
  }

  const resBuffer = Buffer.from(encryptedResponseBase64, "base64");
  const resTag = resBuffer.subarray(resBuffer.length - 16);
  const resCipher = resBuffer.subarray(0, resBuffer.length - 16);

  const decipher = crypto.createDecipheriv("aes-128-gcm", decrypted.aesKey, flippedIv);
  decipher.setAuthTag(resTag);
  const decryptedResponse = Buffer.concat([decipher.update(resCipher), decipher.final()]);
  assert.deepStrictEqual(JSON.parse(decryptedResponse.toString("utf8")), mockResponse);

  // 3. Decryption Failure on wrong private key
  const otherKeys = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  assert.throws(
    () => {
      decryptFlowRequest(
        mockEncrypted.encrypted_flow_data,
        mockEncrypted.encrypted_aes_key,
        mockEncrypted.initial_vector,
        otherKeys.privateKey
      );
    },
    /FLOW_DECRYPTION_FAILED/,
    "Decryption with wrong private key must throw FLOW_DECRYPTION_FAILED"
  );

  // 4. Tampered ciphertext failure
  const tamperedCiphertext = Buffer.from(mockEncrypted.encrypted_flow_data, "base64");
  tamperedCiphertext[0] = tamperedCiphertext[0] ^ 0x01; // flip 1 bit

  assert.throws(
    () => {
      decryptFlowRequest(
        tamperedCiphertext.toString("base64"),
        mockEncrypted.encrypted_aes_key,
        mockEncrypted.initial_vector,
        privateKeyPem
      );
    },
    /FLOW_DECRYPTION_FAILED/,
    "Decryption with tampered ciphertext must throw FLOW_DECRYPTION_FAILED"
  );

  console.log("✔ All WhatsApp Flow Crypto unit tests passed successfully!");
}

runCryptoTests();
