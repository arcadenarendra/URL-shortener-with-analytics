import Url from "../models/url.model.js";
import { ApiError } from "../utils/ApiError.js";
import { cacheUrl, getCachedUrl } from "./cache.service.js";

export async function resolveAndRecordRedirect(shortCode) {
  const cachedUrl = await getCachedUrl(shortCode);
  if (cachedUrl) {
    const updatedUrl = await Url.findOneAndUpdate(
      {
        _id: cachedUrl.id,
        shortCode,
        isActive: true,
        $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
      },
      { $inc: { clickCount: 1 } },
      { new: true, runValidators: true },
    ).exec();

    if (updatedUrl) {
      return { id: updatedUrl._id, originalUrl: cachedUrl.originalUrl };
    }
  }

  const url = await Url.findOneAndUpdate(
    {
      shortCode,
      isActive: true,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    },
    {
      $inc: { clickCount: 1 },
    },
    {
      new: true,
      runValidators: true,
    },
  ).exec();

  if (!url) {
    throw new ApiError(
      404,
      "URL_NOT_FOUND",
      "The requested short URL was not found.",
    );
  }

  await cacheUrl(shortCode, url);
  return { id: url._id, originalUrl: url.originalUrl };
}
