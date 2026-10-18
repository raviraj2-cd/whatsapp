import bcrypt from "bcryptjs";
import { AuthOptions, getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import logger from "@/lib/logger";
import Admin from "@/models/Admin";

// Rate limiting & lockout tracker for login attempts
// Map: email -> { attempts: number, lockedUntil?: number }
const loginAttemptsMap = new Map<string, { attempts: number; lockedUntil?: number }>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export const authOptions: AuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8 hours
  },
  useSecureCookies: process.env.NODE_ENV === "production",
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Admin Credentials",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "admin@example.com" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email and password are required");
        }

        const email = credentials.email.toLowerCase().trim();
        const now = Date.now();

        // 1. Check Lockout Status
        const attemptRecord = loginAttemptsMap.get(email);
        if (attemptRecord?.lockedUntil && attemptRecord.lockedUntil > now) {
          const remainingMinutes = Math.ceil((attemptRecord.lockedUntil - now) / 60000);
          logger.warn({ email }, "Login attempt rejected: Account temporarily locked");
          throw new Error(`Account temporarily locked due to repeated failures. Try again in ${remainingMinutes} minutes.`);
        }

        await connectDB();
        const admin = await Admin.findOne({ email });

        if (!admin || !admin.active) {
          recordFailedAttempt(email);
          logger.warn({ email }, "Invalid admin login attempt (account not found or inactive)");
          throw new Error("Invalid email or password");
        }

        // 2. Validate Password with bcrypt
        const isValid = await bcrypt.compare(credentials.password, admin.passwordHash);
        if (!isValid) {
          recordFailedAttempt(email);
          logger.warn({ email }, "Invalid admin password provided");
          throw new Error("Invalid email or password");
        }

        // Reset failed attempts on success
        loginAttemptsMap.delete(email);
        logger.info({ email, role: admin.role }, "Admin authenticated successfully");

        return {
          id: admin._id.toString(),
          email: admin.email,
          name: admin.name,
          role: admin.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role;
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role;
        (session.user as any).id = token.id;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

function recordFailedAttempt(email: string) {
  const record = loginAttemptsMap.get(email) || { attempts: 0 };
  record.attempts += 1;

  if (record.attempts >= MAX_ATTEMPTS) {
    record.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
    logger.warn({ email }, "Maximum failed login attempts reached. Locking account.");
  }

  loginAttemptsMap.set(email, record);
}

/**
 * Helper to fetch the authenticated admin session on server routes.
 */
export async function getAdminSession() {
  return getServerSession(authOptions);
}

/**
 * Enforces role checks in API routes.
 * Throws an appropriate NextResponse if unauthorized.
 */
export async function requireAdminAuth(requiredRole?: "owner") {
  const session = await getAdminSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRole = (session.user as any).role;
  if (requiredRole && userRole !== requiredRole) {
    return NextResponse.json(
      { error: "Forbidden: Owner permissions required" },
      { status: 403 }
    );
  }

  return { session, user: session.user };
}
