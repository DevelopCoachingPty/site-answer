"use client";

import { useApi } from "@/hooks/use-api";

export function NotificationBadge() {
  const { data } = useApi<{ unread_count: number }>("/notifications/unread-count");

  if (!data?.unread_count) return null;

  return (
    <span className="ml-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
      {data.unread_count > 99 ? "99+" : data.unread_count}
    </span>
  );
}
