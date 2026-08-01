import { getAccessToken } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export type AdminActor = { accountId: number; email: string };

export async function getAdminActor(): Promise<AdminActor | null> {
  const token = await getAccessToken();
  if (!token) return null;

  const user = await prisma.user.findUnique({
    where: { accountId: token.accountId },
    select: { accountId: true, email: true, role: true },
  });

  if (!user || user.role !== "ADMIN") return null;
  return { accountId: user.accountId, email: user.email };
}

export async function requireAdmin(): Promise<AdminActor> {
  const actor = await getAdminActor();
  if (!actor) throw new Error("FORBIDDEN");
  return actor;
}
