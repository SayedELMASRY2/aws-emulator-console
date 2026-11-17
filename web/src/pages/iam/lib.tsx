import StatusIndicator, { type StatusIndicatorProps } from "@cloudscape-design/components/status-indicator";
import { api } from "../../api";
import { useAsync, REGION, ACCOUNT } from "../../common";

export const iam = (op: string, p: Record<string, unknown> = {}) => api.call("iam", op, p);

/** Follows Marker pagination for IAM APIs */
export async function iamAll(op: string, key: string, p: Record<string, unknown> = {}, markerKey = "Marker") {
  const out: any[] = [];
  let marker: string | undefined;
  do {
    const r = await iam(op, { ...p, ...(marker ? { [markerKey]: marker } : {}) });
    out.push(...(r[key] || []));
    marker = r[markerKey];
  } while (marker);
  return out;
}

export const CRUMB = { text: "IAM", href: "#/iam/dashboard" };
export const crumbs = (...rest: { text: string; href?: string }[]) => [
  CRUMB,
  ...rest.map(r => ({ text: r.text, href: r.href || "#" })),
];
export const enc = encodeURIComponent;

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

export const TRUST_SERVICES = [
  { value: "lambda.amazonaws.com", label: "Lambda", desc: "Allows Lambda functions to call AWS services on your behalf." },
  { value: "ec2.amazonaws.com", label: "EC2", desc: "Allows EC2 instances to call AWS services on your behalf." },
  { value: "ecs-tasks.amazonaws.com", label: "Elastic Container Service Task (ECS)", desc: "Allows ECS container tasks to call AWS services." },
  { value: "glue.amazonaws.com", label: "AWS Glue", desc: "Allows Glue jobs and crawlers to access data in S3 and Data Catalog." },
  { value: "states.amazonaws.com", label: "Step Functions", desc: "Allows Step Functions state machines to orchestrate services." },
  { value: "export.rds.amazonaws.com", label: "RDS Snapshot Export", desc: "Allows RDS to export database snapshots to Amazon S3." },
];

export function buildTrustDoc(service: string) {
  return JSON.stringify(
    {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: {
            Service: service,
          },
          Action: "sts:AssumeRole",
        },
      ],
    },
    null,
    2
  );
}

export function parseTrustPrincipals(docString?: string) {
  if (!docString) return "-";
  try {
    const doc = typeof docString === "string" ? JSON.parse(decodeURIComponent(docString)) : docString;
    const statements = doc.Statement || [];
    const principals: string[] = [];
    for (const s of statements) {
      if (s.Principal?.Service) {
        if (Array.isArray(s.Principal.Service)) principals.push(...s.Principal.Service);
        else principals.push(String(s.Principal.Service));
      } else if (s.Principal?.AWS) {
        if (Array.isArray(s.Principal.AWS)) principals.push(...s.Principal.AWS);
        else principals.push(String(s.Principal.AWS));
      }
    }
    return principals.join(", ") || "Custom trust";
  } catch {
    return "Custom trust";
  }
}
