import * as urlService from '../services/urlService.js';
import config from '../config/env.js';

function toDto(doc) {
  const obj = typeof doc.toObject === 'function' ? doc.toObject({ virtuals: true }) : doc;
  return {
    id: obj._id ? String(obj._id) : obj.id,
    code: obj.code,
    shortUrl: `${config.baseUrl}/${obj.code}`,
    longUrl: obj.longUrl,
    title: obj.title ?? null,
    customAlias: obj.customAlias,
    totalClicks: obj.totalClicks ?? 0,
    maxClicks: obj.maxClicks ?? null,
    isActive: obj.isActive,
    expiresAt: obj.expiresAt ?? null,
    isExpired: Boolean(obj.isExpired),
    isExhausted: Boolean(obj.isExhausted),
    createdAt: obj.createdAt,
  };
}

export async function create(req, res, next) {
  try {
    const doc = await urlService.createUrl({ ...req.body, userId: req.userId });
    res.status(201).json({ url: toDto(doc) });
  } catch (err) {
    next(err);
  }
}

export async function list(req, res, next) {
  try {
    const { page, limit, isActive } = req.validatedQuery;
    const result = await urlService.listUrls({ userId: req.userId, page, limit, isActive });
    res.json({
      urls: result.items.map(toDto),
      pagination: { page: result.page, limit: result.limit, total: result.total, pages: result.pages },
    });
  } catch (err) {
    next(err);
  }
}

export async function getOne(req, res, next) {
  try {
    const doc = await urlService.getOwnedUrl({ urlId: req.params.id, userId: req.userId });
    res.json({ url: toDto(doc) });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const doc = await urlService.updateUrl({ urlId: req.params.id, userId: req.userId, patch: req.body });
    res.json({ url: toDto(doc) });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    await urlService.deleteUrl({ urlId: req.params.id, userId: req.userId });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export { toDto };
