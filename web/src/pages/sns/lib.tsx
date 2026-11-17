import StatusIndicator, { type StatusIndicatorProps } from "@cloudscape-design/components/status-indicator";
import { api } from "../../api";
import { REGION, ACCOUNT } from "../../common";

export const sns = (op: string, p: Record<string, unknown> = {}) => api.call("sns", op, p);

export const CRUMB = { text: "Amazon SNS", href: "#/sns/topics" };
export const crumbs = (...rest: { text: string; href?: string }[]) => [
  CRUMB,
  ...rest.map(r => ({ text: r.text, href: r.href || "#" })),
];
export const enc = encodeURIComponent;

export function topicNameFromArn(arn?: string) {
  if (!arn) return "—";
  return arn.split(":").pop() || arn;
}

export function isFifoTopic(nameOrArn?: string) {
  return !!nameOrArn && nameOrArn.endsWith(".fifo");
}

export const PROTOCOLS = [
  { value: "email", label: "Email" },
  { value: "sqs", label: "Amazon SQS" },
  { value: "lambda", label: "AWS Lambda" },
  { value: "https", label: "HTTPS" },
  { value: "http", label: "HTTP" },
];
