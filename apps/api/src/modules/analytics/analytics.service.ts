import { supabaseAdmin } from "../../lib/supabase.js";
import { AppError } from "../../lib/errors.js";

interface DailyStats {
  stat_date: string;
  total_calls: number;
  inbound_calls: number;
  outbound_calls: number;
  missed_calls: number;
  completed_calls: number;
  avg_duration_seconds: number;
  positive_sentiment: number;
  neutral_sentiment: number;
  negative_sentiment: number;
  flow_type_counts: Record<string, number>;
}

export async function getDailyCallStats(orgId: string, from: string, to: string) {
  const { data, error } = await supabaseAdmin
    .from("call_daily_stats")
    .select("*")
    .eq("organisation_id", orgId)
    .gte("stat_date", from)
    .lte("stat_date", to)
    .order("stat_date", { ascending: true });

  if (error) {
    throw new AppError(500, `Failed to get daily stats: ${error.message}`, "DB_ERROR");
  }

  // Gap-fill missing dates
  const statsMap = new Map((data ?? []).map((d) => [d.stat_date, d]));
  const filled: DailyStats[] = [];
  const current = new Date(from);
  const end = new Date(to);

  while (current <= end) {
    const dateStr = current.toISOString().split("T")[0]!;
    filled.push(
      (statsMap.get(dateStr) as DailyStats) ?? {
        stat_date: dateStr,
        total_calls: 0,
        inbound_calls: 0,
        outbound_calls: 0,
        missed_calls: 0,
        completed_calls: 0,
        avg_duration_seconds: 0,
        positive_sentiment: 0,
        neutral_sentiment: 0,
        negative_sentiment: 0,
        flow_type_counts: {},
      },
    );
    current.setDate(current.getDate() + 1);
  }

  return filled;
}

export async function getFlowTypeBreakdown(orgId: string, from: string, to: string) {
  const stats = await getDailyCallStats(orgId, from, to);

  const totals: Record<string, number> = {};
  for (const day of stats) {
    const counts = day.flow_type_counts ?? {};
    for (const [type, count] of Object.entries(counts)) {
      totals[type] = (totals[type] ?? 0) + (count as number);
    }
  }

  return Object.entries(totals).map(([name, value]) => ({ name, value }));
}

export async function getSentimentTrend(orgId: string, from: string, to: string) {
  const stats = await getDailyCallStats(orgId, from, to);

  // Aggregate by week
  const weeks: Record<string, { positive: number; neutral: number; negative: number }> = {};

  for (const day of stats) {
    const date = new Date(day.stat_date);
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay());
    const weekKey = weekStart.toISOString().split("T")[0]!;

    if (!weeks[weekKey]) {
      weeks[weekKey] = { positive: 0, neutral: 0, negative: 0 };
    }
    weeks[weekKey]!.positive += day.positive_sentiment;
    weeks[weekKey]!.neutral += day.neutral_sentiment;
    weeks[weekKey]!.negative += day.negative_sentiment;
  }

  return Object.entries(weeks).map(([week, data]) => ({
    week,
    ...data,
  }));
}

export async function getComparisonStats(orgId: string, from: string, to: string) {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const periodDays = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));

  // Previous period
  const prevFrom = new Date(fromDate);
  prevFrom.setDate(prevFrom.getDate() - periodDays);
  const prevTo = new Date(fromDate);
  prevTo.setDate(prevTo.getDate() - 1);

  const [current, previous] = await Promise.all([
    getDailyCallStats(orgId, from, to),
    getDailyCallStats(orgId, prevFrom.toISOString().split("T")[0]!, prevTo.toISOString().split("T")[0]!),
  ]);

  const sum = (arr: DailyStats[], key: keyof DailyStats) =>
    arr.reduce((s, d) => s + (Number(d[key]) || 0), 0);

  const currentTotal = sum(current, "total_calls");
  const previousTotal = sum(previous, "total_calls");
  const currentDuration = sum(current, "avg_duration_seconds");
  const previousDuration = sum(previous, "avg_duration_seconds");

  const pctChange = (curr: number, prev: number) =>
    prev === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / prev) * 100);

  return {
    current_period: { from, to, total_calls: currentTotal, avg_duration: current.length > 0 ? Math.round(currentDuration / current.length) : 0 },
    previous_period: { from: prevFrom.toISOString().split("T")[0], to: prevTo.toISOString().split("T")[0], total_calls: previousTotal, avg_duration: previous.length > 0 ? Math.round(previousDuration / previous.length) : 0 },
    changes: {
      total_calls_pct: pctChange(currentTotal, previousTotal),
      avg_duration_pct: pctChange(currentDuration, previousDuration),
    },
  };
}

export async function exportAnalytics(orgId: string, from: string, to: string, format: "csv" | "json") {
  const stats = await getDailyCallStats(orgId, from, to);

  if (format === "json") {
    return JSON.stringify(stats, null, 2);
  }

  // CSV
  const headers = [
    "date", "total_calls", "inbound", "outbound", "missed", "completed",
    "avg_duration_s", "positive", "neutral", "negative",
  ];
  const rows = stats.map((d) => [
    d.stat_date, d.total_calls, d.inbound_calls, d.outbound_calls,
    d.missed_calls, d.completed_calls, d.avg_duration_seconds,
    d.positive_sentiment, d.neutral_sentiment, d.negative_sentiment,
  ].join(","));

  return [headers.join(","), ...rows].join("\n");
}
