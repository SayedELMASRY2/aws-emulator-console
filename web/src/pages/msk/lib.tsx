import StatusIndicator, { type StatusIndicatorProps } from "@cloudscape-design/components/status-indicator";
import { api } from "../../api";
import { useAsync, REGION } from "../../common";

export const msk = (op: string, p: Record<string, unknown> = {}) => api.call("kafka", op, p);

/** Follows NextToken pagination for MSK (Kafka) APIs */
export async function mskAll(op: string, key: string, p: Record<string, unknown> = {}, tokKey = "NextToken") {
  const out: any[] = [];
  let tok: string | undefined;
  do {
    const r = await msk(op, { ...p, ...(tok ? { [tokKey]: tok } : {}) });
    out.push(...(r[key] || []));
    tok = r[tokKey] || r.nextToken;
  } while (tok);
  return out;
}

export const CRUMB = { text: "Amazon MSK", href: "#/msk/clusters" };
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
  HEALING: "warning",
  REBOOTING_BROKER: "in-progress",
  MAINTENANCE: "info",
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

export const MSK_TYPES = [
  { value: "kafka.t3.small", label: "kafka.t3.small (2 vCPU, 2 GiB)" },
  { value: "kafka.m5.large", label: "kafka.m5.large (2 vCPU, 8 GiB - recommended)" },
  { value: "kafka.m5.xlarge", label: "kafka.m5.xlarge (4 vCPU, 16 GiB)" },
  { value: "kafka.m7g.large", label: "kafka.m7g.large (Graviton, 2 vCPU, 8 GiB)" },
  { value: "kafka.m7g.xlarge", label: "kafka.m7g.xlarge (Graviton, 4 vCPU, 16 GiB)" },
];

export const KAFKA_VERSIONS = [
  { value: "3.8.x", label: "Apache Kafka 3.8.x (recommended)" },
  { value: "3.7.x.kraft", label: "Apache Kafka 3.7.x (KRaft mode)" },
  { value: "3.6.0", label: "Apache Kafka 3.6.0" },
];

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

export function useMskConfigurations() {
  return useAsync(async () => {
    try {
      const r = await mskAll("ListConfigurations", "Configurations");
      return r.map((c: any) => ({
        value: `${c.Arn}|${c.LatestRevision?.Revision || 1}`,
        label: c.Name,
        arn: c.Arn,
        revision: c.LatestRevision?.Revision || 1,
      }));
    } catch {
      return [];
    }
  });
}
