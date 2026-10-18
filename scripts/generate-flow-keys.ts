import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Generates an RSA 2048-bit key pair in PEM format for Meta WhatsApp Flows endpoint encryption.
 * Saves private & public keys into the flows/ directory.
 */
function generateFlowKeys() {
  console.log("Generating RSA 2048-bit key pair for WhatsApp Flows...");

  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: "spki",
      format: "pem",
    },
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem",
    },
  });

  const flowsDir = path.join(process.cwd(), "flows");
  if (!fs.existsSync(flowsDir)) {
    fs.mkdirSync(flowsDir, { recursive: true });
  }

  const privateKeyPath = path.join(flowsDir, "flow_private_key.pem");
  const publicKeyPath = path.join(flowsDir, "flow_public_key.pem");

  fs.writeFileSync(privateKeyPath, privateKey, { encoding: "utf8" });
  fs.writeFileSync(publicKeyPath, publicKey, { encoding: "utf8" });

  console.log("✔ Keys generated successfully!");
  console.log(`- Private Key saved to: ${privateKeyPath}`);
  console.log(`- Public Key saved to:  ${publicKeyPath}`);
  console.log("\n==================================================================");
  console.log("NEXT STEPS:");
  console.log("1. Add the private key to your .env / .env.local file:");
  console.log('   FLOW_PRIVATE_KEY_PEM="' + privateKey.replace(/\r?\n/g, "\\n") + '"');
  console.log("\n2. Upload the Public Key to WhatsApp Manager:");
  console.log("   - Open Meta Business Suite -> WhatsApp Manager (business.facebook.com)");
  console.log("   - Under Account tools -> Phone numbers -> Click your phone number");
  console.log("   - Go to WhatsApp Flows -> Public key management");
  console.log("   - Click 'Upload public key' and select 'flows/flow_public_key.pem'");
  console.log("==================================================================\n");
}

generateFlowKeys();
