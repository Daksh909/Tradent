import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";

// The handler is built per request, so the build never opens the database.
export const GET = (req: Request) => toNextJsHandler(getAuth()).GET(req);
export const POST = (req: Request) => toNextJsHandler(getAuth()).POST(req);
