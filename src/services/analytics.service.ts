import ClinicVisit from "../models/clinicVisit.model";
import type { ComplaintCount } from "./report.service";

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "July",
  "Aug",
  "Sept",
  "Oct",
  "Nov",
  "Dec",
];

export class AnalyticsService {
  /**
   * Returns visits per month for the last `months` months (including current month).
   */
  async getMonthlyVisits(months = 4): Promise<{ month: string; value: number }[]> {
    const now = new Date();

    if (months <= 0) return [];

    // build an array of month starts for lookup
    const buckets: { key: string; start: Date; end: Date }[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
      const key = `${start.getFullYear()}-${start.getMonth()}`;
      buckets.push({ key, start, end });
    }

    // fetch visits in the full range
    const overallStart = buckets[0]?.start;
    const overallEnd = buckets[buckets.length - 1]?.end;

    if (!overallStart || !overallEnd) return [];

    const visits = await ClinicVisit.find({ visitDate: { $gte: overallStart, $lte: overallEnd }, isActive: true }).select(
      "visitDate"
    );

    const counts = new Map<string, number>();

    for (const visit of visits) {
      const d = new Date(visit.visitDate as Date);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    return buckets.map((b) => ({ month: MONTH_NAMES[new Date(b.start).getMonth()] || "", value: counts.get(b.key) || 0 }));
  }

  /**
   * Returns complaint counts between startDate and endDate (inclusive).
   */
  async getComplaintCounts(startDate: Date, endDate: Date): Promise<ComplaintCount[]> {
    const pipeline: any[] = [
      { $match: { visitDate: { $gte: startDate, $lte: endDate }, isActive: true } },
      {
        $group: {
          _id: { $ifNull: ["$complaint", "Unspecified"] },
          count: { $sum: 1 },
        },
      },
      { $project: { _id: 0, complaint: "$_id", count: 1 } },
      { $sort: { count: -1 } },
    ];

    const result = (await ClinicVisit.aggregate(pipeline)) as { complaint: string; count: number }[];
    return result;
  }
}

export default new AnalyticsService();
