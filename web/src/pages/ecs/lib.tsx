import StatusIndicator, { type StatusIndicatorProps } from "@cloudscape-design/components/status-indicator";
import { api } from "../../api";
import { useAsync, ACCOUNT, REGION } from "../../common";

export const ecs = (op: string, p: Record<string, unknown> = {}) => api.call("ecs", op, p);

/** Follows nextToken pagination for ECS APIs */
export async function ecsAll(op: string, key: string, p: Record<string, unknown> = {}, tokKey = "nextToken") {
  const out: any[] = [];
  let tok: string | undefined;
  do {
    const r = await ecs(op, { ...p, ...(tok ? { [tokKey]: tok } : {}) });
    out.push(...(r[key] || []));
    tok = r[tokKey] || r.NextToken;
  } while (tok);
  return out;
}

export const CRUMB = { text: "Amazon ECS", href: "#/ecs/clusters" };
export const crumbs = (...rest: { text: string; href?: string }[]) => [
  CRUMB,
  ...rest.map(r => ({ text: r.text, href: r.href || "#" }))
];
export const enc = encodeURIComponent;

const ST: Record<string, StatusIndicatorProps.Type> = {
  ACTIVE: "success",
  RUNNING: "success",
  PROVISIONING: "in-progress",
  PENDING: "pending",
  ACTIVATING: "in-progress",
  STOPPING: "in-progress",
  DEACTIVATING: "in-progress",
  DEPROVISIONING: "in-progress",
  STOPPED: "stopped",
  INACTIVE: "stopped",
  DRAINING: "warning",
  FAILED: "error",
  ERROR: "error",
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

export function arnName(arn?: string) {
  if (!arn) return "—";
  return arn.split("/").pop() || arn;
}

export function tdShort(arn?: string) {
  if (!arn) return "—";
  const name = arnName(arn);
  return name.includes(":") ? name : arn;
}

// ---------------- ECS Pickers & Helpers ----------------
export function useTaskDefOptions() {
  return useAsync(async () => {
    const arns: string[] = await ecsAll("ListTaskDefinitions", "taskDefinitionArns", { status: "ACTIVE" });
    return arns.map(a => {
      const label = arnName(a);
      return { value: a, label };
    });
  });
}

export function useClusterOptions() {
  return useAsync(async () => {
    const arns: string[] = await ecsAll("ListClusters", "clusterArns");
    return arns.map(a => {
      const name = arnName(a);
      return { value: name, label: name };
    });
  });
}

export function useVpcs() {
  return useAsync(async () => {
    const r = await api.call("ec2", "DescribeVpcs");
    return (r.Vpcs || []).map((v: any) => ({
      value: v.VpcId,
      label: `${v.VpcId} (${v.CidrBlock || ""}${v.IsDefault ? " - Default" : ""})`,
    }));
  });
}

export function useSubnets(vpcId?: string) {
  return useAsync(async () => {
    const r = await api.call("ec2", "DescribeSubnets");
    let list = r.Subnets || [];
    if (vpcId) list = list.filter((s: any) => s.VpcId === vpcId);
    return list.map((s: any) => ({
      value: s.SubnetId,
      label: `${s.SubnetId} (${s.AvailabilityZone} - ${s.CidrBlock})`,
    }));
  }, [vpcId]);
}

export function useSecurityGroups(vpcId?: string) {
  return useAsync(async () => {
    const r = await api.call("ec2", "DescribeSecurityGroups");
    let list = r.SecurityGroups || [];
    if (vpcId) list = list.filter((g: any) => !vpcId || g.VpcId === vpcId);
    return list.map((g: any) => ({
      value: g.GroupId,
      label: `${g.GroupName} (${g.GroupId})`,
    }));
  });
}

export function useTargetGroups() {
  return useAsync(async () => {
    try {
      const r = await api.call("elbv2", "DescribeTargetGroups");
      return (r.TargetGroups || []).map((tg: any) => ({
        value: tg.TargetGroupArn,
        label: `${tg.TargetGroupName} (${tg.Protocol}:${tg.Port})`,
        containerPort: tg.Port,
      }));
    } catch {
      return [];
    }
  });
}
