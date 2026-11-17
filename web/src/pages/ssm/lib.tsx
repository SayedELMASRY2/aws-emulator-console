import StatusIndicator, { type StatusIndicatorProps } from "@cloudscape-design/components/status-indicator";
import { api } from "../../api";
import { REGION, ACCOUNT } from "../../common";

export const ssm = (op: string, p: Record<string, unknown> = {}) => api.call("ssm", op, p);

/** Follows NextToken pagination for SSM APIs */
export async function ssmAll(op: string, key: string, p: Record<string, unknown> = {}, tokKey = "NextToken") {
  const out: any[] = [];
  let tok: string | undefined;
  do {
    const r = await ssm(op, { ...p, ...(tok ? { [tokKey]: tok } : {}) });
    out.push(...(r[key] || []));
    tok = r[tokKey] || r.nextToken;
  } while (tok);
  return out;
}

export const CRUMB = { text: "Parameter Store", href: "#/ssm/parameters" };
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

export const PARAM_TYPES = [
  {
    value: "String",
    label: "String",
    description: "Any block of text (e.g. database host, API URL, configuration JSON, or feature flag).",
  },
  {
    value: "StringList",
    label: "StringList",
    description: "A comma-separated list of values (e.g. allowed_hosts, subnet-1,subnet-2).",
  },
  {
    value: "SecureString",
    label: "SecureString",
    description: "Encrypted data using AWS KMS or the default SSM service key (e.g. database password, private token).",
  },
];

export const PARAM_TIERS = [
  { value: "Standard", label: "Standard (Up to 4 KB value, 10,000 parameters)" },
  { value: "Advanced", label: "Advanced (Up to 8 KB value, parameter policies)" },
];
