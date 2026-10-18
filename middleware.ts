import { withAuth } from "next-auth/middleware";

const AUTH_SECRET =
  process.env.NEXTAUTH_SECRET ||
  process.env.AUTH_SECRET ||
  "whatsapp-food-ordering-jwt-secret-key-production-fallback-32chars";

export default withAuth({
  pages: {
    signIn: "/login",
  },
  secret: AUTH_SECRET,
});

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/orders/:path*",
    "/menu/:path*",
    "/payments/:path*",
    "/users/:path*",
    "/settings/:path*",
  ],
};
