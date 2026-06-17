"use client";

import { useEffect } from "react";

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    success: "bg-success/15 text-green-300",
    running: "bg-accent/15 text-indigo-300",
    failed: "bg-danger/15 text-red-300",
  };
  const dot: Record<string, string> = {
    success: "bg-success",
    running: "bg-accent animate-pulse",
    failed: "bg-danger",
  };
  return (
    <span className={`badge ${map[status] || "bg-border text-muted"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot[status] || "bg-muted"}`} />
      {status}
    </span>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm">
      <div
        className={`card mt-[6vh] w-full ${wide ? "max-w-2xl" : "max-w-lg"} p-5`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-border hover:text-white">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {children}
      </div>
      <button className="fixed inset-0 -z-10 cursor-default" aria-label="Close" onClick={onClose} />
    </div>
  );
}

export function EmptyState({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="rounded-full bg-surface-2 p-3 text-muted">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <path d="M4 7v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-7L9 5H6a2 2 0 0 0-2 2Z" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </div>
      <div>
        <p className="font-medium">{title}</p>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
