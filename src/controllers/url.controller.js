import { createUrl } from "../services/url.service.js";

export async function createUrlController(req, res, next) {
  try {
    const url = await createUrl({ ...req.body, userId: req.user?.id ?? null });
    const baseUrl = process.env.BASE_URL ?? `${req.protocol}://${req.get("host")}`;

    res.status(201).json({
      success: true,
      data: {
        shortCode: url.shortCode,
        shortUrl: `${baseUrl.replace(/\/$/, "")}/${url.shortCode}`,
        originalUrl: url.originalUrl,
        expiresAt: url.expiresAt,
        createdAt: url.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
}
