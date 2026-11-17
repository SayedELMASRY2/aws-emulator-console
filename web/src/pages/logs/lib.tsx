import StatusIndicator, { type StatusIndicatorProps } from "@cloudscape-design/components/status-indicator";
import { api } from "../../api";
import { REGION, ACCOUNT } from "../../common";

export const logs = (op: string, p: Record<string, unknown> = {}) => api.call("logs", op, p);

/** Follows nextToken pagination for CloudWatch Logs APIs */
export async function logsAll(op: string, key: string, p: Record<string, unknown> = {}, tokKey = "nextToken") {
  const out: any[] = [];
  let tok: string | undefined;
  do {
    const r = await logs(op, { ...p, ...(tok ? { [tokKey]: tok } : {}) });
    out.push(...(r[key] || []));
    tok = r[tokKey] || r.NextToken;
  } while (tok);
  return out;
}

export const CRUMB = { text: "CloudWatch Logs", href: "#/logs/log-groups" };
export const crumbs = (...rest: { text: string; href?: string }[]) => [
  CRUMB,
  ...rest.map(r => ({ text: r.text, href: r.href || "#" })),
];
export const enc = encodeURIComponent;

export const fmt = (d?: string | number) => {
  if (!d) return "-";
  const ms = typeof d === "number" || /^\d+$/.test(String(d)) ? Number(d) : d;
  return new Date(ms).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

export function fmtBytes(bytes?: number) {
  if (bytes === undefined || bytes === null || bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export const RETENTION_OPTIONS = [
  { value: "0", label: "Never expire" },
  { value: "1", label: "1 day" },
  { value: "3", label: "3 days" },
  { value: "5", label: "5 days" },
  { value: "7", label: "1 week (7 days)" },
  { value: "14", label: "2 weeks (14 days)" },
  { value: "30", label: "1 month (30 days)" },
  { value: "60", label: "2 months (60 days)" },
  { value: "90", label: "3 months (90 days)" },
  { value: "180", label: "6 months (180 days)" },
  { value: "365", label: "1 year (365 days)" },
];
