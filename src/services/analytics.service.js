import ClickEvent from "../models/clickEvent.model.js";
import { getOwnedUrl } from "./url.service.js";

function truncate(value, length) {
  return typeof value === "string" ? value.slice(0, length) : null;
}

export async function recordClick({ urlId, referrer, userAgent }) {
  return ClickEvent.create({
    urlId,
    referrer: truncate(referrer, 2048),
    userAgent: truncate(userAgent, 512),
  });
}

export async function getUrlStats(userId, shortCode, { days = 30, limit = 20 } = {}) {
  const url = await getOwnedUrl(userId, shortCode);
  const safeDays = Math.min(365, Math.max(1, Number.parseInt(days, 10) || 30));
  const safeLimit = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 20));
  const since = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);
  const eventFilter = { urlId: url._id, clickedAt: { $gte: since } };

  const [recentEvents, clicksOverTime, referrers, userAgents] = await Promise.all([
    ClickEvent.find(eventFilter)
      .sort({ clickedAt: -1 })
      .limit(safeLimit)
      .select("clickedAt referrer userAgent -_id")
      .lean()
      .exec(),
    ClickEvent.aggregate([
      { $match: eventFilter },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$clickedAt" },
          },
          clicks: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, date: "$_id", clicks: 1 } },
    ]).exec(),
    ClickEvent.aggregate([
      { $match: eventFilter },
      { $group: { _id: { $ifNull: ["$referrer", "direct"] }, clicks: { $sum: 1 } } },
      { $sort: { clicks: -1 } },
      { $limit: 20 },
      { $project: { _id: 0, referrer: "$_id", clicks: 1 } },
    ]).exec(),
    ClickEvent.aggregate([
      { $match: eventFilter },
      { $group: { _id: { $ifNull: ["$userAgent", "unknown"] }, clicks: { $sum: 1 } } },
      { $sort: { clicks: -1 } },
      { $limit: 20 },
      { $project: { _id: 0, userAgent: "$_id", clicks: 1 } },
    ]).exec(),
  ]);

  return {
    shortCode: url.shortCode,
    totalClicks: url.clickCount,
    period: { days: safeDays, since },
    clicksOverTime,
    recentEvents,
    referrers,
    userAgents,
  };
}
