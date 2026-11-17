import StatusIndicator, { type StatusIndicatorProps } from "@cloudscape-design/components/status-indicator";
import { api } from "../../api";
import { useAsync, ACCOUNT, REGION } from "../../common";

export const athena = (op: string, p: Record<string, unknown> = {}) => api.call("athena", op, p);

/** Follows NextToken pagination for Athena APIs */
export async function athenaAll(op: string, key: string, p: Record<string, unknown> = {}) {
  const out: any[] = [];
  let tok: string | undefined;
  do {
    const r = await athena(op, { ...p, ...(tok ? { NextToken: tok } : {}) });
    out.push(...(r[key] || []));
    tok = r.NextToken;
  } while (tok);
  return out;
}

export const CRUMB = { text: "Amazon Athena", href: "#/athena/query-editor" };
export const crumbs = (...rest: { text: string; href?: string }[]) => [
  CRUMB,
  ...rest.map(r => ({ text: r.text, href: r.href || "#" })),
];
export const enc = encodeURIComponent;

const ST: Record<string, StatusIndicatorProps.Type> = {
  SUCCEEDED: "success",
  RUNNING: "in-progress",
  QUEUED: "pending",
  FAILED: "error",
  CANCELLED: "stopped",
  ENABLED: "success",
  DISABLED: "stopped",
};

export function St({ s }: { s?: string }) {
  if (!s) return <>-</>;
  return <StatusIndicator type={ST[s] || "info"}>{s}</StatusIndicator>;
}

export const fmt = (d?: string | number) =>
  d
    ? new Date(d).toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "-";

export const ATHENA_BUCKET = `aws-athena-query-results-${ACCOUNT}-${REGION}`;

export async function ensureAthenaBucket() {
  try {
    await api.call("s3", "HeadBucket", { Bucket: ATHENA_BUCKET });
  } catch {
    try {
      await api.call("s3", "CreateBucket", { Bucket: ATHENA_BUCKET });
    } catch {
      // Bucket may exist or fallback
    }
  }
  return `s3://${ATHENA_BUCKET}/`;
}

// ---------------- Glue Data Catalog Hooks for Athena ----------------
export function useDatabases() {
  return useAsync(async () => {
    try {
      const res = await api.call("glue", "GetDatabases");
      return (res.DatabaseList || []).map((d: any) => ({
        value: d.Name,
        label: d.Name,
        description: d.Description,
      }));
    } catch {
      return [];
    }
  });
}

export function useTables(databaseName?: string) {
  return useAsync(async () => {
    if (!databaseName) return [];
    try {
      const res = await api.call("glue", "GetTables", { DatabaseName: databaseName });
      return res.TableList || [];
    } catch {
      return [];
    }
  }, [databaseName]);
}
