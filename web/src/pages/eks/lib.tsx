import StatusIndicator, { type StatusIndicatorProps } from "@cloudscape-design/components/status-indicator";
import { api } from "../../api";
import { useAsync, REGION } from "../../common";

export const eks = (op: string, p: Record<string, unknown> = {}) => api.call("eks", op, p);

/** Follows nextToken pagination for EKS APIs */
export async function eksAll(op: string, key: string, p: Record<string, unknown> = {}, tokKey = "nextToken") {
  const out: any[] = [];
  let tok: string | undefined;
  do {
    const r = await eks(op, { ...p, ...(tok ? { [tokKey]: tok } : {}) });
    out.push(...(r[key] || []));
    tok = r[tokKey] || r.NextToken;
  } while (tok);
  return out;
}

export const CRUMB = { text: "Amazon EKS", href: "#/eks/clusters" };
export const crumbs = (...rest: { text: string; href?: string }[]) => [
  CRUMB,
  ...rest.map(r => ({ text: r.text, href: r.href || "#" })),
];
export const enc = encodeURIComponent;

const ST: Record<string, StatusIndicatorProps.Type> = {
  ACTIVE: "success",
  CREATING: "in-progress",
  UPDATING: "in-progress",
  DELETING: "in-progress",
  FAILED: "error",
  DEGRADED: "warning",
  PENDING: "pending",
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

export function kubeconfigCmd(clusterName: string) {
  return `aws eks update-kubeconfig --name ${clusterName} --region ${REGION}`;
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

export function useEksRoles() {
  return useAsync(async () => {
    const r = await api.call("iam", "ListRoles");
    return (r.Roles || []).map((role: any) => ({
      value: role.Arn,
      label: `${role.RoleName} (${role.Arn})`,
    }));
  });
}
