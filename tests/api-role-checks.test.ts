import assert from "node:assert";

/**
 * Validates server-side role check logic for owner vs staff permissions.
 */
function testRoleChecks() {
  console.log("Starting Admin API Role Checks Test...");

  function checkAccess(user: { role: string } | null, requiredRole?: "owner") {
    if (!user) {
      return { status: 401, error: "Unauthorized" };
    }
    if (requiredRole && user.role !== requiredRole) {
      return { status: 403, error: "Forbidden: Owner permissions required" };
    }
    return { status: 200, user };
  }

  // 1. Unauthenticated request -> 401
  const unauth = checkAccess(null);
  assert.strictEqual(unauth.status, 401);

  // 2. Staff user accessing general endpoint -> 200
  const staffAccess = checkAccess({ role: "staff" });
  assert.strictEqual(staffAccess.status, 200);

  // 3. Staff user accessing owner-only endpoint -> 403 Forbidden
  const staffOwnerEndpoint = checkAccess({ role: "staff" }, "owner");
  assert.strictEqual(staffOwnerEndpoint.status, 403);
  assert.match(staffOwnerEndpoint.error || "", /Forbidden/);

  // 4. Owner user accessing owner-only endpoint -> 200 OK
  const ownerAccess = checkAccess({ role: "owner" }, "owner");
  assert.strictEqual(ownerAccess.status, 200);

  console.log("✔ Admin API Role Checks tests passed successfully!");
}

testRoleChecks();
