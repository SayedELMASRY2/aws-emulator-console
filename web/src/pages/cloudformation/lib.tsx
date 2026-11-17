import StatusIndicator, { type StatusIndicatorProps } from "@cloudscape-design/components/status-indicator";
import { api } from "../../api";

export const cfn = (op: string, p: Record<string, unknown> = {}) => api.call("cloudformation", op, p);

/** Follows NextToken pagination for CloudFormation APIs */
export async function cfnAll(op: string, key: string, p: Record<string, unknown> = {}, tokKey = "NextToken") {
  const out: any[] = [];
  let tok: string | undefined;
  do {
    const r = await cfn(op, { ...p, ...(tok ? { [tokKey]: tok } : {}) });
    out.push(...(r[key] || []));
    tok = r[tokKey] || r.nextToken;
  } while (tok);
  return out;
}

export const CRUMB = { text: "CloudFormation", href: "#/cloudformation/stacks" };
export const crumbs = (...rest: { text: string; href?: string }[]) => [
  CRUMB,
  ...rest.map(r => ({ text: r.text, href: r.href || "#" })),
];
export const enc = encodeURIComponent;

const ST: Record<string, StatusIndicatorProps.Type> = {
  CREATE_COMPLETE: "success",
  UPDATE_COMPLETE: "success",
  IMPORT_COMPLETE: "success",
  CREATE_IN_PROGRESS: "in-progress",
  UPDATE_IN_PROGRESS: "in-progress",
  DELETE_IN_PROGRESS: "in-progress",
  ROLLBACK_IN_PROGRESS: "in-progress",
  UPDATE_ROLLBACK_IN_PROGRESS: "in-progress",
  REVIEW_IN_PROGRESS: "pending",
  CREATE_FAILED: "error",
  DELETE_FAILED: "error",
  UPDATE_FAILED: "error",
  ROLLBACK_FAILED: "error",
  UPDATE_ROLLBACK_FAILED: "error",
  ROLLBACK_COMPLETE: "warning",
  UPDATE_ROLLBACK_COMPLETE: "warning",
  DELETE_COMPLETE: "stopped",
};

export function St({ s }: { s?: string }) {
  if (!s) return <>-</>;
  const label = s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
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

export const SAMPLE_TEMPLATES: Record<string, { label: string; desc: string; template: string }> = {
  s3_sqs: {
    label: "S3 Bucket and SQS Queue",
    desc: "Provisions an S3 storage bucket and an asynchronous message queue.",
    template: `AWSTemplateFormatVersion: "2010-09-09"
Description: S3 bucket and SQS queue application stack

Resources:
  AppStorageBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: !Sub "app-data-\${AWS::AccountId}"

  ProcessingQueue:
    Type: AWS::SQS::Queue
    Properties:
      QueueName: "app-jobs-queue"
      VisibilityTimeout: 60

Outputs:
  BucketName:
    Description: Name of the provisioned S3 bucket
    Value: !Ref AppStorageBucket

  QueueUrl:
    Description: URL of the provisioned SQS queue
    Value: !Ref ProcessingQueue
`,
  },
  dynamodb: {
    label: "DynamoDB Table",
    desc: "Provisions a managed NoSQL table with a primary hash key and on-demand billing.",
    template: `AWSTemplateFormatVersion: "2010-09-09"
Description: DynamoDB table with on-demand billing

Resources:
  OrdersTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: "Orders"
      BillingMode: "PAY_PER_REQUEST"
      AttributeDefinitions:
        - AttributeName: "orderId"
          AttributeType: "S"
      KeySchema:
        - AttributeName: "orderId"
          KeyType: "HASH"

Outputs:
  TableName:
    Description: DynamoDB Table Name
    Value: !Ref OrdersTable
`,
  },
};
