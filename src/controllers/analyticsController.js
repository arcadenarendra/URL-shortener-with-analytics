import * as analytics from '../services/analyticsService.js';
import * as urlService from '../services/urlService.js';

const owner = (req) => req.userId;

/** Every analytics route is scoped to the authenticated owner, never by id alone. */
async function withOwnership(req, res, next) {
  try {
    req.urlDoc = await urlService.getOwnedUrl({ urlId: req.params.id, userId: owner(req) });
    return next();
  } catch (err) {
    return next(err);
  }
}

export { withOwnership };

export async function summary(req, res, next) {
  try {
    res.json({ analytics: await analytics.summary({ urlId: req.params.id, range: req.validatedQuery.range }) });
  } catch (err) {
    next(err);
  }
}

export async function timeseries(req, res, next) {
  try {
    res.json({ analytics: await analytics.timeseries({ urlId: req.params.id, range: req.validatedQuery.range }) });
  } catch (err) {
    next(err);
  }
}

export async function breakdown(req, res, next) {
  try {
    res.json({
      analytics: await analytics.breakdown({
        urlId: req.params.id,
        range: req.validatedQuery.range,
        limit: req.validatedQuery.limit,
      }),
    });
  } catch (err) {
    next(err);
  }
}

export async function recent(req, res, next) {
  try {
    res.json({ clicks: await analytics.recentClicks({ urlId: req.params.id, limit: req.validatedQuery.limit }) });
  } catch (err) {
    next(err);
  }
}

export async function daily(req, res, next) {
  try {
    res.json({ dailyStats: await analytics.dailyStats({ urlId: req.params.id, limit: req.validatedQuery.limit }) });
  } catch (err) {
    next(err);
  }
}
