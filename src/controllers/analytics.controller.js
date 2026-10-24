import { getUrlStats } from "../services/analytics.service.js";

export async function statsController(req, res, next) {
  try {
    const stats = await getUrlStats(req.user.id, req.params.code, req.query);
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
}
