import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { signupUser, signupAction } from "./actions";

// --- Mock external dependencies ---
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("hashed_password"),
  },
}));

// -------------------------------------------------------------------

describe("signupUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("returns error when fullName is missing", async () => {
      const result = await signupUser({ fullName: "", email: "test@test.com", password: "password123" });
      expect(result).toEqual({ success: false, message: "All fields are required." });
    });

    it("returns error when email is missing", async () => {
      const result = await signupUser({ fullName: "John Doe", email: "", password: "password123" });
      expect(result).toEqual({ success: false, message: "All fields are required." });
    });

    it("returns error when password is missing", async () => {
      const result = await signupUser({ fullName: "John Doe", email: "test@test.com", password: "" });
      expect(result).toEqual({ success: false, message: "All fields are required." });
    });

    it("returns error when password is shorter than 8 characters", async () => {
      const result = await signupUser({ fullName: "John Doe", email: "test@test.com", password: "pass" });
      expect(result).toEqual({ success: false, message: "Password must be at least 8 characters." });
    });
  });

  describe("database checks", () => {
    it("returns error when email already exists", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: "existing-id",
        fullName: "Existing User",
        email: "taken@test.com",
        password: "hashed",
        accountId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await signupUser({ fullName: "John Doe", email: "taken@test.com", password: "password123" });
      expect(result).toEqual({ success: false, message: "An account with this email already exists." });
    });

    it("creates a new user and returns success when all data is valid", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.user.create).mockResolvedValue({} as any);

      const result = await signupUser({ fullName: "John Doe", email: "new@test.com", password: "password123" });

      expect(prisma.user.create).toHaveBeenCalledOnce();
      expect(result).toEqual({ success: true, message: "Account created successfully!" });
    });
  });
});

// -------------------------------------------------------------------

describe("signupAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const makeFormData = (fields: Record<string, string>) => {
    const formData = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      formData.append(key, value);
    }
    return formData;
  };

  it("returns error when passwords do not match", async () => {
    const formData = makeFormData({
      fullName: "John Doe",
      email: "test@test.com",
      password: "password123",
      confirmPassword: "different456",
    });

    const result = await signupAction(null, formData);
    expect(result).toEqual({ success: false, message: "Passwords do not match!" });
  });

  it("calls signupUser when passwords match", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue({} as any);

    const formData = makeFormData({
      fullName: "John Doe",
      email: "new@test.com",
      password: "password123",
      confirmPassword: "password123",
    });

    const result = await signupAction(null, formData);
    expect(result).toEqual({ success: true, message: "Account created successfully!" });
  });
});
