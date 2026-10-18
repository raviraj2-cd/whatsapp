import assert from "node:assert";
import { verifyMetaSignature, computeMetaSignature } from "../lib/whatsapp/signature";

function runTests() {
  const secret = "test_meta_app_secret_998877";
  const body = JSON.stringify({ object: "whatsapp_business_account", entry: [] });

  // 1. Valid signature
  const validHeader = computeMetaSignature(body, secret);
  assert.strictEqual(
    verifyMetaSignature(body, validHeader, secret),
    true,
    "Valid signature must verify as true"
  );

  // 2. Tampered body
  const tamperedBody = JSON.stringify({ object: "whatsapp_business_account", entry: ["tampered"] });
  assert.strictEqual(
    verifyMetaSignature(tamperedBody, validHeader, secret),
    false,
    "Tampered body must fail verification"
  );

  // 3. Incorrect secret
  assert.strictEqual(
    verifyMetaSignature(body, validHeader, "wrong_secret"),
    false,
    "Incorrect secret must fail verification"
  );

  // 4. Malformed header (missing sha256= prefix)
  const malformedHeader = validHeader.replace("sha256=", "");
  assert.strictEqual(
    verifyMetaSignature(body, malformedHeader, secret),
    false,
    "Missing sha256= prefix must fail"
  );

  // 5. Missing / undefined values
  assert.strictEqual(verifyMetaSignature(body, null, secret), false, "Null header must fail");
  assert.strictEqual(verifyMetaSignature(body, validHeader, undefined), false, "Undefined secret must fail");

  console.log("✔ All signature verification unit tests passed successfully.");
}

runTests();
