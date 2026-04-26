import { JWTPayload, SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import ms, { StringValue } from "ms";

const secretKey = process.env.SECRET_KEY || "default_secret_key_change_me";
const algorithm = process.env.JWT_ALGORITHM || "HS256";
const key = new TextEncoder().encode(secretKey);

export const accessTokenKey = process.env.ACCESS_TOKEN_KEY || "access_token";
const accessTokenLifetime = (process.env.ACCESS_TOKEN_LIFETIME || "2h").trim();

export const refreshTokenKey = process.env.REFRESH_TOKEN_KEY || "refresh_token";
const refreshTokenLifetime = (process.env.REFRESH_TOKEN_LIFETIME || "3d").trim();

export type TokenPayload = {
  email: string;
  accountId: number;
};

export type SessionPayload = TokenPayload & JWTPayload;

export async function encrypt(payload: TokenPayload, lifetime: string) {
  return new SignJWT(payload as JWTPayload)
    .setProtectedHeader({ alg: algorithm })
    .setIssuedAt()
    .setExpirationTime(lifetime)
    .sign(key);
}

export async function decrypt(input: string): Promise<SessionPayload> {
  try {
    const { payload } = await jwtVerify(input, key, {
      algorithms: [algorithm],
    });
    return payload as SessionPayload;
  } catch {
    throw new Error("invalid or expired token");
  }
}

export async function setSessionTokens(payload: TokenPayload) {
  await Promise.all([
    setAccessToken(payload),
    setRefreshToken(payload),
  ]);
}

export async function setAccessToken(payload: TokenPayload) {
  await setToken(payload, { key: accessTokenKey, lifetime: accessTokenLifetime });
}

export async function setRefreshToken(payload: TokenPayload) {
  await setToken(payload, { key: refreshTokenKey, lifetime: refreshTokenLifetime });
}

async function setToken(payload: TokenPayload, config: { key: string, lifetime: string }) {
  const token = await encrypt(payload, config.lifetime);
  const cookieStore = await cookies();
  cookieStore.set(config.key, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(ms(config.lifetime as StringValue) / 1000)
  });
}

export async function deleteSessionTokens() {
  await Promise.all([
    deleteAccessToken(),
    deleteRefreshToken(),
  ]);
}

export async function deleteAccessToken() {
  await deleteToken(accessTokenKey);
}

export async function deleteRefreshToken() {
  await deleteToken(refreshTokenKey);
}

async function deleteToken(key: string) {
  const cookieStore = await cookies();
  cookieStore.delete(key);
}

export async function getAccessToken(): Promise<SessionPayload | null> {
  return getToken(accessTokenKey);
}

export async function getRefreshToken(): Promise<SessionPayload | null> {
  return getToken(refreshTokenKey);
}

async function getToken(key: string): Promise<SessionPayload | null> {
  const session = (await cookies()).get(key)?.value;
  if (!session) return null;

  try {
    return await decrypt(session);
  } catch {
    return null;
  }
}
