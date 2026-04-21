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

const MOCK_EXISTING_USER = {
  id: "existing-id",
  fullName: "Existing User",
  email: "taken@test.com",
  password: "hashed",
  accountId: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("signupUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it.each([
      {
        name: "fullName is empty",
        input: { fullName: "", email: "test@test.com", password: "password123" },
        expected: { success: false, message: "All fields are required." },
      },
      {
        name: "email is empty",
        input: { fullName: "John Doe", email: "", password: "password123" },
        expected: { success: false, message: "All fields are required." },
      },
      {
        name: "password is empty",
        input: { fullName: "John Doe", email: "test@test.com", password: "" },
        expected: { success: false, message: "All fields are required." },
      },
      {
        name: "password is shorter than 8 characters",
        input: { fullName: "John Doe", email: "test@test.com", password: "pass" },
        expected: { success: false, message: "Password must be at least 8 characters." },
      },
    ])("returns error when $name", async ({ input, expected }) => {
      const result = await signupUser(input);
      expect(result).toEqual(expected);
    });
  });

  describe("database checks", () => {
    it.each([
      {
        name: "email already exists",
        mockFindUnique: MOCK_EXISTING_USER,
        mockCreate: null,
        input: { fullName: "John Doe", email: "taken@test.com", password: "password123" },
        expected: { success: false, message: "An account with this email already exists." },
        expectCreate: false,
      },
      {
        name: "all data is valid",
        mockFindUnique: null,
        mockCreate: {} as any,
        input: { fullName: "John Doe", email: "new@test.com", password: "password123" },
        expected: { success: true, message: "Account created successfully!" },
        expectCreate: true,
      },
    ])("$name", async ({ mockFindUnique, mockCreate, input, expected, expectCreate }) => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockFindUnique);
      if (mockCreate !== null) {
        vi.mocked(prisma.user.create).mockResolvedValue(mockCreate);
      }

      const result = await signupUser(input);

      if (expectCreate) {
        expect(prisma.user.create).toHaveBeenCalledOnce();
      }
      expect(result).toEqual(expected);
    });
  });
});

// -------------------------------------------------------------------

const makeFormData = (fields: Record<string, string>) => {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value);
  }
  return formData;
};

describe("signupAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    {
      name: "passwords do not match",
      fields: {
        fullName: "John Doe",
        email: "test@test.com",
        password: "password123",
        confirmPassword: "different456",
      },
      mockFindUnique: null,
      mockCreate: null,
      expected: { success: false, message: "Passwords do not match!" },
    },
    {
      name: "passwords match and user is new",
      fields: {
        fullName: "John Doe",
        email: "new@test.com",
        password: "password123",
        confirmPassword: "password123",
      },
      mockFindUnique: null,
      mockCreate: {} as any,
      expected: { success: true, message: "Account created successfully!" },
    },
  ])("returns correct result when $name", async ({ fields, mockFindUnique, mockCreate, expected }) => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockFindUnique);
    if (mockCreate !== null) {
      vi.mocked(prisma.user.create).mockResolvedValue(mockCreate);
    }

    const result = await signupAction(null, makeFormData(fields));
    expect(result).toEqual(expected);
  });
});
