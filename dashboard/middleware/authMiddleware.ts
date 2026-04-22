import { NextRequest, NextResponse } from "next/server";
import { accessTokenKey, decrypt, TokenPayload } from "@/lib/session";
import { Middleware } from "./compose";

const protectedRoutes = ["/dashboard"];

export const authMiddleware: Middleware = async (
    req: NextRequest,
    next: () => NextResponse | Promise<NextResponse>
) => {
    const path = req.nextUrl.pathname;

    const isProtectedRoute = protectedRoutes.some((route) =>
        path.startsWith(route)
    );

    const accessToken = req.cookies.get(accessTokenKey)?.value;
    const payload = accessToken ? await decrypt(accessToken).catch(() => null) : null;

    if (path === "/") {
        return NextResponse.redirect(
            new URL(payload ? "/dashboard" : "/login", req.nextUrl)
        );
    }

    // Protect private routes
    if (isProtectedRoute && !payload) {
        return NextResponse.redirect(new URL("/login", req.nextUrl));
    }

    // Prevent logged-in users from visiting auth pages
    if (payload && (path === "/login" || path === "/signup")) {
        return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
    }

    return next();
}