export type ReportReason = "Wrong hours" | "Wrong price" | "Closed or cancelled" | "Wrong location" | "Misleading media" | "Duplicate listing";

export type DataReport = {
  id: string;
  recordId: string;
  recordTitle: string;
  reason: ReportReason;
  note: string;
  submittedAt: string;
  status: "Needs review" | "Resolved";
};

export const REPORTS_KEY = "ananta-data-reports";

export function readReports() {
  if (typeof window === "undefined") return [] as DataReport[];
  try {
    const value = JSON.parse(window.localStorage.getItem(REPORTS_KEY) || "[]");
    return Array.isArray(value) ? value as DataReport[] : [];
  } catch {
    return [] as DataReport[];
  }
}

export function writeReports(reports: DataReport[]) {
  window.localStorage.setItem(REPORTS_KEY, JSON.stringify(reports));
  window.dispatchEvent(new Event("ananta-reports-change"));
}
