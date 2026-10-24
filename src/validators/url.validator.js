import { z } from "zod";
import { validateCustomAlias } from "../services/code.service.js";

const httpUrlSchema = z.string().refine((value) => {
  try {
    const parsedUrl = new URL(value);
    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
  } catch {
    return false;
  }
}, "originalUrl must be a valid HTTP or HTTPS URL.");

export const createUrlSchema = z
  .object({
    originalUrl: httpUrlSchema,
    customAlias: z
      .string()
      .refine(
        validateCustomAlias,
        "customAlias must be 4-32 characters using only letters, numbers, hyphens, or underscores, and must not be reserved.",
      )
      .optional(),
    expiresAt: z
      .string()
      .datetime({ offset: true })
      .refine(
        (value) => new Date(value).getTime() > Date.now(),
        "expiresAt must be in the future.",
      )
      .optional(),
  })
  .strict();

export const updateUrlSchema = z
  .object({
    isActive: z.boolean().optional(),
    expiresAt: z
      .string()
      .datetime({ offset: true })
      .refine(
        (value) => new Date(value).getTime() > Date.now(),
        "expiresAt must be in the future.",
      )
      .nullable()
      .optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required.");
