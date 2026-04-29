"use server";

import bcryptjs from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getAccessToken } from "@/lib/session";

export type PasswordActionResult = {
  success: boolean;
  message: string;
};

export async function changePasswordAction(
  _prevState: PasswordActionResult | null,
  formData: FormData
): Promise<PasswordActionResult> {
  const currentPassword = String(formData.get("currentPassword") || "");
  const newPassword = String(formData.get("newPassword") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (!currentPassword || !newPassword || !confirmPassword) {
    return { success: false, message: "All password fields are required." };
  }

  if (newPassword.length < 8) {
    return { success: false, message: "New password must be at least 8 characters." };
  }

  if (newPassword !== confirmPassword) {
    return { success: false, message: "New password and confirmation do not match." };
  }

  if (currentPassword === newPassword) {
    return { success: false, message: "New password must be different from current password." };
  }

  const session = await getAccessToken();
  if (!session?.accountId) {
    return { success: false, message: "Session expired. Please login again." };
  }

  const user = await prisma.user.findUnique({
    where: { accountId: session.accountId },
    select: { password: true },
  });

  if (!user) {
    return { success: false, message: "User not found." };
  }

  const isCurrentPasswordValid = await bcryptjs.compare(currentPassword, user.password);
  if (!isCurrentPasswordValid) {
    return { success: false, message: "Current password is incorrect." };
  }

  const hashedPassword = await bcryptjs.hash(newPassword, Number(process.env.PASSWORD_HASH_SALT) || 10);
  await prisma.user.update({
    where: { accountId: session.accountId },
    data: { password: hashedPassword },
  });

  return { success: true, message: "Password updated successfully." };
}
