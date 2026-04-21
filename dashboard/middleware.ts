import { NextRequest, NextResponse } from "next/server";
import { decrypt } from "@/lib/session";
import { cookies } from "next/headers";

const protectedRoutes = ["/dashboard"];
const publicRoutes = ["/login", "/signup"];

export default async function middleware(req: NextRequest) {

  const path = req.nextUrl.pathname;
  const isProtectedRoute = protectedRoutes.some((route) => path.startsWith(route));
  const isPublicRoute = publicRoutes.includes(path);

  const cookie = (await cookies()).get("session")?.value;
  const session = cookie ? await decrypt(cookie).catch(() => null) : null;

  if (path === "/") {
    if (!session) {
      return NextResponse.redirect(new URL("/login", req.nextUrl));
    } else {
      return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
    }
  }

  if (isProtectedRoute && !session) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  if (
    isPublicRoute && session && !req.nextUrl.pathname.startsWith("/dashboard")
  ) {
    // redirect if already logged in
    if (path === "/login" || path === "/signup") {
      return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
    }
  }

  return NextResponse.next();
}