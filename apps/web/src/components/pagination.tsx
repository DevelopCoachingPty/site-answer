"use client";

interface PaginationProps {
  page: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, total, limit, onPageChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / limit));

  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between px-4 py-3">
      <p className="text-sm text-[var(--muted-foreground)]">
        Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
      </p>
      <div className="flex gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="rounded-lg border border-[var(--border)] px-3 py-1 text-sm disabled:opacity-50 hover:bg-[var(--accent)]"
        >
          Previous
        </button>
        {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
          let pageNum: number;
          if (totalPages <= 5) {
            pageNum = i + 1;
          } else if (page <= 3) {
            pageNum = i + 1;
          } else if (page >= totalPages - 2) {
            pageNum = totalPages - 4 + i;
          } else {
            pageNum = page - 2 + i;
          }
          return (
            <button
              key={pageNum}
              onClick={() => onPageChange(pageNum)}
              className={`rounded-lg px-3 py-1 text-sm ${
                pageNum === page
                  ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                  : "border border-[var(--border)] hover:bg-[var(--accent)]"
              }`}
            >
              {pageNum}
            </button>
          );
        })}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="rounded-lg border border-[var(--border)] px-3 py-1 text-sm disabled:opacity-50 hover:bg-[var(--accent)]"
        >
          Next
        </button>
      </div>
    </div>
  );
}
