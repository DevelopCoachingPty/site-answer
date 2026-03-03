"use client";

import { useState } from "react";
import { useApi } from "@/hooks/use-api";
import { api } from "@/lib/api-client";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

interface NotificationsResponse {
  data: Notification[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const typeIcons: Record<string, string> = {
  escalation: "!",
  message: "\u2709",
  system: "\u2699",
};

const typeColors: Record<string, string> = {
  escalation: "bg-red-100 text-red-800",
  message: "bg-blue-100 text-blue-800",
  system: "bg-gray-100 text-gray-800",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function NotificationsPage() {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const params: Record<string, string | number | undefined> = {
    page,
    limit: 20,
  };
  if (filter === "unread") params.unread_only = 1;

  const { data, loading, refetch } = useApi<NotificationsResponse>("/notifications", params);

  async function markRead(id: string) {
    await api.patch(`/notifications/${id}/read`);
    refetch();
  }

  async function markAllRead() {
    await api.post("/notifications/read-all");
    refetch();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Notifications</h1>
        <div className="flex gap-2">
          <div className="flex rounded-lg border border-[var(--border)] overflow-hidden">
            <button
              onClick={() => { setFilter("all"); setPage(1); }}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${filter === "all" ? "bg-[var(--foreground)] text-[var(--background)]" : "text-[var(--muted-foreground)] hover:bg-[var(--accent)]"}`}
            >
              All
            </button>
            <button
              onClick={() => { setFilter("unread"); setPage(1); }}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${filter === "unread" ? "bg-[var(--foreground)] text-[var(--background)]" : "text-[var(--muted-foreground)] hover:bg-[var(--accent)]"}`}
            >
              Unread
            </button>
          </div>
          <button
            onClick={markAllRead}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium text-[var(--muted-foreground)] hover:bg-[var(--accent)] transition-colors"
          >
            Mark all read
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] divide-y divide-[var(--border)]">
        {loading ? (
          <div className="px-6 py-12 text-center text-[var(--muted-foreground)]">
            Loading notifications...
          </div>
        ) : data?.data && data.data.length > 0 ? (
          data.data.map((n) => (
            <div
              key={n.id}
              className={`flex items-start gap-4 px-6 py-4 transition-colors ${!n.is_read ? "bg-[var(--accent)]/30" : ""} hover:bg-[var(--accent)]/50`}
            >
              <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${typeColors[n.type] ?? "bg-gray-100 text-gray-800"}`}>
                {typeIcons[n.type] ?? "?"}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className={`text-sm ${!n.is_read ? "font-semibold" : "font-medium"}`}>
                    {n.title}
                  </p>
                  <span className="shrink-0 text-xs text-[var(--muted-foreground)]">
                    {timeAgo(n.created_at)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-[var(--muted-foreground)] whitespace-pre-line">
                  {n.message}
                </p>
              </div>
              {!n.is_read && (
                <button
                  onClick={() => markRead(n.id)}
                  className="shrink-0 rounded-lg px-2 py-1 text-xs text-[var(--muted-foreground)] hover:bg-[var(--accent)] transition-colors"
                  title="Mark as read"
                >
                  Mark read
                </button>
              )}
            </div>
          ))
        ) : (
          <div className="px-6 py-12 text-center text-[var(--muted-foreground)]">
            No notifications yet.
          </div>
        )}
      </div>

      {/* Pagination */}
      {data && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-[var(--muted-foreground)]">
            Page {data.pagination.page} of {data.pagination.totalPages} ({data.pagination.total} total)
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
              disabled={page === data.pagination.totalPages}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
