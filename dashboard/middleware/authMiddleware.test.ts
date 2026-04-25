import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { authMiddleware } from "./authMiddleware";
import { decrypt } from "@/lib/session";

vi.mock("next/server", () => ({
    NextResponse: {
        redirect: vi.fn((url: URL) => ({ type: "redirect", url: url.toString() })),
        next: vi.fn(() => ({ type: "next" })),
    },
    NextRequest: vi.fn()
}));

vi.mock("@/lib/session", () => ({
    decrypt: vi.fn(),
    accessTokenKey: "session"
}));

describe("authMiddleware", () => {
    let mockNext: vi.Mock;

    beforeEach(() => {
        vi.clearAllMocks();
        mockNext = vi.fn(() => ({ type: "next" }));
    });

    const createMockReq = (pathname: string, hasSessionCookie: boolean = false) => {
        return {
            nextUrl: new URL(pathname, "http://localhost:3000"),
            cookies: {
                get: vi.fn((name) => {
                    if (name === "session" && hasSessionCookie) {
                        return { value: "mock-token" };
                    }
                    return undefined;
                })
            }
        } as unknown as NextRequest;
    };

    describe("Root path ('/')", () => {
        it("redirects to /dashboard if session exists", async () => {
            const req = createMockReq("/", true);
            vi.mocked(decrypt).mockResolvedValueOnce({ user: "dummy" });

            const result = await authMiddleware(req, mockNext);
            
            expect(NextResponse.redirect).toHaveBeenCalledWith(new URL("/dashboard", req.nextUrl));
            expect(result).toEqual({ type: "redirect", url: "http://localhost:3000/dashboard" });
        });

        it("redirects to /login if session does not exist", async () => {
            const req = createMockReq("/", false);

            const result = await authMiddleware(req, mockNext);

            expect(NextResponse.redirect).toHaveBeenCalledWith(new URL("/login", req.nextUrl));
            expect(result).toEqual({ type: "redirect", url: "http://localhost:3000/login" });
        });
    });

    describe("Protected routes (e.g. /dashboard)", () => {
        it("calls next() if session exists", async () => {
            const req = createMockReq("/dashboard", true);
            vi.mocked(decrypt).mockResolvedValueOnce({ user: "dummy" });

            const result = await authMiddleware(req, mockNext);

            expect(mockNext).toHaveBeenCalled();
            expect(result).toEqual({ type: "next" });
        });

        it("redirects to /login if session does not exist", async () => {
            const req = createMockReq("/dashboard", false);

            const result = await authMiddleware(req, mockNext);

            expect(NextResponse.redirect).toHaveBeenCalledWith(new URL("/login", req.nextUrl));
            expect(result).toEqual({ type: "redirect", url: "http://localhost:3000/login" });
        });
    });

    describe("Auth pages (/login or /signup)", () => {
        it("redirects to /dashboard if session exists", async () => {
            const req = createMockReq("/login", true);
            vi.mocked(decrypt).mockResolvedValueOnce({ user: "dummy" });

            const result = await authMiddleware(req, mockNext);

            expect(NextResponse.redirect).toHaveBeenCalledWith(new URL("/dashboard", req.nextUrl));
            expect(result).toEqual({ type: "redirect", url: "http://localhost:3000/dashboard" });
        });

        it("calls next() if session does not exist (on /login)", async () => {
            const req = createMockReq("/login", false);

            const result = await authMiddleware(req, mockNext);

            expect(mockNext).toHaveBeenCalled();
            expect(result).toEqual({ type: "next" });
        });

        it("calls next() if session does not exist (on /signup)", async () => {
            const req = createMockReq("/signup", false);

            const result = await authMiddleware(req, mockNext);

            expect(mockNext).toHaveBeenCalled();
            expect(result).toEqual({ type: "next" });
        });
    });

    describe("Public routes (e.g. /about)", () => {
        it("calls next() and ignores session", async () => {
            const req = createMockReq("/about", false);

            const result = await authMiddleware(req, mockNext);

            expect(mockNext).toHaveBeenCalled();
            expect(result).toEqual({ type: "next" });
        });

        it("calls next() even if session exists", async () => {
            const req = createMockReq("/about", true);
            vi.mocked(decrypt).mockResolvedValueOnce({ user: "dummy" });

            const result = await authMiddleware(req, mockNext);

            expect(mockNext).toHaveBeenCalled();
            expect(result).toEqual({ type: "next" });
        });
    });
});
