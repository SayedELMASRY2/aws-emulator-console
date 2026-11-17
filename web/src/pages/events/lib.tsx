import StatusIndicator, { type StatusIndicatorProps } from "@cloudscape-design/components/status-indicator";
import { api } from "../../api";
import { useAsync, REGION, ACCOUNT } from "../../common";

export const events = (op: string, p: Record<string, unknown> = {}) => api.call("events", op, p);

export const CRUMB = { text: "Amazon EventBridge", href: "#/events/rules" };
export const crumbs = (...rest: { text: string; href?: string }[]) => [
  CRUMB,
  ...rest.map(r => ({ text: r.text, href: r.href || "#" })),
];
export const enc = encodeURIComponent;

const ST: Record<string, StatusIndicatorProps.Type> = {
  ENABLED: "success",
  DISABLED: "stopped",
  ACTIVE: "success",
};

export function St({ s }: { s?: string }) {
  if (!s) return <>-</>;
  const label = s.charAt(0) + s.slice(1).toLowerCase();
  return <StatusIndicator type={ST[s] || "info"}>{label}</StatusIndicator>;
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

export function useEventBuses() {
  return useAsync(async () => {
    const res = await events("ListEventBuses");
    return (res.EventBuses || []).map((b: any) => ({
      value: b.Name,
      label: b.Name,
      arn: b.Arn,
    }));
  });
}
