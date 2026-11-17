import StatusIndicator, { type StatusIndicatorProps } from "@cloudscape-design/components/status-indicator";
import { api } from "../../api";
import { REGION, ACCOUNT } from "../../common";

export const sm = (op: string, p: Record<string, unknown> = {}) => api.call("secretsmanager", op, p);

/** Follows NextToken pagination for Secrets Manager APIs */
export async function smAll(op: string, key: string, p: Record<string, unknown> = {}, tokKey = "NextToken") {
  const out: any[] = [];
  let tok: string | undefined;
  do {
    const r = await sm(op, { ...p, ...(tok ? { [tokKey]: tok } : {}) });
    out.push(...(r[key] || []));
    tok = r[tokKey] || r.nextToken;
  } while (tok);
  return out;
}

export const CRUMB = { text: "AWS Secrets Manager", href: "#/secrets" };
export const crumbs = (...rest: { text: string; href?: string }[]) => [
  CRUMB,
  ...rest.map(r => ({ text: r.text, href: r.href || "#" })),
];
export const enc = encodeURIComponent;

export const fmt = (d?: string | number) => {
  if (!d) return "-";
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
