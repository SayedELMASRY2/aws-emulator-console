import StatusIndicator, { type StatusIndicatorProps } from "@cloudscape-design/components/status-indicator";
import { api } from "../../api";
import { REGION, ACCOUNT } from "../../common";

export const sqs = (op: string, p: Record<string, unknown> = {}) => api.call("sqs", op, p);

export const CRUMB = { text: "Amazon SQS", href: "#/sqs/queues" };
export const crumbs = (...rest: { text: string; href?: string }[]) => [
  CRUMB,
  ...rest.map(r => ({ text: r.text, href: r.href || "#" })),
];
export const enc = encodeURIComponent;

export function queueNameFromUrl(url?: string) {
  if (!url) return "—";
  return url.split("/").pop() || url;
}

export const fmt = (d?: string | number) => {
  if (!d) return "-";
  // Handle epoch seconds or ISO strings
  const ms = typeof d === "number" || /^\d+$/.test(String(d)) ? Number(d) * 1000 : d;
  return new Date(ms).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

export function fmtDuration(sec?: string | number) {
  if (sec === undefined || sec === null) return "-";
  const s = Number(sec);
  if (s < 60) return `${s} seconds`;
  if (s < 3600) return `${Math.floor(s / 60)} minutes`;
  if (s < 86400) return `${(s / 3600).toFixed(1)} hours`;
  return `${(s / 86400).toFixed(1)} days`;
}
