import "server-only";
import { redirect } from "next/navigation";
import { getAccessToken } from "./session";

/** Returns the current user's accountId, or redirects to login. */
export async function requireAccountId(): Promise<number> {
  const session = await getAccessToken();
  if (!session) redirect("/login");
  return session.accountId;
}
