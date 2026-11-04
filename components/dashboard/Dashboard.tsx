"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CrmLead, SearchHistoryItem, Usage } from "./types";
import { fetchLeads } from "./crmApi";
import { CrmView } from "./CrmView";
import { ConversationsView } from "./ConversationsView";
import { LeadDrawer } from "./LeadDrawer";
import { MailboxesView } from "./MailboxesView";
import { AppShell } from "./AppShell";
import { Sidebar, type WorkbenchView } from "./Sidebar";
import { FindSheet, type FindPrefill } from "./FindSheet";
import { SearchDonePopup } from "./SearchDonePopup";
import { useSearchJob } from "./useSearchJob";
import { usePushNotifications } from "./usePushNotifications";
import { PushPrompt } from "./NotificationControls";
import { EMPTY_FILTERS, type LeadFilters } from "./leadFilters";
import { isFollowUpDue } from "./format";

export function Dashboard() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openLeadId, setOpenLeadId] = useState<number | null>(null);
  const [filters, setFilters] = useState<LeadFilters>(EMPTY_FILTERS);
  const [railOpen, setRailOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [prefill, setPrefill] = useState<FindPrefill | null>(null);
  const [prefillKey, setPrefillKey] = useState(0);
  const [historyKey, setHistoryKey] = useState(0);
  const [view, setView] = useState<WorkbenchView>("table");
  const [conversationFocus, setConversationFocus] = useState<string | null>(null);
  const [notices, setNotices] = useState<{ id: number; body: string }[]>([]);
  const [account, setAccount] = useState<{ status: string; note: string | null } | null>(null);
  const [noticeError, setNoticeError] = useState<string | null>(null);

  const loadNotices = useCallback(async () => {
    try {
      const res = await fetch("/api/notices");
      if (!res.ok) return;
      const json = await res.json();
      setNotices(Array.isArray(json.notices) ? json.notices : []);
      setAccount(json.account ?? null);
    } catch {
      /* the search route still enforces a flag or cap */
    }
  }, []);

  const dismissNotice = useCallback(async (id: number) => {
    setNoticeError(null);
    try {
      const res = await fetch("/api/notices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNoticeError(typeof data.error === "string" ? data.error : "Could not dismiss that notice.");
        return;
      }
      setNotices((current) => current.filter((notice) => notice.id !== id));
    } catch {
      setNoticeError("Could not dismiss that notice. Check your connection and try again.");
    }
  }, []);

  const refreshUsage = useCallback(async () => {
    try {
      const res = await fetch("/api/usage");
      if (res.ok) {
        const json = await res.json();
        setUsage(json.usage);
      }
    } catch {
      /* non-fatal */
    }
  }, []);

  const loadLeads = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const json = await fetchLeads();
      setLeads(json.leads);
      setTruncated(json.truncated);
      setLoadError(null);
    } catch (err) {
      setLoadError((err as Error).message);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUsage();
    loadLeads();
    loadNotices();
  }, [refreshUsage, loadLeads, loadNotices]);

  const search = useSearchJob({
    onSaved: () => {
      loadLeads({ silent: true });
      refreshUsage();
    },
    onFinished: () => {
      refreshUsage();
      loadLeads({ silent: true });
      setHistoryKey((k) => k + 1);
    },
  });

  const push = usePushNotifications();

  const mergeLeads = useCallback((updated: CrmLead[]) => {
    if (!updated.length) return;
    const byId = new Map(updated.map((l) => [l.id, l]));
    setLeads((prev) => {
      const next = prev.map((l) => byId.get(l.id) ?? l);
      for (const l of updated) if (!prev.some((p) => p.id === l.id)) next.unshift(l);
      return next;
    });
  }, []);

  const handleLeadChange = useCallback((lead: CrmLead) => mergeLeads([lead]), [mergeLeads]);

  const removeLeads = useCallback((ids: number[]) => {
    const gone = new Set(ids);
    setLeads((prev) => prev.filter((l) => !gone.has(l.id)));
    setOpenLeadId((id) => (id != null && gone.has(id) ? null : id));
  }, []);

  const counts = useMemo(() => {
    const byStatus = new Map<string, number>();
    let saved = 0;
    let due = 0;
    for (const l of leads) {
      byStatus.set(l.status, (byStatus.get(l.status) || 0) + 1);
      if (l.saved) saved++;
      if (isFollowUpDue(l.followUpAt)) due++;
    }
    return { total: leads.length, byStatus, saved, due };
  }, [leads]);

  const openFind = useCallback(() => setFindOpen(true), []);

  const rerun = useCallback((search: SearchHistoryItem) => {
    setPrefill({
      niches: search.params?.niches || "",
      states: search.params?.states || "US",
      limit: search.params?.limit,
    });
    setPrefillKey((k) => k + 1);
    setFindOpen(true);
  }, []);

  const patchFilters = useCallback((next: LeadFilters) => setFilters(next), []);

  const setWorkbenchView = useCallback((next: WorkbenchView) => {
    setView(next);
    if (next === "pipeline") {
      setFilters((current) => (current.status === "all" ? current : { ...current, status: "all" }));
    }
    if (next !== "conversations") setConversationFocus(null);
  }, []);

  return (
    <>
      <AppShell
        dueCount={counts.due}
        foundToday={usage ? usage.consumedToday : null}
        railOpen={railOpen}
        inspectorOpen={openLeadId != null}
        onOpenRail={() => setRailOpen(true)}
        onCloseRail={() => setRailOpen(false)}
        alerts={
          account?.status === "flagged" || notices.length > 0 || noticeError ? (
            <div>
              {account?.status === "flagged" ? (
                <div className="border-b border-ink bg-ink px-4 py-2.5 text-sm text-panel">
                  <p className="font-medium">New searches are paused.</p>
                  {account.note ? <p className="mt-0.5 max-w-2xl text-panel/80">{account.note}</p> : null}
                </div>
              ) : null}
              {notices.length > 0 || noticeError ? (
                <ul className="border-b border-line bg-panel">
                  {notices.map((notice) => (
                    <li key={notice.id} className="flex items-start gap-3 px-4 py-2 text-sm">
                      <p className="min-w-0 flex-1">{notice.body}</p>
                      <button
                        type="button"
                        onClick={() => dismissNotice(notice.id)}
                        className="shrink-0 text-muted hover:text-fg"
                      >
                        Dismiss
                      </button>
                    </li>
                  ))}
                  {noticeError ? <li className="px-4 py-2 text-sm text-danger">{noticeError}</li> : null}
                </ul>
              ) : null}
            </div>
          ) : null
        }
        rail={
          <Sidebar
            filters={filters}
            counts={counts}
            historyKey={historyKey}
            onFilters={patchFilters}
            onFind={openFind}
            onRerun={rerun}
            onNavigate={() => setRailOpen(false)}
            view={view}
            onView={setWorkbenchView}
            push={push}
            className="h-full"
          />
        }
        inspector={
          <>
            {openLeadId != null && (
              <button
                className="absolute inset-0 bg-ink/30 lg:hidden"
                aria-label="Close lead"
                onClick={() => setOpenLeadId(null)}
              />
            )}
            <div className="relative z-10 flex h-full w-full min-w-0 max-lg:ml-auto max-lg:max-w-lg max-lg:shadow-xl">
              <LeadDrawer
                embedded
                leadId={openLeadId}
                onClose={() => setOpenLeadId(null)}
                onLeadChange={handleLeadChange}
                onLeadDeleted={(id) => removeLeads([id])}
                onOpenConversation={(email) => {
                  setConversationFocus(email);
                  setView("conversations");
                }}
                onOpenMailboxes={() => setWorkbenchView("mailboxes")}
              />
            </div>
          </>
        }
      >
        {view === "mailboxes" ? (
          <MailboxesView />
        ) : view === "conversations" ? (
          <ConversationsView focusEmail={conversationFocus} onOpenLead={setOpenLeadId} />
        ) : (
          <CrmView
            leads={leads}
            loading={loading}
            loadError={loadError}
            truncated={truncated}
            filters={filters}
            onFiltersChange={patchFilters}
            onOpenLead={setOpenLeadId}
            onLeadsUpdated={mergeLeads}
            onLeadsDeleted={removeLeads}
            onOpenMailboxes={() => setWorkbenchView("mailboxes")}
            onFindLeads={openFind}
            view={view}
            onViewChange={setWorkbenchView}
          />
        )}
      </AppShell>
      <FindSheet
        open={findOpen}
        onOpen={openFind}
        prefill={prefill}
        prefillKey={prefillKey}
        onClose={() => setFindOpen(false)}
        job={search.job}
        running={search.running}
        onStart={search.start}
        onStop={search.cancel}
        notifyPrompt={<PushPrompt push={push} />}
      />
      {search.finished && (
        <SearchDonePopup
          job={search.finished}
          onView={() => {
            const id = search.finished?.id ?? null;
            setFindOpen(false);
            setWorkbenchView("table");
            setFilters({ ...EMPTY_FILTERS, source: id });
            search.dismiss();
          }}
          onDismiss={search.dismiss}
        />
      )}
    </>
  );
}
