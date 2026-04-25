"use server";

import { prisma } from "@/lib/prisma";
import bcryptjs from "bcryptjs";
import { setSessionTokens } from "@/lib/session";
import { redirect } from "next/navigation";

export type AuthResult = {
  email?: string;
  success: boolean;
  message: string;
};

export async function loginUser(data: {
  email: string;
  password: string;
}): Promise<AuthResult> {
  const { email, password } = data;

  if (!email || !password) {
    return { success: false, message: "Email and password are required." };
  }

  const normalizedEmail = email.trim().toLowerCase();

  let user;
  try {
    user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        password: true,
        email: true,
        accountId: true,
      },
    });
  } catch (error) {
    console.error("Database error during login:", error);
    return { success: false, message: "An error occurred. Please try again later." };
  }

  if (!user) {
    return { success: false, message: "Invalid email or password." };
  }

  const isPasswordValid = await bcryptjs.compare(password, user.password);

  if (!isPasswordValid) {
    return { success: false, message: "Invalid email or password." };
  }

  await setSessionTokens({ email: user.email, accountId: user.accountId });
  redirect("/dashboard");
}

export async function loginAction(prevState: any, formData: FormData): Promise<AuthResult> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  return loginUser({ email, password, ...prevState });
}
