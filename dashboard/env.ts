// src/env.ts
import { z } from "zod";

// Resolve a sensible auth URL at runtime.
// Order: explicit AUTH_URL → Vercel production domain → current Vercel deploy URL.
// This is critical for Vercel Preview deployments where each PR has a unique hostname.
const resolveAuthUrl = (): string | undefined => {
    if (process.env.AUTH_URL) return process.env.AUTH_URL;
    if (
        process.env.VERCEL_ENV === "production" &&
        process.env.VERCEL_PROJECT_PRODUCTION_URL
    ) {
        return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
    }
    if (process.env.VERCEL_URL) {
        return `https://${process.env.VERCEL_URL}`;
    }
    return undefined;
};

// Mirror v5-style names → v4 names that NextAuth actually reads at runtime.
// Must happen here (imported by the route) rather than in next.config.ts,
// because next.config.ts only runs at build time on Vercel.
process.env.AUTH_URL ||= resolveAuthUrl();
process.env.NODE_ENV !== "production" && console.log("auth url", process.env.AUTH_URL);

process.env.NEXTAUTH_URL ||= process.env.AUTH_URL;
process.env.NEXTAUTH_SECRET ||= process.env.AUTH_SECRET;

const envSchema = z.object({
    // Server-side variables
    DATABASE_URL: z.url(),
    POSTGRES_USER: z.string(),
    POSTGRES_PASSWORD: z.string(),
    POSTGRES_DB: z.string(),

    PGADMIN_EMAIL: z.string(),
    PGADMIN_PASSWORD: z.string(),

    // jwt
    SECRET_KEY: z.string(),
    PASSWORD_HASH_SALT: z.coerce.number().default(1),
    JWT_ALGORITHM: z.string(),

    // Auth
    AUTH_SECRET: z.base64(),
    AUTH_URL: z.url(),
    GOOGLE_CLIENT_ID: z.string(),
    GOOGLE_CLIENT_SECRET: z.string(),
    // Not consumed by code (NextAuth derives the callback from NEXTAUTH_URL);
    // kept optional for documentation parity with the Google console setting.
    GOOGLE_REDIRECT_URI: z.url().optional(),
});

const parseEnv = () => {
    const result = envSchema.safeParse(process.env);

    if (!result.success) {
        // Throw instead of process.exit so the failure surfaces in Vercel
        // function logs as a real stack trace instead of a silent Lambda exit.
        const formatted = z.prettifyError(result.error);
        throw new Error(`Invalid environment variables:\n${formatted}`);
    }

    return result.data;
};

export const env = parseEnv();