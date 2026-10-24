import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";

function getJwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured.");
  }
  return process.env.JWT_SECRET;
}

function toPublicUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
  };
}

function signToken(user) {
  return jwt.sign({ sub: user._id.toString() }, getJwtSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN ?? "1h",
  });
}

export async function registerUser({ name, email, password }) {
  const normalizedEmail = email.toLowerCase();
  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const user = await User.create({
      name,
      email: normalizedEmail,
      passwordHash,
    });

    return { user: toPublicUser(user), token: signToken(user) };
  } catch (error) {
    if (error?.code === 11000) {
      throw new ApiError(409, "EMAIL_ALREADY_EXISTS", "Email is already registered.");
    }
    throw error;
  }
}

export async function loginUser({ email, password }) {
  const user = await User.findOne({ email: email.toLowerCase() })
    .select("+passwordHash")
    .exec();

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
  }

  return { user: toPublicUser(user), token: signToken(user) };
}

export async function getUserById(userId) {
  const user = await User.findById(userId).exec();
  if (!user) {
    throw new ApiError(401, "INVALID_TOKEN", "The authentication token is invalid.");
  }
  return toPublicUser(user);
}

export { getJwtSecret };
