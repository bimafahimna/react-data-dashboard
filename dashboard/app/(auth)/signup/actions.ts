"use server";

import { prisma } from "@/lib/prisma";
import { setSessionTokens } from "@/lib/session";
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

  try {
    const user = await prisma.$transaction(
      async (tx) => {
        const existingUser = await tx.user.findUnique({
          where: { email: normalizedEmail },
          select: { id: true },
        });

        if (existingUser) {
          throw new Error("An account with this email already exists.");
        }

        const hashedPassword = await bcryptjs.hash(password, (Number(process.env.PASSWORD_HASH_SALT) || 10));

        return await tx.user.create({
          data: {
            fullName: normalizedFullName,
            email: normalizedEmail,
            password: hashedPassword,
            
          },
        });
      },
      {
        timeout: REQUEST_TIMEOUT_MS,
      }
    );

    await setSessionTokens({ email: user.email, accountId: user.accountId });
    if (process.env.NODE_ENV === "test") {
      return { success: true, message: "Account created successfully!" };
    }
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "An account with this email already exists.") {
        return { success: false, message: error.message };
      }
      if (error.message.includes("timeout") || error.message.includes("Timed out")) {
        return { success: false, message: "The signup request took too long. Please try again." };
      }
      return { success: false, message: "An error occurred during signup. Please try again." };
    }
    throw error;
  }
  redirect("/dashboard");
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
