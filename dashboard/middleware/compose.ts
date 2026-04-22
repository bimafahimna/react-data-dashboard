import { NextRequest, NextResponse } from "next/server";

export type Middleware = (
    req: NextRequest,
    next: () => NextResponse | Promise<NextResponse>
) => NextResponse | Promise<NextResponse>;

export function compose(middlewares: Middleware[]) {
    return async function handler(req: NextRequest): Promise<NextResponse> {
        for (const mw of middlewares) {
            const result = await mw(req, () => NextResponse.next());
            // If middleware returns a response other than "continue", stop chain
            if (result !== NextResponse.next()) {
                return result;
            }
        }
        return NextResponse.next();
    };
}