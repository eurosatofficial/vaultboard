import { isIP } from "node:net";
import { z } from "zod";

const text = (max: number) => z.string().trim().max(max);
const requiredText = (max: number) => z.string().trim().min(1).max(max);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Choose a valid hex color");
const nullableId = z.string().uuid().nullable().optional();

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  displayName: requiredText(80),
  password: z
    .string()
    .min(12, "Password must be at least 12 characters")
    .max(128)
    .refine((value) => /[A-Za-z]/.test(value) && /\d/.test(value), {
      message: "Password must contain a letter and a number",
    }),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
});

export const passwordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: registerSchema.shape.password,
});

export const serverSchema = z.object({
  name: requiredText(120),
  hostname: text(253).refine(
    (value) => !value || /^(?=.{1,253}$)([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(value),
    "Enter a valid hostname",
  ),
  ipAddress: text(45).refine((value) => !value || isIP(value) !== 0, "Enter a valid IPv4 or IPv6 address"),
  operatingSystem: text(100),
  provider: text(100),
  location: text(120),
  notes: text(5000),
  tagIds: z.array(z.string().uuid()).max(30).default([]),
});

export const serviceSchema = z.object({
  name: requiredText(120),
  serverId: z.string().uuid(),
  url: text(2048).refine((value) => {
    if (!value) return true;
    try {
      const parsed = new URL(value);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }, "Enter a valid HTTP or HTTPS URL"),
  port: z.union([z.number().int().min(1).max(65535), z.null()]).optional(),
  categoryId: nullableId,
  description: text(2000),
  status: z.enum(["operational", "degraded", "down", "maintenance", "unknown"]),
});

export const tagSchema = z.object({
  name: requiredText(50),
  color,
});

export const categorySchema = tagSchema;

export const profileSchema = z.object({
  displayName: requiredText(80),
});

export const uuidParamSchema = z.string().uuid();

export function parseLimit(value: unknown, fallback = 100, maximum = 250) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}
