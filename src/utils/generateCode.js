import { customAlphabet } from 'nanoid';

// nanoid's default alphabet is URL-safe base64, which includes - and _.
// For custom aliases users expect a strictly alphanumeric charset.
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const nanoid = customAlphabet(ALPHABET, 7);

export const CODE_LENGTH = 7;

/** Short code for auto-generated links. base62, 62^7 ≈ 3.5 trillion combinations. */
export function generateCode(length = CODE_LENGTH) {
  return length === CODE_LENGTH ? nanoid() : customAlphabet(ALPHABET, length)();
}

const RESERVED = new Set([
  'api', 'app', 'admin', 'auth', 'assets', 'static', 'public', 'docs',
  'health', 'login', 'logout', 'register', 'signup', 'signin', 'about',
  'help', 'support', 'status', 'www', 'root', 'null', 'undefined',
]);

export const RESERVED_CODES = RESERVED;

/** Custom aliases are restricted to alphanumerics, dash and underscore. */
export function isValidAlias(alias) {
  if (typeof alias !== 'string') return false;
  if (alias.length < 3 || alias.length > 32) return false;
  if (!/^[A-Za-z0-9_-]+$/.test(alias)) return false;
  if (RESERVED.has(alias.toLowerCase())) return false;
  return true;
}
