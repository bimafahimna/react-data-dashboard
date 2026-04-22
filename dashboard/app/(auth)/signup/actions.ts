"use server";

import { prisma } from "@/lib/prisma";
import { setSessionTokens } from "@/lib/session";
import bcryptjs from "bcryptjs";
import { redirect } from "next/navigation";

export type AuthResult = {
  success: boolean;
  message: string;
};

function validateSignupData(data: {
  fullName: string;
  email: string;
  password: string;
}): AuthResult | null {
  const { fullName, email, password } = data;

  if (!fullName || !email || !password) {
    return { success: false, message: "All fields are required." };
  }

  if (password.length < 8) {
    return { success: false, message: "Password must be at least 8 characters." };
  }

  return null;
}

export async function signupUser(data: {
  fullName: string;
  email: string;
  password: string;
}): Promise<AuthResult> {
  const validation = validateSignupData(data);
  if (validation) return validation;

  const { fullName, email, password } = data;

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    return { success: false, message: "An account with this email already exists." };
  }

  const hashedPassword = await bcryptjs.hash(password, (Number(process.env.PASSWORD_HASH_SALT) || 10));

  const user = await prisma.user.create({
    data: {
      fullName,
      email,
      password: hashedPassword,
    },
  });

  await setSessionTokens({ email: user.email, accountId: user.accountId });
  redirect("/home");
}

export async function signupAction(prevState: any, formData: FormData): Promise<AuthResult> {
  const fullName = formData.get("fullName") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (password !== confirmPassword) {
    return { success: false, message: "Passwords do not match!" };
  }

  return signupUser({ fullName, email, password, ...prevState });
}
