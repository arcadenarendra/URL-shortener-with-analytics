import { Router } from 'express';
import * as urls from '../controllers/urlController.js';
import * as analytics from '../controllers/analyticsController.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createLimiter, apiLimiter } from '../middleware/rateLimiter.js';
import {
  createUrlSchema,
  updateUrlSchema,
  listUrlsQuery,
  analyticsSummaryQuery,
  analyticsTimeseriesQuery,
  analyticsBreakdownQuery,
  recentClicksQuery,
  dailyStatsQuery,
  idParams,
} from '../validators/schemas.js';

const router = Router();

router.use(requireAuth);

router.post('/', createLimiter, validate({ body: createUrlSchema }), urls.create);
router.get('/', apiLimiter, validate({ query: listUrlsQuery }), urls.list);
router.get('/:id', apiLimiter, validate({ params: idParams }), urls.getOne);
router.patch('/:id', apiLimiter, validate({ params: idParams, body: updateUrlSchema }), urls.update);
router.delete('/:id', apiLimiter, validate({ params: idParams }), urls.remove);

router.get(
  '/:id/analytics',
  apiLimiter,
  validate({ params: idParams, query: analyticsSummaryQuery }),
  analytics.withOwnership,
  analytics.summary
);
router.get(
  '/:id/analytics/timeseries',
  apiLimiter,
  validate({ params: idParams, query: analyticsTimeseriesQuery }),
  analytics.withOwnership,
  analytics.timeseries
);
router.get(
  '/:id/analytics/breakdown',
  apiLimiter,
  validate({ params: idParams, query: analyticsBreakdownQuery }),
  analytics.withOwnership,
  analytics.breakdown
);
router.get(
  '/:id/analytics/recent',
  apiLimiter,
  validate({ params: idParams, query: recentClicksQuery }),
  analytics.withOwnership,
  analytics.recent
);
router.get(
  '/:id/analytics/daily',
  apiLimiter,
  validate({ params: idParams, query: dailyStatsQuery }),
  analytics.withOwnership,
  analytics.daily
);

export default router;
