"use client";

import { useState } from "react";
import { useApi } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { CardSkeleton, Skeleton } from "@/components/skeleton";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
  BarChart, Bar,
} from "recharts";

interface DailyStats {
  stat_date: string;
  total_calls: number;
  inbound_calls: number;
  outbound_calls: number;
  missed_calls: number;
  completed_calls: number;
  avg_duration_seconds: number;
}

interface FlowBreakdown {
  name: string;
  value: number;
}

interface SentimentWeek {
  week: string;
  positive: number;
  neutral: number;
  negative: number;
}

interface Comparison {
  current_period: { total_calls: number; avg_duration: number };
  previous_period: { total_calls: number; avg_duration: number };
  changes: { total_calls_pct: number; avg_duration_pct: number };
}

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

function getDateRange(preset: string) {
  const now = new Date();
  const to = now.toISOString().split("T")[0]!;
  let from: string;

  if (preset === "7d") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    from = d.toISOString().split("T")[0]!;
  } else if (preset === "30d") {
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    from = d.toISOString().split("T")[0]!;
  } else {
    const d = new Date(now);
    d.setDate(d.getDate() - 90);
    from = d.toISOString().split("T")[0]!;
  }

  return { from, to };
}

export default function AnalyticsPage() {
  const [range, setRange] = useState("30d");
  const { from, to } = getDateRange(range);

  const { data: daily } = useApi<{ data: DailyStats[] }>("/analytics/daily", { from, to });
  const { data: flow } = useApi<{ data: FlowBreakdown[] }>("/analytics/flow-breakdown", { from, to });
  const { data: sentiment } = useApi<{ data: SentimentWeek[] }>("/analytics/sentiment", { from, to });
  const { data: comparison } = useApi<Comparison>("/analytics/comparison", { from, to });

  const chartData = (daily?.data ?? []).map((d) => ({
    ...d,
    date: new Date(d.stat_date).toLocaleDateString("en-AU", { month: "short", day: "numeric" }),
  }));

  async function handleExport() {
    const csvData = await api.get<string>("/analytics/export", { from, to, format: "csv" });
    const blob = new Blob([csvData], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analytics-${from}-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <div className="flex gap-2">
          {["7d", "30d", "90d"].map((preset) => (
            <button
              key={preset}
              onClick={() => setRange(preset)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                range === preset
                  ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                  : "border border-[var(--border)] hover:bg-[var(--accent)]"
              }`}
            >
              {preset}
            </button>
          ))}
          <button
            onClick={handleExport}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--accent)]"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Comparison Cards */}
      {!comparison && (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      )}
      {comparison && (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
            <p className="text-sm text-[var(--muted-foreground)]">Total Calls</p>
            <p className="text-2xl font-bold">{comparison.current_period.total_calls}</p>
            <p className={`text-xs ${comparison.changes.total_calls_pct >= 0 ? "text-green-600" : "text-red-600"}`}>
              {comparison.changes.total_calls_pct >= 0 ? "+" : ""}{comparison.changes.total_calls_pct}% vs previous
            </p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
            <p className="text-sm text-[var(--muted-foreground)]">Avg Duration</p>
            <p className="text-2xl font-bold">
              {comparison.current_period.avg_duration > 0
                ? `${Math.round(comparison.current_period.avg_duration / 60)}m`
                : "N/A"}
            </p>
            <p className={`text-xs ${comparison.changes.avg_duration_pct >= 0 ? "text-green-600" : "text-red-600"}`}>
              {comparison.changes.avg_duration_pct >= 0 ? "+" : ""}{comparison.changes.avg_duration_pct}% vs previous
            </p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
            <p className="text-sm text-[var(--muted-foreground)]">Inbound</p>
            <p className="text-2xl font-bold">
              {(daily?.data ?? []).reduce((s, d) => s + d.inbound_calls, 0)}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
            <p className="text-sm text-[var(--muted-foreground)]">Missed</p>
            <p className="text-2xl font-bold text-red-600">
              {(daily?.data ?? []).reduce((s, d) => s + d.missed_calls, 0)}
            </p>
          </div>
        </div>
      )}

      {/* Call Volume Chart */}
      <div className="mb-6 rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
        <h2 className="mb-4 font-semibold">Call Volume</h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="inbound_calls" name="Inbound" stroke="#3b82f6" strokeWidth={2} />
              <Line type="monotone" dataKey="outbound_calls" name="Outbound" stroke="#10b981" strokeWidth={2} />
              <Line type="monotone" dataKey="missed_calls" name="Missed" stroke="#ef4444" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mb-6 grid gap-6 md:grid-cols-2">
        {/* Flow Type Pie Chart */}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <h2 className="mb-4 font-semibold">Call Types</h2>
          <div className="h-64">
            {flow?.data && flow.data.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={flow.data}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, percent }) => `${(name as string).replace(/_/g, " ")} ${(percent * 100).toFixed(0)}%`}
                  >
                    {flow.data.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-[var(--muted-foreground)]">
                No data available
              </div>
            )}
          </div>
        </div>

        {/* Sentiment Bar Chart */}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <h2 className="mb-4 font-semibold">Sentiment Trend</h2>
          <div className="h-64">
            {sentiment?.data && sentiment.data.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sentiment.data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="positive" name="Positive" fill="#10b981" stackId="a" />
                  <Bar dataKey="neutral" name="Neutral" fill="#f59e0b" stackId="a" />
                  <Bar dataKey="negative" name="Negative" fill="#ef4444" stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-[var(--muted-foreground)]">
                No data available
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
