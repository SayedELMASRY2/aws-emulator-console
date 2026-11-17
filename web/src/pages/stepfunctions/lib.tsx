import StatusIndicator, { type StatusIndicatorProps } from "@cloudscape-design/components/status-indicator";
import { api } from "../../api";
import { useAsync, REGION, ACCOUNT } from "../../common";

export const sfn = (op: string, p: Record<string, unknown> = {}) => api.call("stepfunctions", op, p);

export const CRUMB = { text: "AWS Step Functions", href: "#/stepfunctions/state-machines" };
export const crumbs = (...rest: { text: string; href?: string }[]) => [
  CRUMB,
  ...rest.map(r => ({ text: r.text, href: r.href || "#" })),
];
export const enc = encodeURIComponent;

const ST: Record<string, StatusIndicatorProps.Type> = {
  RUNNING: "in-progress",
  SUCCEEDED: "success",
  FAILED: "error",
  TIMED_OUT: "error",
  ABORTED: "stopped",
  PENDING_REDRIVE: "pending",
};

export function St({ s }: { s?: string }) {
  if (!s) return <>-</>;
  const label = s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");
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

export function smNameFromArn(arn?: string) {
  if (!arn) return "—";
  return arn.split(":").pop() || arn;
}

export function execNameFromArn(arn?: string) {
  if (!arn) return "—";
  return arn.split(":").pop() || arn;
}

export const SAMPLE_ASL = {
  Comment: "A simple order processing workflow",
  StartAt: "ValidateOrder",
  States: {
    ValidateOrder: {
      Type: "Pass",
      Result: {
        isValid: true,
        orderId: "ORD-54321",
        status: "APPROVED"
      },
      Next: "ProcessPayment"
    },
    ProcessPayment: {
      Type: "Pass",
      Result: {
        paymentStatus: "CHARGED",
        transactionId: "TXN-987"
      },
      End: true
    }
  }
};
