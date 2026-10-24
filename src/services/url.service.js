import Url from "../models/url.model.js";
import {
  generateAvailableCode,
  validateCustomAlias,
} from "./code.service.js";
import { ApiError } from "../utils/ApiError.js";
import { invalidateUrlCache } from "./cache.service.js";

function isDuplicateKeyError(error) {
  return error?.code === 11000;
}

export async function createUrl({ originalUrl, customAlias, expiresAt, userId = null }) {
  if (customAlias) {
    if (!validateCustomAlias(customAlias)) {
      throw new ApiError(400, "INVALID_ALIAS", "The custom alias is invalid.");
    }

    try {
      return await Url.create({
        shortCode: customAlias,
        originalUrl,
        customAlias,
        expiresAt,
        userId,
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ApiError(
          409,
          "ALIAS_ALREADY_EXISTS",
          "The custom alias is already in use.",
        );
      }
      throw error;
    }
  }

  const shortCode = await generateAvailableCode((candidate) =>
    Url.exists({ shortCode: candidate }),
  );

  try {
    return await Url.create({
      shortCode,
      originalUrl,
      expiresAt,
      userId,
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new ApiError(
        409,
        "SHORT_CODE_COLLISION",
        "Unable to reserve a unique short code. Please try again.",
      );
    }
    throw error;
  }
}

export async function listUrls(userId, { page = 1, limit = 20 } = {}) {
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 20));
  const filter = { userId };
  const [items, total] = await Promise.all([
    Url.find(filter)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean()
      .exec(),
    Url.countDocuments(filter).exec(),
  ]);
  return { items, pagination: { page: safePage, limit: safeLimit, total } };
}

export async function getOwnedUrl(userId, shortCode) {
  const url = await Url.findOne({ userId, shortCode }).exec();
  if (!url) {
    throw new ApiError(404, "URL_NOT_FOUND", "The requested short URL was not found.");
  }
  await invalidateUrlCache(shortCode);
  return url;
}

export async function updateOwnedUrl(userId, shortCode, changes) {
  const url = await Url.findOneAndUpdate(
    { userId, shortCode },
    { $set: changes },
    { new: true, runValidators: true },
  ).exec();
  if (!url) {
    throw new ApiError(404, "URL_NOT_FOUND", "The requested short URL was not found.");
  }
  await invalidateUrlCache(shortCode);
  return url;
}

export async function deleteOwnedUrl(userId, shortCode) {
  const url = await Url.findOneAndDelete({ userId, shortCode }).exec();
  if (!url) {
    throw new ApiError(404, "URL_NOT_FOUND", "The requested short URL was not found.");
  }
  await invalidateUrlCache(shortCode);
}
