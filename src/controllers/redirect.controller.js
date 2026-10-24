import { resolveAndRecordRedirect } from "../services/redirect.service.js";
import { recordClick } from "../services/analytics.service.js";

export async function redirectController(req, res, next) {
  try {
    const { id, originalUrl } = await resolveAndRecordRedirect(req.params.code);
    recordClick({
      urlId: id,
      referrer: req.get("referer"),
      userAgent: req.get("user-agent"),
    }).catch((error) => {
      console.error("Failed to record click event.", error);
    });
    res.redirect(302, originalUrl);
  } catch (error) {
    next(error);
  }
}
