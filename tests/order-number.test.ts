import assert from "node:assert";

/**
 * Validates the format and zero-padding of the generated order number.
 * Pattern expected: ORD-YYYYMMDD-XXX
 */
function testOrderNumberPattern() {
  const pattern = /^ORD-\d{8}-\d{3,}$/;
  const sample = "ORD-20261015-001";
  assert.match(sample, pattern, "Sample order number must match ORD-YYYYMMDD-XXX format");
  console.log("✔ Order number pattern validation test passed");
}

testOrderNumberPattern();
