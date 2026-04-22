import { NextRequest, NextResponse } from "next/server";
import { compose } from "./middleware/compose";
import { authMiddleware } from "./middleware/authMiddleware";

export default function middleware(req: NextRequest) {
  return compose([authMiddleware])(req);
}