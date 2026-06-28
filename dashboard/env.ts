// src/env.ts
import { z } from "zod";

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
    GOOGLE_REDIRECT_URI: z.url()
});

// This will throw a loud, clear error immediately if any variable is missing or invalid
const parseEnv = () => {
    const result = envSchema.safeParse(process.env);

    if (!result.success) {
        console.error("Invalid environment variables:");
        console.error(JSON.stringify(result.error.format(), null, 2));

        // Crash the app immediately in production/development so it doesn't run broken
        process.exit(1);
    }

    return result.data;
};

export const env = parseEnv();