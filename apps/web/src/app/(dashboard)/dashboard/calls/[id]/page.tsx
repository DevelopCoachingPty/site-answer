"use client";

import { use } from "react";
import Link from "next/link";
import { useApi } from "@/hooks/use-api";
import { formatDuration } from "@/lib/utils";

interface TranscriptEntry {
  role: string;
  content: string;
  timestamp?: string;
}

interface CallAction {
  id: string;
  action_type: string;
  payload: Record<string, unknown>;
  status: string;
  attempted_at: string;
}

interface Call {
  id: string;
  caller_name: string | null;
  caller_number: string | null;
  called_number: string | null;
  direction: string;
  flow_type: string | null;
  status: string;
  duration_seconds: number | null;
  summary: string | null;
  sentiment: string | null;
  transcript: TranscriptEntry[] | null;
  recording_url: string | null;
  started_at: string;
  ended_at: string | null;
  actions: CallAction[];
}

const sentimentColors: Record<string, string> = {
  positive: "bg-green-100 text-green-800",
  neutral: "bg-gray-100 text-gray-800",
  negative: "bg-red-100 text-red-800",
  frustrated: "bg-orange-100 text-orange-800",
};

export default function CallDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data, loading, error } = useApi<{ data: Call }>(`/calls/${id}`);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-[var(--muted-foreground)]">Loading call details...</p>
      </div>
    );
  }

  if (error || !data?.data) {
    return (
      <div className="text-center py-12">
        <p className="text-[var(--muted-foreground)]">Call not found.</p>
        <Link href="/dashboard/calls" className="mt-2 text-sm text-[var(--primary)] hover:underline">
          Back to call log
        </Link>
      </div>
    );
  }

  const call = data.data;

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link
          href="/dashboard/calls"
          className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          &larr; Back to calls
        </Link>
        <h1 className="text-2xl font-bold">Call Detail</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Call info */}
        <div className="lg:col-span-1 space-y-4">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
            <h2 className="font-semibold mb-4">Call Info</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--muted-foreground)]">Caller</span>
                <span className="font-medium">{call.caller_name ?? call.caller_number ?? "Unknown"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted-foreground)]">Number</span>
                <span>{call.caller_number ?? "-"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted-foreground)]">Direction</span>
                <span className="capitalize">{call.direction}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted-foreground)]">Type</span>
                <span className="capitalize">{call.flow_type?.replace(/_/g, " ") ?? "Unknown"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted-foreground)]">Duration</span>
                <span>{formatDuration(call.duration_seconds ?? 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted-foreground)]">Status</span>
                <span className="capitalize">{call.status}</span>
              </div>
              {call.sentiment && (
                <div className="flex justify-between">
                  <span className="text-[var(--muted-foreground)]">Sentiment</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${sentimentColors[call.sentiment] ?? ""}`}>
                    {call.sentiment}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-[var(--muted-foreground)]">Started</span>
                <span>{new Date(call.started_at).toLocaleString()}</span>
              </div>
            </div>
          </div>

          {call.summary && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
              <h2 className="font-semibold mb-2">Summary</h2>
              <p className="text-sm text-[var(--muted-foreground)]">{call.summary}</p>
            </div>
          )}

          {call.recording_url && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
              <h2 className="font-semibold mb-2">Recording</h2>
              <audio controls className="w-full" src={call.recording_url}>
                Your browser does not support the audio element.
              </audio>
            </div>
          )}

          {/* Actions taken */}
          {call.actions && call.actions.length > 0 && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
              <h2 className="font-semibold mb-4">Actions Taken</h2>
              <div className="space-y-2">
                {call.actions.map((action) => (
                  <div key={action.id} className="flex items-start gap-2 text-sm">
                    <span className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${
                      action.status === "completed" ? "bg-green-500" : "bg-yellow-500"
                    }`} />
                    <div>
                      <span className="font-medium capitalize">
                        {action.action_type.replace(/_/g, " ")}
                      </span>
                      <span className="text-[var(--muted-foreground)] ml-1">
                        - {action.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Transcript */}
        <div className="lg:col-span-2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <h2 className="font-semibold mb-4">Transcript</h2>
          {call.transcript && call.transcript.length > 0 ? (
            <div className="space-y-4">
              {call.transcript.map((entry, i) => (
                <div
                  key={i}
                  className={`flex ${entry.role === "assistant" ? "justify-start" : "justify-end"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${
                      entry.role === "assistant"
                        ? "bg-[var(--muted)]"
                        : "bg-[var(--primary)] text-[var(--primary-foreground)]"
                    }`}
                  >
                    <p className="text-xs font-medium mb-1 opacity-70">
                      {entry.role === "assistant" ? "SiteAnswer" : "Caller"}
                    </p>
                    <p>{entry.content}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--muted-foreground)]">No transcript available.</p>
          )}
        </div>
      </div>
    </div>
  );
}
