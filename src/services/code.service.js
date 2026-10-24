import { randomBytes } from "node:crypto";

const DEFAULT_CODE_LENGTH = 7;
const DEFAULT_MAX_ATTEMPTS = 5;
const MIN_CODE_LENGTH = 4;
const MAX_CODE_LENGTH = 32;
const ALIAS_PATTERN = /^[A-Za-z0-9_-]+$/;
const RESERVED_ALIASES = new Set([
  "admin",
  "api",
  "docs",
  "health",
]);

function getCodeLength() {
  const configuredLength = Number.parseInt(
    process.env.SHORT_CODE_LENGTH ?? String(DEFAULT_CODE_LENGTH),
    10,
  );

  if (
    !Number.isInteger(configuredLength) ||
    configuredLength < MIN_CODE_LENGTH ||
    configuredLength > MAX_CODE_LENGTH
  ) {
    throw new Error(
      `SHORT_CODE_LENGTH must be an integer between ${MIN_CODE_LENGTH} and ${MAX_CODE_LENGTH}.`,
    );
  }

  return configuredLength;
}

function getMaxAttempts() {
  const configuredAttempts = Number.parseInt(
    process.env.MAX_CODE_GENERATION_ATTEMPTS ?? String(DEFAULT_MAX_ATTEMPTS),
    10,
  );

  if (!Number.isInteger(configuredAttempts) || configuredAttempts < 1) {
    throw new Error("MAX_CODE_GENERATION_ATTEMPTS must be a positive integer.");
  }

  return configuredAttempts;
}

export function generateCode(length = getCodeLength()) {
  if (
    !Number.isInteger(length) ||
    length < MIN_CODE_LENGTH ||
    length > MAX_CODE_LENGTH
  ) {
    throw new Error(
      `Code length must be an integer between ${MIN_CODE_LENGTH} and ${MAX_CODE_LENGTH}.`,
    );
  }

  return randomBytes(length).toString("base64url").slice(0, length);
}

export function validateCustomAlias(alias) {
  if (
    typeof alias !== "string" ||
    alias.length < MIN_CODE_LENGTH ||
    alias.length > MAX_CODE_LENGTH ||
    !ALIAS_PATTERN.test(alias)
  ) {
    return false;
  }

  return !RESERVED_ALIASES.has(alias.toLowerCase());
}

export async function generateAvailableCode(codeExists) {
  if (typeof codeExists !== "function") {
    throw new TypeError("codeExists must be a function.");
  }

  const maxAttempts = getMaxAttempts();

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const code = generateCode();

    if (!(await codeExists(code))) {
      return code;
    }
  }

  throw new Error(
    `Unable to generate an available short code after ${maxAttempts} attempts.`,
  );
}

export const codeServiceConstants = Object.freeze({
  DEFAULT_CODE_LENGTH,
  DEFAULT_MAX_ATTEMPTS,
  MIN_CODE_LENGTH,
  MAX_CODE_LENGTH,
  RESERVED_ALIASES: [...RESERVED_ALIASES],
});
