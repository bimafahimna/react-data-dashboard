"use server";

import { deleteSessionTokens } from "@/lib/session";
import { redirect } from "next/navigation";

export async function logoutAction() {
    await deleteSessionTokens();
    redirect("/login");
}
