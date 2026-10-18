import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login",
  },
});

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/orders/:path*",
    "/menu/:path*",
    "/payments/:path*",
    "/users/:path*",
    "/settings/:path*",
    "/api/admin/:path*",
  ],
};
