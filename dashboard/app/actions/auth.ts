"use server";

import { prisma } from "@/lib/prisma";
import bcryptjs from "bcryptjs";

export type SignupResult = {
  success: boolean;
  message: string;
};

export async function signupUser(data: {
  fullName: string;
  email: string;
  password: string;
}): Promise<SignupResult> {
  const { fullName, email, password } = data;

  // --- Basic validation ---
  if (!fullName || !email || !password) {
    return { success: false, message: "All fields are required." };
  }

  if (password.length < 8) {
    return { success: false, message: "Password must be at least 8 characters." };
  }

  // --- Check if user already exists ---
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    return { success: false, message: "An account with this email already exists." };
  }

  // --- Hash the password securely ---
  const hashedPassword = await bcryptjs.hash(password, 10);

  // --- Save the new user to the database ---
  await prisma.user.create({
    data: {
      fullName,
      email,
      password: hashedPassword,
    },
  });

  return { success: true, message: "Account created successfully!" };
}

export async function loginUser(data: {
  email: string;
  password: string;
}): Promise<SignupResult> {
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

