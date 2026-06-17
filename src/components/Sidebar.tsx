"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "./api";

const NAV = [
  { href: "/", label: "Overview", icon: "M3 12l9-9 9 9M5 10v10h14V10" },
  { href: "/targets", label: "Backup Jobs", icon: "M4 7h16M4 12h16M4 17h10" },
  { href: "/destinations", label: "Destinations", icon: "M3 7l9-4 9 4-9 4-9-4Zm0 5l9 4 9-4M3 17l9 4 9-4" },
  { href: "/history", label: "History", icon: "M12 8v5l3 2M3 12a9 9 0 1 0 9-9 9 9 0 0 0-7.5 4M3 5v4h4" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-surface/60 p-4 backdrop-blur">
      <div className="mb-8 flex items-center gap-2.5 px-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-white">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M12 3a9 9 0 1 0 9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
        <span className="text-base font-semibold">BackupTool</span>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                active ? "bg-accent/15 text-indigo-200" : "text-muted hover:bg-surface-2 hover:text-gray-200"
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d={item.icon} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <button onClick={logout} className="btn-ghost mt-auto justify-start">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M15 12H4m11 0l-4-4m4 4l-4 4M9 4h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Sign out
      </button>
    </aside>
  );
}
