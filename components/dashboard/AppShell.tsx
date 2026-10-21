"use client";

import type { ReactNode } from "react";
import { Menu } from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { Brand } from "@/components/Brand";

export function AppShell({
  dueCount,
  foundToday,
  railOpen,
  inspectorOpen,
  onOpenRail,
  onCloseRail,
  rail,
  inspector,
  alerts,
  children,
}: {
  dueCount: number;
  foundToday: number | null;
  railOpen: boolean;
  inspectorOpen: boolean;
  onOpenRail: () => void;
  onCloseRail: () => void;
  rail: ReactNode;
  inspector: ReactNode;
  alerts?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-screen flex-col bg-oat text-fg">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-panel px-3 sm:px-4">
        <button
          onClick={onOpenRail}
          className="grid h-9 w-9 place-items-center rounded-lg text-fg hover:bg-oat lg:hidden"
          aria-label="Open navigation"
        >
          <Menu className="h-4 w-4" />
        </button>
        <Brand href="/app" />
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className={dueCount > 0 ? "font-semibold text-accent" : "text-muted"}>
            {dueCount} due
          </span>
          {foundToday !== null && (
            <>
              <span className="hidden h-4 w-px bg-line sm:block" />
              <span className="hidden text-muted sm:inline">
                <span className="font-semibold text-fg">{foundToday}</span> found today
              </span>
            </>
          )}
          <UserButton />
        </div>
      </header>
      {alerts}

      <div className="flex min-h-0 flex-1">
        <div className="hidden w-60 shrink-0 lg:flex">{rail}</div>
        {railOpen && (
          <div className="fixed inset-0 z-30 lg:hidden">
            <button
              className="absolute inset-0 bg-ink/40"
              aria-label="Close navigation"
              onClick={onCloseRail}
            />
            <div className="relative z-10 h-full w-72 shadow-xl">{rail}</div>
          </div>
        )}
        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
        {inspectorOpen && (
          <div className="relative max-lg:fixed max-lg:inset-0 max-lg:z-40 lg:flex lg:h-full lg:w-[22rem] lg:shrink-0 lg:border-l lg:border-line xl:w-[26rem]">
            {inspector}
          </div>
        )}
      </div>
    </div>
  );
}
