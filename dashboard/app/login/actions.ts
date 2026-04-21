"use server";

import { prisma } from "@/lib/prisma";
import bcryptjs from "bcryptjs";

export type AuthResult = {
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

  // --- Find user by email ---
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    return { success: false, message: "Invalid email or password." };
  }

  // --- Compare password ---
  const isPasswordValid = await bcryptjs.compare(password, user.password);

  if (!isPasswordValid) {
    return { success: false, message: "Invalid email or password." };
  }

  // Successful login (Session handling would happen here)
  return { success: true, message: "Login successful!" };
}

export async function loginAction(prevState: any, formData: FormData): Promise<AuthResult> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  return loginUser({ email, password });
}
