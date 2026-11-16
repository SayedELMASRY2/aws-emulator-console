import { useEffect } from "react";
import { useParams } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Tabs from "@cloudscape-design/components/tabs";
import Table from "@cloudscape-design/components/table";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ButtonDropdown from "@cloudscape-design/components/button-dropdown";
import Link from "@cloudscape-design/components/link";
import Spinner from "@cloudscape-design/components/spinner";
import LineChart from "@cloudscape-design/components/line-chart";
import { useCrumbs } from "../../App";
import { api } from "../../api";
import { Copyable, ErrorAlert, useAsync, ValueWithLabel, EmulatorNote } from "../../common";
import { ec2, nameOf, State, fmt, sgHref, instHref, ruleTypeOf, portRange, protoLabel } from "./lib";
import { useModal } from "./ResourcePage";
import { InstanceModals, STATE_ITEMS, ACTION_ITEMS } from "./InstanceActions";
import { statusChecks } from "./Instances";

const V = ValueWithLabel;
const C = ({ t }: { t?: string }) => t ? <Copyable text={t} /> : <>-</>;

export function DetailsTab({ i }: { i: any }) {
  const prot = useAsync(async () => {
    const [t, s] = await Promise.all([
      ec2("DescribeInstanceAttribute", { InstanceId: i.InstanceId, Attribute: "disableApiTermination" }).then((r: any) => r.DisableApiTermination?.Value).catch(() => undefined),
      ec2("DescribeInstanceAttribute", { InstanceId: i.InstanceId, Attribute: "disableApiStop" }).then((r: any) => r.DisableApiStop?.Value).catch(() => undefined),
    ]);
    return { t, s };
  }, [i]);
  return (
    <SpaceBetween size="l">
      <ColumnLayout columns={3} variant="text-grid">
        <V label="Instance ID"><C t={i.InstanceId} /></V>
        <V label="Public IPv4 address"><C t={i.PublicIpAddress} /></V>
        <V label="Private IPv4 addresses"><C t={i.PrivateIpAddress} /></V>
        <V label="Instance state"><State s={i.State?.Name} /></V>
        <V label="Public IPv4 DNS"><C t={i.PublicDnsName} /></V>
        <V label="Private IP DNS name (IPv4 only)"><C t={i.PrivateDnsName} /></V>
        <V label="Instance type">{i.InstanceType}</V>
        <V label="VPC ID">{i.VpcId || "-"}</V>
        <V label="Subnet ID">{i.SubnetId || "-"}</V>
        <V label="IAM Role">{i.IamInstanceProfile?.Arn ? String(i.IamInstanceProfile.Arn).split("/").pop() : "-"}</V>
        <V label="Instance ARN"><C t={`arn:aws:ec2:us-east-1:000000000000:instance/${i.InstanceId}`} /></V>
        <V label="Auto Scaling Group name">{(i.Tags || []).find((t: any) => t.Key === "aws:autoscaling:groupName")?.Value || "-"}</V>
      </ColumnLayout>
      <Header variant="h3">Instance details</Header>
      <ColumnLayout columns={3} variant="text-grid">
        <V label="Platform">{i.Platform || "Linux/UNIX"}</V>
        <V label="Platform details">{i.PlatformDetails || "-"}</V>
        <V label="AMI ID">{i.ImageId}</V>
        <V label="Monitoring">{i.Monitoring?.State}</V>
        <V label="Termination protection">{prot.data?.t === undefined ? "-" : prot.data.t ? "Enabled" : "Disabled"}</V>
        <V label="Stop protection">{prot.data?.s === undefined ? "-" : prot.data.s ? "Enabled" : "Disabled"}</V>
        <V label="Launch time">{fmt(i.LaunchTime)}</V>
        <V label="Lifecycle">{i.InstanceLifecycle || "normal"}</V>
        <V label="Key pair assigned at launch">{i.KeyName || "-"}</V>
        <V label="Tenancy">{i.Placement?.Tenancy || "default"}</V>
        <V label="Placement group">{i.Placement?.GroupName || "-"}</V>
        <V label="Availability Zone">{i.Placement?.AvailabilityZone}</V>
        <V label="Architecture">{i.Architecture}</V>
        <V label="Virtualization type">{i.VirtualizationType || "hvm"}</V>
        <V label="Root device name">{i.RootDeviceName || "-"}</V>
        <V label="Root device type">{i.RootDeviceType || "ebs"}</V>
        <V label="EBS-optimized">{i.EbsOptimized ? "true" : "false"}</V>
        <V label="Number of vCPUs">{i.CpuOptions ? i.CpuOptions.CoreCount * i.CpuOptions.ThreadsPerCore : "-"}</V>
        <V label="IMDSv2">{i.MetadataOptions?.HttpTokens === "required" ? "Required" : "Optional"}</V>
        <V label="Instance metadata service">{i.MetadataOptions?.HttpEndpoint === "disabled" ? "Disabled" : "Enabled"}</V>
        <V label="Hibernation">{i.HibernationOptions?.Configured ? "Enabled" : "Disabled"}</V>
      </ColumnLayout>
    </SpaceBetween>
  );
}

export function StatusTab({ i }: { i: any }) {
  const st = useAsync(async () => ((await ec2("DescribeInstanceStatus", { InstanceIds: [i.InstanceId], IncludeAllInstances: true })).InstanceStatuses || [])[0], [i.InstanceId]);
  const s = st.data;
  return (
    <SpaceBetween size="l">
      <ColumnLayout columns={3} variant="text-grid">
        <V label="Status checks">{i.State?.Name === "running" ? statusChecks(s) : "-"}</V>
        <V label="System reachability check">{s?.SystemStatus?.Details?.[0]?.Status || s?.SystemStatus?.Status || "-"}</V>
        <V label="Instance reachability check">{s?.InstanceStatus?.Details?.[0]?.Status || s?.InstanceStatus?.Status || "-"}</V>
      </ColumnLayout>
      <Table variant="embedded" header={<Header variant="h3" counter={`(${s?.Events?.length || 0})`}>Scheduled events</Header>} items={s?.Events || []}
        empty={<Box color="text-body-secondary">No scheduled events</Box>}
        columnDefinitions={[{ id: "c", header: "Event type", cell: (e: any) => e.Code }, { id: "d", header: "Description", cell: (e: any) => e.Description }, { id: "s", header: "Start", cell: (e: any) => fmt(e.NotBefore) }]} />
    </SpaceBetween>
  );
}

export function MonitoringTab({ i }: { i: any }) {
  const m = useAsync(async () => {
    const list = (await api.call("cloudwatch", "ListMetrics", { Namespace: "AWS/EC2", Dimensions: [{ Name: "InstanceId", Value: i.InstanceId }] })).Metrics || [];
    if (!list.length) return [];
    const r = await api.call("cloudwatch", "GetMetricData", { StartTime: new Date(Date.now() - 3 * 3600e3).toISOString(), EndTime: new Date().toISOString(),
      MetricDataQueries: list.slice(0, 20).map((x: any, k: number) => ({ Id: `m${k}`, MetricStat: { Metric: x, Period: 300, Stat: "Average" } })) });
    return r.MetricDataResults.map((res: any, k: number) => ({ name: list[k].MetricName, data: res.Timestamps.map((t: string, j: number) => ({ x: new Date(t), y: res.Values[j] })) }));
  }, [i.InstanceId]);
  if (m.loading) return <Spinner />;
  if (!m.data?.length) return <EmulatorNote>No CloudWatch metrics exist for this instance. The emulator doesn't run a guest OS, so it doesn't publish CPU, network or disk metrics for EC2 instances.</EmulatorNote>;
  return <ColumnLayout columns={2}>{m.data.map((x: any) => <div key={x.name}><Box variant="h4">{x.name}</Box><LineChart series={[{ title: x.name, type: "line", data: x.data }]} height={160} hideFilter xScaleType="time" /></div>)}</ColumnLayout>;
}

export function SecurityTab({ i }: { i: any }) {
  const sgs = useAsync(async () => (i.SecurityGroups || []).length ? (await ec2("DescribeSecurityGroups", { GroupIds: i.SecurityGroups.map((g: any) => g.GroupId) })).SecurityGroups : [], [i.InstanceId]);
  const rows = (dir: "in" | "out") => (sgs.data || []).flatMap((g: any) => (dir === "in" ? g.IpPermissions : g.IpPermissionsEgress || []).flatMap((p: any) => [
    ...(p.IpRanges || []).map((r: any) => ({ g, p, src: r.CidrIp, d: r.Description })),
    ...(p.Ipv6Ranges || []).map((r: any) => ({ g, p, src: r.CidrIpv6, d: r.Description })),
    ...(p.UserIdGroupPairs || []).map((r: any) => ({ g, p, src: r.GroupId, d: r.Description })),
    ...(p.PrefixListIds || []).map((r: any) => ({ g, p, src: r.PrefixListId, d: r.Description })),
  ]));
  const cols = (src: string) => [
    { id: "n", header: "Security group", cell: (r: any) => <Link href={sgHref(r.g.GroupId)}>{r.g.GroupName}</Link> },
    { id: "t", header: "Type", cell: (r: any) => ruleTypeOf(r.p) },
    { id: "pr", header: "Protocol", cell: (r: any) => protoLabel(r.p.IpProtocol) },
    { id: "po", header: "Port range", cell: (r: any) => portRange(r.p) },
    { id: "s", header: src, cell: (r: any) => r.src },
    { id: "d", header: "Description", cell: (r: any) => r.d || "-" },
  ];
  return (
    <SpaceBetween size="l">
      <ColumnLayout columns={3} variant="text-grid">
        <V label="IAM Role">{i.IamInstanceProfile?.Arn ? String(i.IamInstanceProfile.Arn).split("/").pop() : "-"}</V>
        <V label="Owner ID">000000000000</V>
        <V label="Security groups">{(i.SecurityGroups || []).map((g: any, k: number) => <div key={k}><Link href={sgHref(g.GroupId)}>{g.GroupId} ({g.GroupName})</Link></div>)}</V>
      </ColumnLayout>
      <Table variant="embedded" header={<Header variant="h3">Inbound rules</Header>} items={rows("in")} loading={sgs.loading} columnDefinitions={cols("Source")} empty={<Box color="text-body-secondary">No inbound rules</Box>} />
      <Table variant="embedded" header={<Header variant="h3">Outbound rules</Header>} items={rows("out")} loading={sgs.loading} columnDefinitions={cols("Destination")} empty={<Box color="text-body-secondary">No outbound rules</Box>} />
    </SpaceBetween>
  );
}

export function NetworkingTab({ i }: { i: any }) {
  const eips = useAsync(async () => (await ec2("DescribeAddresses", { Filters: [{ Name: "instance-id", Values: [i.InstanceId] }] })).Addresses || [], [i.InstanceId]);
  return (
    <SpaceBetween size="l">
      <ColumnLayout columns={3} variant="text-grid">
        <V label="Public IPv4 address"><C t={i.PublicIpAddress} /></V>
        <V label="Private IPv4 addresses"><C t={i.PrivateIpAddress} /></V>
        <V label="VPC ID">{i.VpcId}</V>
        <V label="Subnet ID">{i.SubnetId}</V>
        <V label="Availability Zone">{i.Placement?.AvailabilityZone}</V>
        <V label="Source/destination check">{i.SourceDestCheck === false ? "Disabled" : "Enabled"}</V>
        <V label="Elastic IP addresses">{(eips.data || []).map((a: any) => a.PublicIp).join(", ") || "-"}</V>
      </ColumnLayout>
      <Table variant="embedded" header={<Header variant="h3" counter={`(${i.NetworkInterfaces?.length || 0})`}>Network interfaces</Header>} items={i.NetworkInterfaces || []}
        columnDefinitions={[
          { id: "id", header: "Interface ID", cell: (n: any) => n.NetworkInterfaceId },
          { id: "d", header: "Description", cell: (n: any) => n.Description || "-" },
          { id: "ip", header: "Private IPv4 address", cell: (n: any) => n.PrivateIpAddress },
          { id: "pub", header: "Public IPv4 address", cell: (n: any) => n.Association?.PublicIp || "-" },
          { id: "sub", header: "Subnet ID", cell: (n: any) => n.SubnetId },
          { id: "idx", header: "Device index", cell: (n: any) => n.Attachment?.DeviceIndex },
          { id: "st", header: "Attachment status", cell: (n: any) => n.Attachment?.Status },
          { id: "mac", header: "MAC address", cell: (n: any) => n.MacAddress },
        ]} />
    </SpaceBetween>
  );
}

export function StorageTab({ i }: { i: any }) {
  const ids = (i.BlockDeviceMappings || []).map((b: any) => b.Ebs?.VolumeId).filter(Boolean);
  const vols = useAsync(async () => ids.length ? (await ec2("DescribeVolumes", { VolumeIds: ids })).Volumes : [], [ids.join()]);
  const byId = new Map((vols.data || []).map((v: any) => [v.VolumeId, v]));
  return (
    <SpaceBetween size="l">
      <ColumnLayout columns={3} variant="text-grid">
        <V label="Root device name">{i.RootDeviceName || "-"}</V>
        <V label="Root device type">{i.RootDeviceType || "ebs"}</V>
        <V label="EBS optimization">{i.EbsOptimized ? "enabled" : "disabled"}</V>
      </ColumnLayout>
      <Table variant="embedded" header={<Header variant="h3" counter={`(${i.BlockDeviceMappings?.length || 0})`}>Block devices</Header>} items={i.BlockDeviceMappings || []} loading={vols.loading}
        empty={<Box color="text-body-secondary">No block devices</Box>}
        columnDefinitions={[
          { id: "v", header: "Volume ID", cell: (b: any) => <Link href={`#/ec2/volumes`}>{b.Ebs?.VolumeId}</Link> },
          { id: "d", header: "Device name", cell: (b: any) => b.DeviceName },
          { id: "s", header: "Volume size (GiB)", cell: (b: any) => (byId.get(b.Ebs?.VolumeId) as any)?.Size ?? "-" },
          { id: "t", header: "Volume type", cell: (b: any) => (byId.get(b.Ebs?.VolumeId) as any)?.VolumeType ?? "-" },
          { id: "a", header: "Attachment status", cell: (b: any) => b.Ebs?.Status },
          { id: "at", header: "Attachment time", cell: (b: any) => fmt(b.Ebs?.AttachTime) },
          { id: "e", header: "Encrypted", cell: (b: any) => (byId.get(b.Ebs?.VolumeId) as any)?.Encrypted ? "Yes" : "No" },
          { id: "del", header: "Delete on termination", cell: (b: any) => b.Ebs?.DeleteOnTermination ? "Yes" : "No" },
        ]} />
    </SpaceBetween>
  );
}

export function TagsTab({ i, onManage }: { i: any; onManage: () => void }) {
  return (
    <Table variant="embedded" header={<Header variant="h3" counter={`(${i.Tags?.length || 0})`} actions={<Button onClick={onManage}>Manage tags</Button>}>Tags</Header>}
      items={(i.Tags || []).filter((t: any) => !t.Key.startsWith("aws:"))} empty={<Box color="text-body-secondary">No tags</Box>}
      columnDefinitions={[{ id: "k", header: "Key", cell: (t: any) => t.Key }, { id: "v", header: "Value", cell: (t: any) => t.Value || "-" }]} />
  );
}

export default function InstanceDetail() {
  const { id = "" } = useParams();
  useCrumbs([{ text: "EC2", href: "#/ec2/dashboard" }, { text: "Instances", href: "#/ec2/instances" }, { text: id, href: instHref(id) }]);
  const d = useAsync(async () => ((await ec2("DescribeInstances", { InstanceIds: [id] })).Reservations?.[0]?.Instances || [])[0], [id]);
  const m = useModal();
  const busy = ["pending", "stopping", "shutting-down"].includes(d.data?.State?.Name);
  useEffect(() => { if (!busy) return; const t = setTimeout(() => d.reload(), 2500); return () => clearTimeout(t); }, [busy, d.data]); // eslint-disable-line react-hooks/exhaustive-deps
  if (d.loading && !d.data) return <Box textAlign="center" padding="xl"><Spinner size="large" /></Box>;
  if (d.error) return <ErrorAlert error={d.error} />;
  const i = d.data;
  if (!i) return <ErrorAlert error={new Error(`Instance ${id} not found.`)} />;
  return (
    <ContentLayout header={<Header variant="h1" description={nameOf(i) || undefined}
      actions={<SpaceBetween direction="horizontal" size="xs">
        <Button iconName="refresh" ariaLabel="Refresh" onClick={() => d.reload()} />
        <Button onClick={() => m.open("connect", [i])}>Connect</Button>
        <ButtonDropdown items={STATE_ITEMS([i])} onItemClick={e => m.open(e.detail.id, [i])}>Instance state</ButtonDropdown>
        <ButtonDropdown items={ACTION_ITEMS([i])} onItemClick={e => m.open(e.detail.id, [i])}>Actions</ButtonDropdown>
      </SpaceBetween>}>Instance summary for {i.InstanceId}</Header>}>
      <SpaceBetween size="l">
        <Container><Box variant="small" color="text-body-secondary">Updated {new Date().toLocaleTimeString()}</Box><DetailsTab i={i} /></Container>
        <Tabs tabs={[
          { id: "status", label: "Status and alarms", content: <Container><StatusTab i={i} /></Container> },
          { id: "monitoring", label: "Monitoring", content: <Container><MonitoringTab i={i} /></Container> },
          { id: "security", label: "Security", content: <Container><SecurityTab i={i} /></Container> },
          { id: "networking", label: "Networking", content: <Container><NetworkingTab i={i} /></Container> },
          { id: "storage", label: "Storage", content: <Container><StorageTab i={i} /></Container> },
          { id: "tags", label: "Tags", content: <Container><TagsTab i={i} onManage={() => m.open("tags", [i])} /></Container> },
        ]} />
      </SpaceBetween>
      <InstanceModals m={m} reload={() => d.reload()} />
    </ContentLayout>
  );
}
