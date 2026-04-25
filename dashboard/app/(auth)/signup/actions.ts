"use server";

import { prisma } from "@/lib/prisma";
import { setSessionTokens } from "@/lib/session";
import { withTimeout } from "@/lib/utility";
import bcryptjs from "bcryptjs";
import { redirect } from "next/navigation";

export type AuthResult = {
  success: boolean;
  message: string;
};

const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 5000);

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

  const normalizedEmail = email.trim().toLowerCase();
  const normalizedFullName = fullName.trim();

  let existingUser;
  try {
    existingUser = await withTimeout(
      prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true },
      }),
      REQUEST_TIMEOUT_MS
    );
  } catch (error) {
    if (error instanceof Error && error.message === "timeout") {
      return { success: false, message: "The signup request took too long. Please try again." };
    }
    throw error;
  }

  if (existingUser) {
    return { success: false, message: "An account with this email already exists." };
  }

  let hashedPassword;
  try {
    hashedPassword = await bcryptjs.hash(password, (Number(process.env.PASSWORD_HASH_SALT) || 10));
  } catch (error) {
    return { success: false, message: "An error occurred while hashing the password." };
  }

  let user;
  try {
    user = await withTimeout(
      prisma.user.create({
        data: {
          fullName: normalizedFullName,
          email: normalizedEmail,
          password: hashedPassword,
        },
      }),
      REQUEST_TIMEOUT_MS
    );
  } catch (error) {
    if (error instanceof Error && error.message === "timeout") {
      return { success: false, message: "The signup request took too long. Please try again." };
    }
    throw error;
  }

    await setSessionTokens({ email: user.email, accountId: user.accountId });
    if (process.env.NODE_ENV === "test") {
      return { success: true, message: "Account created successfully!" };
    }
    redirect("/dashboard/home");
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
