import mongoose from 'mongoose';

/**
 * Pre-aggregated per-day counters so analytics dashboards read O(days) documents
 * instead of scanning every raw click. Updated in the same bulk write as the
 * click itself; the pipeline degrades gracefully if this collection is empty.
 */
const dailyStatsSchema = new mongoose.Schema(
  {
    urlId: { type: mongoose.Schema.Types.ObjectId, ref: 'Url', required: true },
    date: { type: String, required: true }, // YYYY-MM-DD (UTC)
    clicks: { type: Number, default: 0 },
    uniqueVisitors: { type: Number, default: 0 },
  },
  { versionKey: false, timestamps: { createdAt: true, updatedAt: true } }
);

dailyStatsSchema.index({ urlId: 1, date: -1 }, { unique: true });
dailyStatsSchema.index({ urlId: 1 });

const DailyStats = mongoose.model('DailyStats', dailyStatsSchema);
export default DailyStats;
