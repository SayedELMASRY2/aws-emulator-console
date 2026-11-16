import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
import Alert from "@cloudscape-design/components/alert";
import Modal from "@cloudscape-design/components/modal";
import { useCrumbs } from "../../App";
import { Copyable, ErrorAlert, useAsync, ValueWithLabel, EmulatorNote, useFlash, fmtBytes } from "../../common";
import { Tags } from "../s3/fields";
import { fromTagSet, toTagSet, type KV } from "../s3/lib";
import { ec2, sgHref, ruleTypeOf, portRange, protoLabel } from "../ec2/lib";
import { ActionModal } from "../ec2/ResourcePage";
import { rds, rdsAll, crumbs, Status, engineLabel, dbHref, clusterHref, fmtWhen, yesNo, enabled, storageLabel, classSpec, connectCmd, isAurora, isMysqlish, isPg } from "./lib";
import { itemsFor, useDbActions, type Row } from "./DbActions";

const V = ValueWithLabel;
const C = ({ t }: { t?: string | number }) => t !== undefined && t !== "" ? <Copyable text={String(t)} /> : <>-</>;
const BUSY = /ing$/;

function SgRules({ ids }: { ids: string[] }) {
  const sgs = useAsync(async () => ids.length ? (await ec2("DescribeSecurityGroups", { GroupIds: ids })).SecurityGroups || [] : [], [ids.join()]);
  const rows = (sgs.data || []).flatMap((g: any) => [
    ...(g.IpPermissions || []).map((p: any) => ({ g, p, dir: "Inbound" })), ...(g.IpPermissionsEgress || []).map((p: any) => ({ g, p, dir: "Outbound" })),
  ]).flatMap((x: any) => [...(x.p.IpRanges || []).map((r: any) => ({ ...x, src: r.CidrIp })), ...(x.p.UserIdGroupPairs || []).map((r: any) => ({ ...x, src: r.GroupId })), ...(x.p.Ipv6Ranges || []).map((r: any) => ({ ...x, src: r.CidrIpv6 }))]);
  return <Table variant="container" header={<Header variant="h2" counter={`(${rows.length})`}>Security group rules</Header>} items={rows} loading={sgs.loading}
    empty={<Box color="text-body-secondary">No rules</Box>}
    columnDefinitions={[
      { id: "g", header: "Security group", cell: (r: any) => <Link href={sgHref(r.g.GroupId)}>{r.g.GroupName} ({r.g.GroupId})</Link> },
      { id: "t", header: "Type", cell: (r: any) => `${ruleTypeOf(r.p)} · ${r.dir}` },
      { id: "p", header: "Protocol / ports", cell: (r: any) => `${protoLabel(r.p.IpProtocol)} ${portRange(r.p)}` },
      { id: "r", header: "Rule", cell: (r: any) => r.src },
    ]} />;
}

function ConnectBox({ engine, host, port, user, db }: { engine?: string; host?: string; port?: number; user?: string; db?: string }) {
  if (!host || !port) return null;
  const real = isMysqlish(engine) || isPg(engine);
  const cmd = connectCmd(engine, host, port, user || "admin", db);
  return (
    <Container header={<Header variant="h2" description={real ? "The emulator runs a real database server for this engine on your machine. Connect with any client using the master user." : undefined}>Connect using a client</Header>}>
      {real ? <SpaceBetween size="xs"><Box variant="code">{cmd}</Box><Copyable text={cmd} label="command" /></SpaceBetween>
        : <EmulatorNote>The emulator doesn't run a database server for {engineLabel(engine)}; only the RDS API is modeled.</EmulatorNote>}
    </Container>
  );
}

function LogsAndEvents({ id, sourceType, logs = true }: { id: string; sourceType: string; logs?: boolean }) {
  const files = useAsync(async () => logs ? ((await rds("DescribeDBLogFiles", { DBInstanceIdentifier: id })).DescribeDBLogFiles || []) : [], [id]);
  const evs = useAsync(async () => ((await rds("DescribeEvents", { SourceIdentifier: id, SourceType: sourceType, Duration: 20160 })).Events || []).reverse(), [id]);
  const [view, setView] = useState<string | null>(null);
  const [sel, setSel] = useState<any[]>([]);
  const content = useAsync(async () => {
    if (!view) return "";
    let out = "", marker = "0", more = true, n = 0;
    while (more && n++ < 20) { const r = await rds("DownloadDBLogFilePortion", { DBInstanceIdentifier: id, LogFileName: view, Marker: marker }); out += r.LogFileData || ""; marker = r.Marker; more = r.AdditionalDataPending; }
    return out;
  }, [view]);
  const download = async () => {
    const f = sel[0]; let out = "", marker = "0", more = true;
    while (more) { const r = await rds("DownloadDBLogFilePortion", { DBInstanceIdentifier: id, LogFileName: f.LogFileName, Marker: marker }); out += r.LogFileData || ""; marker = r.Marker; more = r.AdditionalDataPending; }
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([out], { type: "text/plain" })); a.download = f.LogFileName.split("/").pop(); a.click();
  };
  return (
    <SpaceBetween size="l">
      <Table variant="container" header={<Header variant="h2" counter={`(${evs.data?.length || 0})`} actions={<Button iconName="refresh" ariaLabel="Refresh" onClick={() => evs.reload()} />}>Recent events</Header>}
        items={evs.data || []} loading={evs.loading} empty={<Box color="text-body-secondary">No events</Box>}
        columnDefinitions={[{ id: "t", header: "Time", cell: (e: any) => fmtWhen(e.Date) }, { id: "m", header: "System notes", cell: (e: any) => e.Message }]} />
      {logs && <Table variant="container" header={<Header variant="h2" counter={`(${files.data?.length || 0})`}
          actions={<SpaceBetween direction="horizontal" size="xs"><Button iconName="refresh" ariaLabel="Refresh" onClick={() => files.reload()} /><Button disabled={!sel.length} onClick={() => setView(sel[0].LogFileName)}>View</Button><Button disabled={!sel.length} onClick={download}>Download</Button></SpaceBetween>}>Logs</Header>}
        items={files.data || []} loading={files.loading} selectionType="single" selectedItems={sel} onSelectionChange={e => setSel(e.detail.selectedItems)} trackBy="LogFileName"
        empty={<Box color="text-body-secondary">No log files</Box>}
        columnDefinitions={[{ id: "n", header: "Name", cell: (f: any) => f.LogFileName }, { id: "w", header: "Last written", cell: (f: any) => fmtWhen(f.LastWritten) }, { id: "s", header: "Size", cell: (f: any) => fmtBytes(f.Size) }]} />}
      <Modal visible={!!view} onDismiss={() => setView(null)} size="large" header={view || ""}>
        {content.loading ? <Spinner /> : <pre style={{ whiteSpace: "pre-wrap", maxHeight: 480, overflow: "auto", fontSize: 12 }}>{content.data || "(empty)"}</pre>}
      </Modal>
    </SpaceBetween>
  );
}

export function TagsTab({ arnStr, onSaved }: { arnStr: string; onSaved?: () => void }) {
  const flash = useFlash();
  const tags = useAsync(async () => (await rds("ListTagsForResource", { ResourceName: arnStr })).TagList || [], [arnStr]);
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState<KV[]>([]);
  return (
    <>
      <Table variant="container" header={<Header variant="h2" counter={`(${tags.data?.length || 0})`} actions={<Button onClick={() => { setDraft(fromTagSet(tags.data)); setEdit(true); }}>Manage tags</Button>}>Tags</Header>}
        items={tags.data || []} loading={tags.loading} empty={<Box color="text-body-secondary">No tags</Box>}
        columnDefinitions={[{ id: "k", header: "Key", cell: (t: any) => t.Key }, { id: "v", header: "Value", cell: (t: any) => t.Value || "-" }]} />
      {edit && <ActionModal visible onDismiss={() => setEdit(false)} header="Manage tags" ok="Save changes" size="large" onOk={async () => {
        const keep = toTagSet(draft);
        const removed = (tags.data || []).filter((t: any) => !keep.some(k => k.Key === t.Key)).map((t: any) => t.Key);
        if (removed.length) await rds("RemoveTagsFromResource", { ResourceName: arnStr, TagKeys: removed });
        if (keep.length) await rds("AddTagsToResource", { ResourceName: arnStr, Tags: keep });
        flash.notify({ type: "success", content: "Tags saved." }); tags.reload(); onSaved?.();
      }}><Tags tags={draft} onChange={setDraft} /></ActionModal>}
    </>
  );
}

function SnapshotsTable({ id, cluster }: { id: string; cluster?: boolean }) {
  const s = useAsync(() => cluster ? rdsAll("DescribeDBClusterSnapshots", "DBClusterSnapshots", { DBClusterIdentifier: id }) : rdsAll("DescribeDBSnapshots", "DBSnapshots", { DBInstanceIdentifier: id }), [id]);
  const kind = cluster ? "cluster" : "instance";
  return <Table variant="container" items={s.data || []} loading={s.loading}
    header={<Header variant="h2" counter={`(${s.data?.length || 0})`} actions={<Button href={`#/rds/snapshots/take?kind=${kind}&db=${encodeURIComponent(id)}`}>Take snapshot</Button>}>Snapshots</Header>}
    empty={<Box color="text-body-secondary">No snapshots</Box>}
    columnDefinitions={[
      { id: "n", header: "Snapshot name", cell: (x: any) => { const n = cluster ? x.DBClusterSnapshotIdentifier : x.DBSnapshotIdentifier; return <Link href={`#/rds/snapshots/${kind}/${encodeURIComponent(n)}`}>{n}</Link>; } },
      { id: "t", header: "Snapshot creation time", cell: (x: any) => fmtWhen(x.SnapshotCreateTime) },
      { id: "s", header: "Status", cell: (x: any) => <Status s={x.Status} /> },
      { id: "ty", header: "Type", cell: (x: any) => x.SnapshotType },
    ]} />;
}

function Summary({ items }: { items: [string, React.ReactNode][] }) {
  return <Container header={<Header variant="h2">Summary</Header>}><ColumnLayout columns={4} variant="text-grid">{items.map(([l, v]) => <V key={l} label={l}>{v}</V>)}</ColumnLayout></Container>;
}

function useDb<T>(fn: () => Promise<T | null>, id: string, busy: (t: T) => boolean) {
  const d = useAsync(fn, [id]);
  useEffect(() => { if (!d.data || !busy(d.data)) return; const t = setTimeout(() => d.reload(), 3000); return () => clearTimeout(t); }, [d.data]); // eslint-disable-line react-hooks/exhaustive-deps
  return d;
}

export function InstanceDetail() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  useCrumbs(crumbs({ text: "Databases", href: "#/rds/databases" }, { text: id }));
  const d = useDb(async () => {
    const i = (await rds("DescribeDBInstances", { DBInstanceIdentifier: id })).DBInstances?.[0];
    const c = i?.DBClusterIdentifier ? (await rds("DescribeDBClusters", { DBClusterIdentifier: i.DBClusterIdentifier })).DBClusters?.[0] : undefined;
    return i ? { i, c } : null;
  }, id, x => !!x && BUSY.test(x.i.DBInstanceStatus));
  const { run, modal } = useDbActions(() => d.reload(), () => nav("/rds/databases"));
  if (d.loading && !d.data) return <Box textAlign="center" padding="xl"><Spinner size="large" /></Box>;
  if (d.error) return <ErrorAlert error={d.error} />;
  if (!d.data) return <Alert type="error" header="Database not found">{id} doesn't exist.</Alert>;
  const { i, c } = d.data;
  const writer = c?.DBClusterMembers?.find((m: any) => m.DBInstanceIdentifier === i.DBInstanceIdentifier)?.IsClusterWriter;
  const role = c ? (writer ? "Writer instance" : "Reader instance") : i.ReadReplicaSourceDBInstanceIdentifier ? "Replica" : i.ReadReplicaDBInstanceIdentifiers?.length ? "Primary" : "Instance";
  const row: Row = { kind: "instance", id: i.DBInstanceIdentifier, role, raw: i, cluster: c };
  const ep = i.Endpoint;
  const pending = i.PendingModifiedValues || {};
  return (
    <ContentLayout header={<Header variant="h1" actions={<SpaceBetween direction="horizontal" size="xs">
      <Button iconName="refresh" ariaLabel="Refresh" onClick={() => d.reload()} />
      <Button href={`${dbHref(i.DBInstanceIdentifier)}/modify`}>Modify</Button>
      <ButtonDropdown items={itemsFor(row)} onItemClick={e => run(e.detail.id, row)}>Actions</ButtonDropdown>
    </SpaceBetween>}>{i.DBInstanceIdentifier}</Header>}>
      <SpaceBetween size="l">
        {Object.keys(pending).length > 0 && <Alert type="info" header="Pending modifications">{Object.entries(pending).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join(" · ")} — applied during the next maintenance window.</Alert>}
        <Summary items={[
          ["DB identifier", i.DBInstanceIdentifier], ["Status", <Status s={i.DBInstanceStatus} />], ["Role", role], ["Engine", engineLabel(i.Engine)],
          ["Recommendations", "-"], ["CPU", "-"], ["Class", i.DBInstanceClass], ["Current activity", "0 Connections"], ["Region & AZ", i.AvailabilityZone || "us-east-1"],
          ...(c ? [["DB cluster", <Link href={clusterHref(c.DBClusterIdentifier)}>{c.DBClusterIdentifier}</Link>] as [string, React.ReactNode]] : []),
        ]} />
        <Tabs tabs={[
          { id: "conn", label: "Connectivity & security", content: <SpaceBetween size="l">
            <Container><ColumnLayout columns={3} variant="text-grid">
              <SpaceBetween size="l"><Header variant="h3">Endpoint & port</Header><V label="Endpoint"><C t={ep?.Address} /></V><V label="Port">{ep?.Port ?? "-"}</V></SpaceBetween>
              <SpaceBetween size="l"><Header variant="h3">Networking</Header>
                <V label="Availability Zone">{i.AvailabilityZone || "-"}</V><V label="VPC">{i.DBSubnetGroup?.VpcId || "-"}</V>
                <V label="Subnet group"><Link href={`#/rds/subnet-groups/${encodeURIComponent(i.DBSubnetGroup?.DBSubnetGroupName || "")}`}>{i.DBSubnetGroup?.DBSubnetGroupName}</Link></V>
                <V label="Subnets">{(i.DBSubnetGroup?.Subnets || []).map((s: any) => <div key={s.SubnetIdentifier}>{s.SubnetIdentifier}</div>)}</V>
                <V label="Network type">{i.NetworkType || "IPV4"}</V></SpaceBetween>
              <SpaceBetween size="l"><Header variant="h3">Security</Header>
                <V label="VPC security groups">{(i.VpcSecurityGroups || []).map((g: any) => <div key={g.VpcSecurityGroupId}><Link href={sgHref(g.VpcSecurityGroupId)}>{g.VpcSecurityGroupId}</Link> ({g.Status})</div>)}</V>
                <V label="Publicly accessible">{yesNo(i.PubliclyAccessible)}</V>
                <V label="Certificate authority">{i.CACertificateIdentifier}</V>
                <V label="Certificate authority date">{fmtWhen(i.CertificateDetails?.ValidTill)}</V></SpaceBetween>
            </ColumnLayout></Container>
            <ConnectBox engine={i.Engine} host={ep?.Address} port={ep?.Port} user={i.MasterUsername || c?.MasterUsername} db={i.DBName || c?.DatabaseName} />
            <SgRules ids={(i.VpcSecurityGroups || []).map((g: any) => g.VpcSecurityGroupId)} />
            {(i.ReadReplicaDBInstanceIdentifiers || []).length > 0 && <Table variant="container" header={<Header variant="h2">Replication</Header>} items={i.ReadReplicaDBInstanceIdentifiers.map((x: string) => ({ x }))}
              columnDefinitions={[{ id: "x", header: "DB identifier", cell: (r: any) => <Link href={dbHref(r.x)}>{r.x}</Link> }, { id: "r", header: "Role", cell: () => "Replica" }]} />}
          </SpaceBetween> },
          { id: "mon", label: "Monitoring", content: <Container header={<Header variant="h2">CloudWatch</Header>}><EmulatorNote>The emulator doesn't publish RDS metrics to CloudWatch, so CPU, connections, IOPS and storage graphs have no data.</EmulatorNote></Container> },
          { id: "logs", label: "Logs & events", content: <LogsAndEvents id={i.DBInstanceIdentifier} sourceType="db-instance" /> },
          { id: "config", label: "Configuration", content: <Container><ColumnLayout columns={4} variant="text-grid">
            <SpaceBetween size="l"><Header variant="h3">Instance configuration</Header>
              <V label="DB instance ID">{i.DBInstanceIdentifier}</V><V label="Engine version">{i.EngineVersion}</V><V label="DB name">{i.DBName || "-"}</V>
              <V label="License model">{i.LicenseModel || "-"}</V>
              <V label="Option groups">{(i.OptionGroupMemberships || []).map((o: any) => <div key={o.OptionGroupName}><Link href={`#/rds/option-groups/${encodeURIComponent(o.OptionGroupName)}`}>{o.OptionGroupName}</Link> ({o.Status})</div>)}</V>
              <V label="Amazon Resource Name (ARN)"><C t={i.DBInstanceArn} /></V><V label="Resource ID">{i.DbiResourceId}</V><V label="Created time">{fmtWhen(i.InstanceCreateTime)}</V>
              <V label="Parameter group">{(i.DBParameterGroups || []).map((g: any) => <div key={g.DBParameterGroupName}><Link href={`#/rds/parameter-groups/db/${encodeURIComponent(g.DBParameterGroupName)}`}>{g.DBParameterGroupName}</Link> ({g.ParameterApplyStatus})</div>)}</V>
              <V label="Deletion protection">{enabled(i.DeletionProtection)}</V></SpaceBetween>
            <SpaceBetween size="l"><Header variant="h3">Instance class</Header>
              <V label="Instance class">{i.DBInstanceClass}</V><V label="vCPU / RAM">{classSpec(i.DBInstanceClass) || "-"}</V></SpaceBetween>
            <SpaceBetween size="l"><Header variant="h3">Storage</Header>
              <V label="Encryption">{enabled(i.StorageEncrypted)}</V>{i.KmsKeyId && <V label="AWS KMS key">{i.KmsKeyId}</V>}
              <V label="Storage type">{storageLabel(i.StorageType)}</V><V label="Storage">{i.AllocatedStorage} GiB</V>
              <V label="Provisioned IOPS">{i.Iops ? `${i.Iops} IOPS` : "-"}</V><V label="Storage throughput">{i.StorageThroughput ? `${i.StorageThroughput} MiBps` : "-"}</V>
              <V label="Storage autoscaling">{i.MaxAllocatedStorage ? `Enabled (maximum ${i.MaxAllocatedStorage} GiB)` : "Disabled"}</V></SpaceBetween>
            <SpaceBetween size="l"><Header variant="h3">Availability</Header>
              <V label="Master username">{i.MasterUsername || c?.MasterUsername || "-"}</V>
              <V label="Master password">{i.MasterUserSecret ? <>Managed in Secrets Manager<br /><Box variant="small">{i.MasterUserSecret.SecretArn}</Box></> : "****"}</V>
              <V label="IAM DB authentication">{enabled(i.IAMDatabaseAuthenticationEnabled)}</V>
              <V label="Multi-AZ">{yesNo(i.MultiAZ)}</V><V label="Secondary Zone">{i.SecondaryAvailabilityZone || "-"}</V>
              <V label="Performance Insights">{enabled(i.PerformanceInsightsEnabled)}</V><V label="Enhanced Monitoring">{i.MonitoringInterval ? `${i.MonitoringInterval} seconds` : "Disabled"}</V>
              <V label="Published logs">{(i.EnabledCloudwatchLogsExports || []).join(", ") || "-"}</V></SpaceBetween>
          </ColumnLayout></Container> },
          { id: "maint", label: "Maintenance & backups", content: <SpaceBetween size="l">
            <Container header={<Header variant="h2">Maintenance</Header>}><ColumnLayout columns={3} variant="text-grid">
              <V label="Auto minor version upgrade">{enabled(i.AutoMinorVersionUpgrade)}</V><V label="Maintenance window">{i.PreferredMaintenanceWindow}</V>
              <V label="Pending maintenance">{Object.keys(pending).length ? "Pending modifications" : "None"}</V></ColumnLayout></Container>
            <Container header={<Header variant="h2">Backup</Header>}><ColumnLayout columns={3} variant="text-grid">
              <V label="Automated backups">{c ? "Managed by the cluster" : i.BackupRetentionPeriod ? `Enabled (${i.BackupRetentionPeriod} Day${i.BackupRetentionPeriod > 1 ? "s" : ""})` : "Disabled"}</V>
              <V label="Backup window">{i.PreferredBackupWindow || "-"}</V><V label="Copy tags to snapshots">{enabled(i.CopyTagsToSnapshot)}</V>
              <V label="Latest restore time">{fmtWhen(i.LatestRestorableTime)}</V><V label="Backup target">{i.BackupTarget === "region" ? "AWS Region" : i.BackupTarget || "-"}</V></ColumnLayout></Container>
            {!c && <SnapshotsTable id={i.DBInstanceIdentifier} />}
          </SpaceBetween> },
          { id: "tags", label: "Tags", content: <TagsTab arnStr={i.DBInstanceArn} /> },
        ]} />
      </SpaceBetween>
      {modal}
    </ContentLayout>
  );
}

export function ClusterDetail() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  useCrumbs(crumbs({ text: "Databases", href: "#/rds/databases" }, { text: id }));
  const d = useDb(async () => {
    const c = (await rds("DescribeDBClusters", { DBClusterIdentifier: id })).DBClusters?.[0];
    if (!c) return null;
    const members = (c.DBClusterMembers || []).length ? (await rds("DescribeDBInstances", { Filters: [{ Name: "db-cluster-id", Values: [id] }] }).catch(() => ({ DBInstances: [] }))).DBInstances || [] : [];
    return { c, members };
  }, id, x => !!x && (BUSY.test(x.c.Status) || x.members.some((m: any) => BUSY.test(m.DBInstanceStatus))));
  const { run, modal } = useDbActions(() => d.reload(), () => nav("/rds/databases"));
  if (d.loading && !d.data) return <Box textAlign="center" padding="xl"><Spinner size="large" /></Box>;
  if (d.error) return <ErrorAlert error={d.error} />;
  if (!d.data) return <Alert type="error" header="Cluster not found">{id} doesn't exist.</Alert>;
  const { c, members } = d.data;
  const row: Row = { kind: "cluster", id: c.DBClusterIdentifier, role: "Regional cluster", raw: c };
  const writer = members.find((m: any) => c.DBClusterMembers.find((x: any) => x.DBInstanceIdentifier === m.DBInstanceIdentifier)?.IsClusterWriter);
  const [rHost, rPort] = String(c.ReaderEndpoint || "").split(":");
  const endpoints = [
    { name: c.Endpoint, type: "Writer", port: c.Port },
    ...(c.ReaderEndpoint ? [{ name: rHost, type: "Reader", port: rPort || c.Port }] : []),
    ...(c.CustomEndpoints || []).map((e: string) => ({ name: e, type: "Custom", port: c.Port })),
  ];
  return (
    <ContentLayout header={<Header variant="h1" actions={<SpaceBetween direction="horizontal" size="xs">
      <Button iconName="refresh" ariaLabel="Refresh" onClick={() => d.reload()} />
      <Button href={`${clusterHref(c.DBClusterIdentifier)}/modify`}>Modify</Button>
      <ButtonDropdown items={itemsFor(row)} onItemClick={e => run(e.detail.id, row)}>Actions</ButtonDropdown>
    </SpaceBetween>}>{c.DBClusterIdentifier}</Header>}>
      <SpaceBetween size="l">
        <Summary items={[
          ["DB identifier", c.DBClusterIdentifier], ["Status", <Status s={c.Status} />], ["Role", "Regional cluster"], ["Engine", engineLabel(c.Engine)],
          ["Recommendations", "-"], ["CPU", "-"], ["Capacity type", c.ServerlessV2ScalingConfiguration ? "Serverless v2" : c.EngineMode === "serverless" ? "Serverless" : "Provisioned"],
          ["Current activity", "0 Connections"], ["Region & AZ", "us-east-1"],
        ]} />
        <Table variant="container" header={<Header variant="h2" counter={`(${members.length})`} actions={<Button href={`${clusterHref(c.DBClusterIdentifier)}/add-reader`}>Add reader</Button>}>DB instances</Header>}
          items={members} empty={<Box color="text-body-secondary">This cluster has no DB instances. Add one to connect to it.</Box>}
          columnDefinitions={[
            { id: "n", header: "DB identifier", cell: (m: any) => <Link href={dbHref(m.DBInstanceIdentifier)}>{m.DBInstanceIdentifier}</Link> },
            { id: "s", header: "Status", cell: (m: any) => <Status s={m.DBInstanceStatus} /> },
            { id: "r", header: "Role", cell: (m: any) => m === writer ? "Writer instance" : "Reader instance" },
            { id: "c", header: "Size", cell: (m: any) => m.DBInstanceClass },
            { id: "a", header: "Region & AZ", cell: (m: any) => m.AvailabilityZone || "-" },
          ]} />
        <Tabs tabs={[
          { id: "conn", label: "Connectivity & security", content: <SpaceBetween size="l">
            <Table variant="container" header={<Header variant="h2" counter={`(${endpoints.length})`}>Endpoints</Header>} items={endpoints}
              columnDefinitions={[
                { id: "n", header: "Endpoint name", cell: (e: any) => <Copyable text={`${e.name}:${e.port}`} /> },
                { id: "s", header: "Status", cell: () => <Status s="available" /> },
                { id: "t", header: "Type", cell: (e: any) => e.type }, { id: "p", header: "Port", cell: (e: any) => e.port },
              ]} />
            <Container><ColumnLayout columns={3} variant="text-grid">
              <V label="VPC security groups">{(c.VpcSecurityGroups || []).map((g: any) => <div key={g.VpcSecurityGroupId}><Link href={sgHref(g.VpcSecurityGroupId)}>{g.VpcSecurityGroupId}</Link></div>)}</V>
              <V label="Subnet group"><Link href={`#/rds/subnet-groups/${encodeURIComponent(c.DBSubnetGroup)}`}>{c.DBSubnetGroup}</Link></V>
              <V label="Network type">{c.NetworkType || "IPV4"}</V>
            </ColumnLayout></Container>
            <ConnectBox engine={c.Engine} host={c.Endpoint} port={c.Port} user={c.MasterUsername} db={c.DatabaseName} />
            <SgRules ids={(c.VpcSecurityGroups || []).map((g: any) => g.VpcSecurityGroupId)} />
          </SpaceBetween> },
          { id: "mon", label: "Monitoring", content: <Container><EmulatorNote>The emulator doesn't publish Aurora metrics to CloudWatch.</EmulatorNote></Container> },
          { id: "logs", label: "Logs & events", content: <LogsAndEvents id={c.DBClusterIdentifier} sourceType="db-cluster" logs={false} /> },
          { id: "config", label: "Configuration", content: <Container><ColumnLayout columns={3} variant="text-grid">
            <SpaceBetween size="l"><Header variant="h3">Configuration</Header>
              <V label="DB cluster ID">{c.DBClusterIdentifier}</V><V label="Engine version">{c.EngineVersion}</V>
              <V label="DB cluster parameter group"><Link href={`#/rds/parameter-groups/cluster/${encodeURIComponent(c.DBClusterParameterGroup)}`}>{c.DBClusterParameterGroup}</Link></V>
              <V label="Database name">{c.DatabaseName || "-"}</V><V label="ARN"><C t={c.DBClusterArn} /></V><V label="Resource ID">{c.DbClusterResourceId}</V>
              <V label="Created time">{fmtWhen(c.ClusterCreateTime)}</V><V label="Deletion protection">{enabled(c.DeletionProtection)}</V></SpaceBetween>
            <SpaceBetween size="l"><Header variant="h3">Storage</Header>
              <V label="Cluster storage configuration">{c.StorageType === "aurora-iopt1" ? "Aurora I/O-Optimized" : "Aurora Standard"}</V>
              <V label="Encryption">{enabled(c.StorageEncrypted)}</V>
              {c.ServerlessV2ScalingConfiguration && <V label="Capacity range">{c.ServerlessV2ScalingConfiguration.MinCapacity} - {c.ServerlessV2ScalingConfiguration.MaxCapacity} ACUs</V>}</SpaceBetween>
            <SpaceBetween size="l"><Header variant="h3">Security</Header>
              <V label="Master username">{c.MasterUsername}</V><V label="Master password">{c.MasterUserSecret ? "Managed in Secrets Manager" : "****"}</V>
              <V label="IAM DB authentication">{enabled(c.IAMDatabaseAuthenticationEnabled)}</V><V label="Data API (RDS HTTP endpoint)">{enabled(c.HttpEndpointEnabled)}</V>
              <V label="Published logs">{(c.EnabledCloudwatchLogsExports || []).join(", ") || "-"}</V></SpaceBetween>
          </ColumnLayout></Container> },
          { id: "maint", label: "Maintenance & backups", content: <SpaceBetween size="l">
            <Container header={<Header variant="h2">Maintenance</Header>}><ColumnLayout columns={3} variant="text-grid">
              <V label="Auto minor version upgrade">{enabled(c.AutoMinorVersionUpgrade)}</V><V label="Maintenance window">{c.PreferredMaintenanceWindow}</V><V label="Pending maintenance">None</V></ColumnLayout></Container>
            <Container header={<Header variant="h2">Backup</Header>}><ColumnLayout columns={3} variant="text-grid">
              <V label="Automated backups">{`Enabled (${c.BackupRetentionPeriod} Day${c.BackupRetentionPeriod > 1 ? "s" : ""})`}</V>
              <V label="Backup window">{c.PreferredBackupWindow}</V><V label="Copy tags to snapshots">{enabled(c.CopyTagsToSnapshot)}</V>
              <V label="Earliest restorable time">{fmtWhen(c.EarliestRestorableTime)}</V><V label="Latest restore time">{fmtWhen(c.LatestRestorableTime)}</V>
              <V label="Backtrack window">{c.BacktrackWindow ? `${c.BacktrackWindow / 3600} hours` : "Disabled"}</V></ColumnLayout></Container>
            <SnapshotsTable id={c.DBClusterIdentifier} cluster />
          </SpaceBetween> },
          { id: "tags", label: "Tags", content: <TagsTab arnStr={c.DBClusterArn} /> },
        ]} />
        {!isAurora(c.Engine) && null}
      </SpaceBetween>
      {modal}
    </ContentLayout>
  );
}
