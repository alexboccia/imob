import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isLoginPage = req.nextUrl.pathname === "/app/login";

  if (!isLoggedIn && !isLoginPage) {
    const loginUrl = new URL("/app/login", req.nextUrl.origin);
    return NextResponse.redirect(loginUrl);
  }

  if (isLoggedIn && isLoginPage) {
    return NextResponse.redirect(new URL("/app", req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/app/:path*"],
};
