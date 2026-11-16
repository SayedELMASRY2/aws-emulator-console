// Tabs of the table page (everything except Overview).
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import Table from "@cloudscape-design/components/table";
import Button from "@cloudscape-design/components/button";
import SpaceBetween from "@cloudscape-design/components/space-between";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Box from "@cloudscape-design/components/box";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Modal from "@cloudscape-design/components/modal";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Select from "@cloudscape-design/components/select";
import RadioGroup from "@cloudscape-design/components/radio-group";
import LineChart from "@cloudscape-design/components/line-chart";
import Link from "@cloudscape-design/components/link";
import { api } from "../../api";
import { ConfirmModal, Copyable, ErrorAlert, fmtBytes, fmtDate, useAsync, useFlash, ValueWithLabel, EmulatorNote } from "../../common";
import { JsonBlock } from "../s3/PermissionsTab";
import { ddb, keyLabel, isOnDemand, editHref, exploreHref, streamViewLabel, encryptionLabel, tableClassLabel } from "./lib";

const onOff = (on: boolean) => on ? <StatusIndicator type="success">On</StatusIndicator> : <StatusIndicator type="stopped">Off</StatusIndicator>;
const idxStatus = (s: string) => s === "ACTIVE" ? <StatusIndicator type="success">Active</StatusIndicator> : <StatusIndicator type="in-progress">{s}</StatusIndicator>;
const projLabel = (p: any) => p?.ProjectionType === "INCLUDE" ? `Include: ${(p.NonKeyAttributes || []).join(", ")}` : p?.ProjectionType === "KEYS_ONLY" ? "Keys only" : "All";
function Footer({ cancel, ok, label, busy, disabled }: any) {
  return <Box float="right"><SpaceBetween direction="horizontal" size="xs"><Button variant="link" onClick={cancel}>Cancel</Button><Button variant="primary" loading={busy} disabled={disabled} onClick={ok}>{label}</Button></SpaceBetween></Box>;
}

// ---------------- Indexes ----------------
export function IndexesTab({ t, reload }: { t: any; reload: () => void }) {
  const flash = useFlash();
  const [sel, setSel] = useState<any[]>([]);
  const [del, setDel] = useState(false);
  const enc = encodeURIComponent(t.TableName);
  return (
    <SpaceBetween size="l">
      <Table
        header={<Header counter={`(${t.GlobalSecondaryIndexes?.length || 0})`} description="Global secondary indexes let you query the table using an alternate partition key and sort key."
          actions={<SpaceBetween direction="horizontal" size="xs">
            <Button disabled={sel.length !== 1} href={sel[0] ? exploreHref(t.TableName, sel[0].IndexName) : undefined}>Explore items</Button>
            <Button disabled={!sel.length} onClick={() => setDel(true)}>Delete</Button>
            <Button variant="primary" href={`#/dynamodb/tables/${enc}/create-index`}>Create index</Button>
          </SpaceBetween>}>Global secondary indexes</Header>}
        items={t.GlobalSecondaryIndexes || []} trackBy="IndexName" selectionType="single" selectedItems={sel} onSelectionChange={e => setSel(e.detail.selectedItems)}
        empty={<Box textAlign="center" color="inherit"><b>No global indexes</b><Box variant="p" color="inherit">You have not created any global secondary indexes.</Box></Box>}
        columnDefinitions={[
          { id: "n", header: "Name", cell: (g: any) => g.IndexName },
          { id: "s", header: "Status", cell: (g: any) => idxStatus(g.IndexStatus) },
          { id: "pk", header: "Partition key", cell: (g: any) => keyLabel(t, "HASH", g.KeySchema) },
          { id: "sk", header: "Sort key", cell: (g: any) => keyLabel(t, "RANGE", g.KeySchema) },
          { id: "r", header: "Read capacity", cell: (g: any) => isOnDemand(t) ? "On-demand" : g.ProvisionedThroughput?.ReadCapacityUnits },
          { id: "w", header: "Write capacity", cell: (g: any) => isOnDemand(t) ? "On-demand" : g.ProvisionedThroughput?.WriteCapacityUnits },
          { id: "p", header: "Projected attributes", cell: (g: any) => projLabel(g.Projection) },
          { id: "sz", header: "Size", cell: (g: any) => fmtBytes(g.IndexSizeBytes || 0) },
          { id: "c", header: "Item count", cell: (g: any) => g.ItemCount ?? 0 },
        ]}
      />
      <Table
        header={<Header counter={`(${t.LocalSecondaryIndexes?.length || 0})`} description="Local secondary indexes share the table's partition key and can only be created with the table.">Local secondary indexes</Header>}
        items={t.LocalSecondaryIndexes || []}
        empty={<Box textAlign="center" color="inherit">No local secondary indexes</Box>}
        columnDefinitions={[
          { id: "n", header: "Name", cell: (g: any) => <Link href={exploreHref(t.TableName, g.IndexName)}>{g.IndexName}</Link> },
          { id: "pk", header: "Partition key", cell: (g: any) => keyLabel(t, "HASH", g.KeySchema) },
          { id: "sk", header: "Sort key", cell: (g: any) => keyLabel(t, "RANGE", g.KeySchema) },
          { id: "p", header: "Projected attributes", cell: (g: any) => projLabel(g.Projection) },
          { id: "sz", header: "Size", cell: (g: any) => fmtBytes(g.IndexSizeBytes || 0) },
        ]}
      />
      <ConfirmModal visible={del} onDismiss={() => setDel(false)} header={`Delete index ${sel[0]?.IndexName}`} confirmText="confirm"
        onConfirm={async () => {
          try { await ddb("UpdateTable", { TableName: t.TableName, GlobalSecondaryIndexUpdates: [{ Delete: { IndexName: sel[0].IndexName } }] }); flash.notify({ type: "success", content: `Deleting index ${sel[0].IndexName}.` }); setSel([]); reload(); }
          catch (e) { flash.error(e); }
          setDel(false);
        }}>
        <Box>Queries that use this index will stop working. This can't be undone.</Box>
      </ConfirmModal>
    </SpaceBetween>
  );
}

// ---------------- Monitor ----------------
const RANGES = [{ value: "3", label: "3h" }, { value: "12", label: "12h" }, { value: "24", label: "1d" }, { value: "72", label: "3d" }];
export function MonitorTab({ t }: { t: any }) {
  const flash = useFlash();
  const [hours, setHours] = useState(RANGES[0]);
  const [alarmModal, setAlarmModal] = useState(false);
  const [selA, setSelA] = useState<any[]>([]);
  const metrics = useAsync(async () => {
    const list = (await api.call("cloudwatch", "ListMetrics", { Namespace: "AWS/DynamoDB", Dimensions: [{ Name: "TableName", Value: t.TableName }] })).Metrics || [];
    if (!list.length) return [];
    const end = new Date(), start = new Date(Date.now() - Number(hours.value) * 3600e3);
    const period = Number(hours.value) <= 3 ? 60 : 300;
    const q = list.slice(0, 100).map((m: any, i: number) => ({ Id: `m${i}`, Label: m.MetricName + (m.Dimensions.length > 1 ? ` (${m.Dimensions.filter((d: any) => d.Name !== "TableName").map((d: any) => d.Value).join(",")})` : ""), MetricStat: { Metric: m, Period: period, Stat: /Latency|Provisioned/.test(m.MetricName) ? "Average" : "Sum" } }));
    const r = await api.call("cloudwatch", "GetMetricData", { MetricDataQueries: q, StartTime: start.toISOString(), EndTime: end.toISOString() });
    const byName = new Map<string, any[]>();
    r.MetricDataResults.forEach((res: any, i: number) => {
      const name = list[i].MetricName;
      const series = { title: res.Label, type: "line" as const, data: res.Timestamps.map((ts: string, j: number) => ({ x: new Date(ts), y: res.Values[j] })).sort((a: any, b: any) => +a.x - +b.x) };
      byName.set(name, [...(byName.get(name) || []), series]);
    });
    return [...byName.entries()].map(([name, series]) => ({ name, series }));
  }, [t.TableName, hours.value]);
  const alarms = useAsync(async () => ((await api.call("cloudwatch", "DescribeAlarms")).MetricAlarms || []).filter((a: any) => (a.Dimensions || []).some((d: any) => d.Name === "TableName" && d.Value === t.TableName)), [t.TableName]);
  const ci = useAsync(() => ddb("DescribeContributorInsights", { TableName: t.TableName }), [t.TableName]);
  const ciOn = ci.data?.ContributorInsightsStatus === "ENABLED" || ci.data?.ContributorInsightsStatus === "ENABLING";
  return (
    <SpaceBetween size="l">
      <Container header={<Header variant="h2" description="CloudWatch metrics the emulator records for this table."
        actions={<SpaceBetween direction="horizontal" size="xs"><Select selectedOption={hours} options={RANGES} onChange={e => setHours(e.detail.selectedOption as any)} /><Button iconName="refresh" ariaLabel="Refresh" onClick={() => metrics.reload()} /></SpaceBetween>}>CloudWatch metrics</Header>}>
        {metrics.error ? <ErrorAlert error={metrics.error} /> : metrics.loading && !metrics.data ? <Box>Loading metrics…</Box> : !metrics.data?.length ? <Box color="text-body-secondary">No metrics yet. Read or write some items, then refresh.</Box> : (
          <ColumnLayout columns={2}>
            {metrics.data.map(m => (
              <div key={m.name}>
                <Box variant="h3" padding={{ bottom: "xs" }}>{m.name}</Box>
                <LineChart series={m.series} height={180} hideFilter xScaleType="time" i18nStrings={{ xTickFormatter: (d: any) => new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }}
                  empty={<Box textAlign="center" color="inherit">No data points</Box>} ariaLabel={m.name} />
              </div>
            ))}
          </ColumnLayout>
        )}
      </Container>
      <Table
        header={<Header counter={`(${alarms.data?.length || 0})`} description="CloudWatch alarms on this table's metrics."
          actions={<SpaceBetween direction="horizontal" size="xs">
            <Button disabled={!selA.length} onClick={async () => { try { await api.call("cloudwatch", "DeleteAlarms", { AlarmNames: selA.map(a => a.AlarmName) }); setSelA([]); alarms.reload(); } catch (e) { flash.error(e); } }}>Delete</Button>
            <Button onClick={() => setAlarmModal(true)}>Create alarm</Button>
          </SpaceBetween>}>CloudWatch alarms</Header>}
        items={alarms.data || []} loading={alarms.loading} trackBy="AlarmName" selectionType="multi" selectedItems={selA} onSelectionChange={e => setSelA(e.detail.selectedItems)}
        empty={<Box textAlign="center" color="inherit"><b>No alarms</b></Box>}
        columnDefinitions={[
          { id: "n", header: "Alarm name", cell: (a: any) => a.AlarmName },
          { id: "s", header: "State", cell: (a: any) => <StatusIndicator type={a.StateValue === "ALARM" ? "error" : a.StateValue === "OK" ? "success" : "pending"}>{a.StateValue}</StatusIndicator> },
          { id: "c", header: "Conditions", cell: (a: any) => `${a.MetricName} ${a.ComparisonOperator?.replace(/([A-Z])/g, " $1").toLowerCase()} ${a.Threshold} for ${a.EvaluationPeriods} × ${a.Period}s` },
        ]}
      />
      <Container header={<Header variant="h2" description="See the most accessed and throttled keys in your table or index."
        actions={<Button loading={ci.loading} onClick={async () => { try { await ddb("UpdateContributorInsights", { TableName: t.TableName, ContributorInsightsAction: ciOn ? "DISABLE" : "ENABLE" }); ci.reload(); } catch (e) { flash.error(e); } }}>{ciOn ? "Turn off" : "Turn on"}</Button>}>CloudWatch Contributor Insights for DynamoDB</Header>}>
        <ValueWithLabel label="Status">{ci.data ? ci.data.ContributorInsightsStatus : "-"}</ValueWithLabel>
      </Container>
      <AlarmModal visible={alarmModal} t={t} onDismiss={() => setAlarmModal(false)} onDone={() => alarms.reload()} />
    </SpaceBetween>
  );
}
function AlarmModal({ visible, t, onDismiss, onDone }: any) {
  const flash = useFlash();
  const metrics = ["ConsumedReadCapacityUnits", "ConsumedWriteCapacityUnits", "ThrottledRequests", "ReadThrottleEvents", "WriteThrottleEvents", "SystemErrors", "UserErrors"];
  const [m, setM] = useState({ value: metrics[0], label: metrics[0] });
  const [op, setOp] = useState({ value: "GreaterThanOrEqualToThreshold", label: ">=" });
  const [th, setTh] = useState("80");
  const [period, setPeriod] = useState({ value: "300", label: "5 minutes" });
  const [n, setN] = useState("1");
  const [name, setName] = useState("");
  const go = async () => {
    try {
      await api.call("cloudwatch", "PutMetricAlarm", { AlarmName: name || `${t.TableName}-${m.value}`, Namespace: "AWS/DynamoDB", MetricName: m.value, Dimensions: [{ Name: "TableName", Value: t.TableName }], Statistic: "Sum", Period: Number(period.value), EvaluationPeriods: Number(n), Threshold: Number(th), ComparisonOperator: op.value, TreatMissingData: "notBreaching" });
      flash.notify({ type: "success", content: "Alarm created." }); onDismiss(); onDone();
    } catch (e) { flash.error(e); }
  };
  return (
    <Modal visible={visible} onDismiss={onDismiss} header="Create alarm" footer={<Footer cancel={onDismiss} ok={go} label="Create" />}>
      <SpaceBetween size="m">
        <FormField label="Metric"><Select selectedOption={m} options={metrics.map(x => ({ value: x, label: x }))} onChange={e => setM(e.detail.selectedOption as any)} /></FormField>
        <ColumnLayout columns={2}>
          <FormField label="Condition"><Select selectedOption={op} options={[{ value: "GreaterThanOrEqualToThreshold", label: ">=" }, { value: "GreaterThanThreshold", label: ">" }, { value: "LessThanThreshold", label: "<" }, { value: "LessThanOrEqualToThreshold", label: "<=" }]} onChange={e => setOp(e.detail.selectedOption as any)} /></FormField>
          <FormField label="Threshold"><Input type="number" value={th} onChange={e => setTh(e.detail.value)} /></FormField>
          <FormField label="Period"><Select selectedOption={period} options={[{ value: "60", label: "1 minute" }, { value: "300", label: "5 minutes" }, { value: "3600", label: "1 hour" }]} onChange={e => setPeriod(e.detail.selectedOption as any)} /></FormField>
          <FormField label="Datapoints to alarm"><Input type="number" value={n} onChange={e => setN(e.detail.value)} /></FormField>
        </ColumnLayout>
        <FormField label="Alarm name"><Input value={name} placeholder={`${t.TableName}-${m.value}`} onChange={e => setName(e.detail.value)} /></FormField>
      </SpaceBetween>
    </Modal>
  );
}

// ---------------- Global tables ----------------
const REGIONS = ["us-east-2", "us-west-1", "us-west-2", "eu-west-1", "eu-central-1", "eu-north-1", "ap-southeast-1", "ap-northeast-1", "ap-south-1", "me-south-1", "sa-east-1"];
export function GlobalTab({ t, reload }: { t: any; reload: () => void }) {
  const flash = useFlash();
  const [modal, setModal] = useState(false);
  const [region, setRegion] = useState<any>(null);
  const [sel, setSel] = useState<any[]>([]);
  const [del, setDel] = useState(false);
  const replicas = t.Replicas || [];
  const rows = [{ RegionName: "us-east-1", ReplicaStatus: t.TableStatus, self: true }, ...replicas];
  const add = async () => {
    try { await ddb("UpdateTable", { TableName: t.TableName, ReplicaUpdates: [{ Create: { RegionName: region.value } }] }); flash.notify({ type: "success", content: `Creating replica in ${region.value}.` }); setModal(false); reload(); }
    catch (e) { flash.error(e); }
  };
  return (
    <SpaceBetween size="l">
      <Table
        header={<Header counter={`(${replicas.length})`} description="Global tables replicate your DynamoDB table automatically across your choice of AWS Regions."
          actions={<SpaceBetween direction="horizontal" size="xs">
            <Button disabled={!sel.length || sel[0].self} onClick={() => setDel(true)}>Delete replica</Button>
            <Button variant="primary" onClick={() => setModal(true)}>Create replica</Button>
          </SpaceBetween>}>Replicas</Header>}
        items={rows} trackBy="RegionName" selectionType="single" selectedItems={sel} onSelectionChange={e => setSel(e.detail.selectedItems)} isItemDisabled={r => !!r.self}
        columnDefinitions={[
          { id: "r", header: "Region", cell: (r: any) => <>{r.RegionName}{r.self ? <Box variant="small" display="inline" color="text-body-secondary"> (this table)</Box> : null}</> },
          { id: "s", header: "Replica status", cell: (r: any) => (r.ReplicaStatus === "ACTIVE" ? <StatusIndicator type="success">Active</StatusIndicator> : <StatusIndicator type="in-progress">{r.ReplicaStatus}</StatusIndicator>) },
          { id: "a", header: "ARN", cell: (r: any) => r.ReplicaArn || t.TableArn },
        ]}
      />
      <EmulatorNote>Replicas are tracked by the emulator, which runs a single Region. Items written here don't become readable from another Region's endpoint.</EmulatorNote>
      <Modal visible={modal} onDismiss={() => setModal(false)} header="Create replica" footer={<Footer cancel={() => setModal(false)} ok={add} label="Create replica" disabled={!region} />}>
        <SpaceBetween size="m">
          <Box>Choose the Region where the replica is created. DynamoDB turns on Streams (new and old images) automatically if needed.</Box>
          <FormField label="Available replication Regions"><Select selectedOption={region} placeholder="Choose a Region" options={REGIONS.filter(r => !replicas.some((x: any) => x.RegionName === r)).map(r => ({ value: r, label: r }))} onChange={e => setRegion(e.detail.selectedOption)} /></FormField>
        </SpaceBetween>
      </Modal>
      <ConfirmModal visible={del} onDismiss={() => setDel(false)} header={`Delete replica in ${sel[0]?.RegionName}`} confirmText="delete"
        onConfirm={async () => { try { await ddb("UpdateTable", { TableName: t.TableName, ReplicaUpdates: [{ Delete: { RegionName: sel[0].RegionName } }] }); setSel([]); reload(); } catch (e) { flash.error(e); } setDel(false); }}>
        <Box>The replica table and its data in that Region will be deleted.</Box>
      </ConfirmModal>
    </SpaceBetween>
  );
}

// ---------------- Backups ----------------
export function BackupsTab({ t, pitr }: { t: any; pitr: any }) {
  const flash = useFlash();
  const nav = useNavigate();
  const p = pitr?.PointInTimeRecoveryDescription;
  const on = p?.PointInTimeRecoveryStatus === "ENABLED";
  const backups = useAsync(async () => (await ddb("ListBackups", { TableName: t.TableName })).BackupSummaries || [], [t.TableName]);
  const [sel, setSel] = useState<any[]>([]);
  const [create, setCreate] = useState(false);
  const [name, setName] = useState("");
  const [del, setDel] = useState(false);
  return (
    <SpaceBetween size="l">
      <Container header={<Header variant="h2" description="Point-in-time recovery provides continuous backups of your DynamoDB data for 35 days to help you protect against accidental write or deletes."
        actions={<SpaceBetween direction="horizontal" size="xs"><Button href={editHref(t.TableName, "pitr")}>Edit</Button>{on && <Button onClick={() => nav(`/dynamodb/backups/restore?pitr=${encodeURIComponent(t.TableName)}`)}>Restore to point in time</Button>}</SpaceBetween>}>Point-in-time recovery (PITR)</Header>}>
        <ColumnLayout columns={4} variant="text-grid">
          <ValueWithLabel label="Status">{onOff(on)}</ValueWithLabel>
          {on && <ValueWithLabel label="Recovery period">{p.RecoveryPeriodInDays || 35} days</ValueWithLabel>}
          {on && <ValueWithLabel label="Earliest restore date">{fmtDate(p.EarliestRestorableDateTime)}</ValueWithLabel>}
          {on && <ValueWithLabel label="Latest restore date">{fmtDate(p.LatestRestorableDateTime)}</ValueWithLabel>}
        </ColumnLayout>
      </Container>
      <Table
        header={<Header counter={`(${backups.data?.length || 0})`} description="On-demand backups of this table."
          actions={<SpaceBetween direction="horizontal" size="xs">
            <Button iconName="refresh" ariaLabel="Refresh" onClick={() => backups.reload()} />
            <Button disabled={!sel.length} onClick={() => setDel(true)}>Delete</Button>
            <Button disabled={!sel.length || sel[0].BackupStatus !== "AVAILABLE"} onClick={() => nav(`/dynamodb/backups/restore?arn=${encodeURIComponent(sel[0].BackupArn)}`)}>Restore</Button>
            <Button variant="primary" onClick={() => { setName(`${t.TableName}-${new Date().toISOString().slice(0, 10)}`); setCreate(true); }}>Create backup</Button>
          </SpaceBetween>}>Backups</Header>}
        items={backups.data || []} loading={backups.loading} trackBy="BackupArn" selectionType="single" selectedItems={sel} onSelectionChange={e => setSel(e.detail.selectedItems)}
        empty={<Box textAlign="center" color="inherit"><b>No backups</b></Box>}
        columnDefinitions={[
          { id: "n", header: "Backup name", cell: (b: any) => b.BackupName },
          { id: "s", header: "Status", cell: (b: any) => b.BackupStatus === "AVAILABLE" ? <StatusIndicator type="success">Available</StatusIndicator> : <StatusIndicator type="in-progress">{b.BackupStatus}</StatusIndicator> },
          { id: "c", header: "Creation time", cell: (b: any) => fmtDate(b.BackupCreationDateTime) },
          { id: "sz", header: "Size", cell: (b: any) => fmtBytes(b.BackupSizeBytes || 0) },
          { id: "t", header: "Backup type", cell: (b: any) => b.BackupType },
        ]}
      />
      <Modal visible={create} onDismiss={() => setCreate(false)} header="Create backup" footer={<Footer cancel={() => setCreate(false)} label="Create backup" disabled={!name} ok={async () => {
        try { await ddb("CreateBackup", { TableName: t.TableName, BackupName: name }); flash.notify({ type: "success", content: `Creating backup ${name}.` }); setCreate(false); backups.reload(); } catch (e) { flash.error(e); }
      }} />}>
        <FormField label="Backup name" constraintText="3 to 255 characters: letters, numbers, underscores, hyphens and periods."><Input value={name} onChange={e => setName(e.detail.value)} /></FormField>
      </Modal>
      <ConfirmModal visible={del} onDismiss={() => setDel(false)} header={`Delete backup ${sel[0]?.BackupName}`} confirmText="delete"
        onConfirm={async () => { try { await ddb("DeleteBackup", { BackupArn: sel[0].BackupArn }); setSel([]); backups.reload(); } catch (e) { flash.error(e); } setDel(false); }}>
        <Box>The backup will be permanently deleted.</Box>
      </ConfirmModal>
    </SpaceBetween>
  );
}

// ---------------- Exports and streams ----------------
export function StreamsTab({ t, reload }: { t: any; reload: () => void }) {
  const flash = useFlash();
  const streamOn = !!t.StreamSpecification?.StreamEnabled;
  const exportsQ = useAsync(async () => (await ddb("ListExports", { TableArn: t.TableArn })).ExportSummaries || [], [t.TableArn]);
  const kinesis = useAsync(() => ddb("DescribeKinesisStreamingDestination", { TableName: t.TableName }), [t.TableName]);
  const triggers = useAsync(async () => streamOn && t.LatestStreamArn ? (await api.call("lambda", "ListEventSourceMappings", { EventSourceArn: t.LatestStreamArn })).EventSourceMappings || [] : [], [t.LatestStreamArn, streamOn]);
  const [kModal, setKModal] = useState(false);
  const [trModal, setTrModal] = useState(false);
  const [selT, setSelT] = useState<any[]>([]);
  const kd = (kinesis.data?.KinesisDataStreamDestinations || []).filter((k: any) => k.DestinationStatus !== "DISABLED");
  const turnOffStream = async () => { try { await ddb("UpdateTable", { TableName: t.TableName, StreamSpecification: { StreamEnabled: false } }); flash.notify({ type: "success", content: "DynamoDB stream turned off." }); reload(); } catch (e) { flash.error(e); } };
  return (
    <SpaceBetween size="l">
      <Table
        header={<Header counter={`(${exportsQ.data?.length || 0})`} description="Export table data to an Amazon S3 bucket. Exports need point-in-time recovery."
          actions={<Button variant="primary" href={`#/dynamodb/exports/new?table=${encodeURIComponent(t.TableName)}`}>Export to S3</Button>}>Exports to S3</Header>}
        items={exportsQ.data || []} loading={exportsQ.loading}
        empty={<Box textAlign="center" color="inherit"><b>No exports</b></Box>}
        columnDefinitions={[
          { id: "a", header: "Export ARN", cell: (e: any) => <Link href="#/dynamodb/exports">{String(e.ExportArn).split("/").pop()}</Link> },
          { id: "s", header: "Status", cell: (e: any) => e.ExportStatus === "COMPLETED" ? <StatusIndicator type="success">Completed</StatusIndicator> : e.ExportStatus === "FAILED" ? <StatusIndicator type="error">Failed</StatusIndicator> : <StatusIndicator type="in-progress">In progress</StatusIndicator> },
          { id: "t", header: "Export type", cell: (e: any) => e.ExportType === "INCREMENTAL_EXPORT" ? "Incremental" : "Full" },
        ]}
      />
      <Container header={<Header variant="h2" description="Capture item-level changes in your table, and push the changes to a DynamoDB stream. You then can access the change information through the DynamoDB Streams API."
        actions={streamOn ? <Button onClick={turnOffStream}>Turn off</Button> : <Button href={editHref(t.TableName, "stream")}>Turn on</Button>}>DynamoDB stream details</Header>}>
        <ColumnLayout columns={3} variant="text-grid">
          <ValueWithLabel label="Stream status">{onOff(streamOn)}</ValueWithLabel>
          <ValueWithLabel label="View type">{streamOn ? streamViewLabel(t.StreamSpecification.StreamViewType) : "-"}</ValueWithLabel>
          <ValueWithLabel label="Latest stream ARN">{streamOn && t.LatestStreamArn ? <Copyable text={t.LatestStreamArn} label="stream ARN" /> : "-"}</ValueWithLabel>
        </ColumnLayout>
      </Container>
      {streamOn && (
        <Table
          header={<Header counter={`(${triggers.data?.length || 0})`} description="Lambda functions that run when items in this table change."
            actions={<SpaceBetween direction="horizontal" size="xs">
              <Button disabled={!selT.length} onClick={async () => { try { await api.call("lambda", "DeleteEventSourceMapping", { UUID: selT[0].UUID }); setSelT([]); triggers.reload(); } catch (e) { flash.error(e); } }}>Delete</Button>
              <Button onClick={() => setTrModal(true)}>Create trigger</Button>
            </SpaceBetween>}>Triggers</Header>}
          items={triggers.data || []} loading={triggers.loading} trackBy="UUID" selectionType="single" selectedItems={selT} onSelectionChange={e => setSelT(e.detail.selectedItems)}
          empty={<Box textAlign="center" color="inherit"><b>No triggers</b></Box>}
          columnDefinitions={[
            { id: "f", header: "Function", cell: (m: any) => String(m.FunctionArn).split(":").pop() },
            { id: "s", header: "State", cell: (m: any) => m.State },
            { id: "b", header: "Batch size", cell: (m: any) => m.BatchSize },
            { id: "l", header: "Last result", cell: (m: any) => m.LastProcessingResult || "-" },
          ]}
        />
      )}
      <Container header={<Header variant="h2" description="Replicate item-level changes in your table to a Kinesis data stream."
        actions={kd.length
          ? <Button onClick={async () => { try { await ddb("DisableKinesisStreamingDestination", { TableName: t.TableName, StreamArn: kd[0].StreamArn }); kinesis.reload(); } catch (e) { flash.error(e); } }}>Turn off</Button>
          : <Button onClick={() => setKModal(true)}>Turn on</Button>}>Amazon Kinesis data stream details</Header>}>
        <ColumnLayout columns={2} variant="text-grid">
          <ValueWithLabel label="Status">{kd.length ? <StatusIndicator type={kd[0].DestinationStatus === "ACTIVE" ? "success" : "in-progress"}>{kd[0].DestinationStatus}</StatusIndicator> : onOff(false)}</ValueWithLabel>
          <ValueWithLabel label="Destination stream">{kd.length ? String(kd[0].StreamArn).split("/").pop() : "-"}</ValueWithLabel>
        </ColumnLayout>
      </Container>
      <KinesisModal visible={kModal} t={t} onDismiss={() => setKModal(false)} onDone={() => kinesis.reload()} />
      <TriggerModal visible={trModal} t={t} onDismiss={() => setTrModal(false)} onDone={() => triggers.reload()} />
    </SpaceBetween>
  );
}
function KinesisModal({ visible, t, onDismiss, onDone }: any) {
  const flash = useFlash();
  const streams = useAsync(async () => visible ? ((await api.call("kinesis", "ListStreams")).StreamSummaries || []).map((s: any) => ({ value: s.StreamARN, label: s.StreamName })) : [], [visible]);
  const [s, setS] = useState<any>(null);
  return (
    <Modal visible={visible} onDismiss={onDismiss} header="Turn on streaming to Kinesis Data Streams" footer={<Footer cancel={onDismiss} label="Turn on stream" disabled={!s} ok={async () => {
      try { await ddb("EnableKinesisStreamingDestination", { TableName: t.TableName, StreamArn: s.value }); onDismiss(); onDone(); } catch (e) { flash.error(e); }
    }} />}>
      <FormField label="Destination Kinesis data stream" description={streams.data && !streams.data.length ? "No Kinesis streams yet. Create one in Kinesis Data Streams first." : undefined}>
        <Select selectedOption={s} placeholder="Choose a stream" options={streams.data || []} statusType={streams.loading ? "loading" : "finished"} onChange={e => setS(e.detail.selectedOption)} />
      </FormField>
    </Modal>
  );
}
function TriggerModal({ visible, t, onDismiss, onDone }: any) {
  const flash = useFlash();
  const fns = useAsync(async () => visible ? ((await api.call("lambda", "ListFunctions")).Functions || []).map((f: any) => ({ value: f.FunctionArn, label: f.FunctionName })) : [], [visible]);
  const [f, setF] = useState<any>(null);
  const [batch, setBatch] = useState("100");
  const [pos, setPos] = useState("LATEST");
  return (
    <Modal visible={visible} onDismiss={onDismiss} header="Create a trigger" footer={<Footer cancel={onDismiss} label="Create trigger" disabled={!f} ok={async () => {
      try { await api.call("lambda", "CreateEventSourceMapping", { EventSourceArn: t.LatestStreamArn, FunctionName: f.value, BatchSize: Number(batch), StartingPosition: pos }); onDismiss(); onDone(); } catch (e) { flash.error(e); }
    }} />}>
      <SpaceBetween size="m">
        <FormField label="Lambda function" description={fns.data && !fns.data.length ? "No Lambda functions yet." : undefined}><Select selectedOption={f} placeholder="Choose a function" options={fns.data || []} statusType={fns.loading ? "loading" : "finished"} onChange={e => setF(e.detail.selectedOption)} /></FormField>
        <FormField label="Batch size"><Input type="number" value={batch} onChange={e => setBatch(e.detail.value)} /></FormField>
        <FormField label="Starting position"><RadioGroup value={pos} onChange={e => setPos(e.detail.value)} items={[{ value: "LATEST", label: "Latest" }, { value: "TRIM_HORIZON", label: "Trim horizon" }]} /></FormField>
      </SpaceBetween>
    </Modal>
  );
}

// ---------------- Permissions ----------------
export function PermissionsTab({ t }: { t: any }) {
  const flash = useFlash();
  const pol = useAsync(async () => { try { return (await ddb("GetResourcePolicy", { ResourceArn: t.TableArn })).Policy as string; } catch (e: any) { if (e?.code === "PolicyNotFoundException") return null; throw e; } }, [t.TableArn]);
  const [del, setDel] = useState(false);
  return (
    <Container header={<Header variant="h2" description="Resource-based policies define who can access this table and what they can do. The emulator stores the policy but doesn't evaluate it."
      actions={<SpaceBetween direction="horizontal" size="xs"><Button disabled={!pol.data} onClick={() => setDel(true)}>Delete policy</Button><Button href={editHref(t.TableName, "policy")}>{pol.data ? "Edit" : "Create table policy"}</Button></SpaceBetween>}>Resource-based policy for table</Header>}>
      {pol.error ? <ErrorAlert error={pol.error} /> : <JsonBlock value={pol.data} empty="No resource-based policy is attached to this table." />}
      <ConfirmModal visible={del} onDismiss={() => setDel(false)} header="Delete resource-based policy" confirmText="confirm"
        onConfirm={async () => { try { await ddb("DeleteResourcePolicy", { ResourceArn: t.TableArn }); pol.reload(); } catch (e) { flash.error(e); } setDel(false); }}>
        <Box>The policy will be removed from {t.TableName}.</Box>
      </ConfirmModal>
    </Container>
  );
}

// ---------------- Additional settings ----------------
export function SettingsTab({ t, ttl }: { t: any; ttl: any; reload?: () => void }) {
  const tags = useAsync(async () => (await ddb("ListTagsOfResource", { ResourceArn: t.TableArn })).Tags || [], [t.TableArn]);
  const scaling = useAsync(async () => (await api.call("application-autoscaling", "DescribeScalableTargets", { ServiceNamespace: "dynamodb", ResourceIds: [`table/${t.TableName}`] })).ScalableTargets || [], [t.TableName]);
  const sideScaling = (side: string) => (scaling.data || []).find((s: any) => s.ScalableDimension === `dynamodb:table:${side}CapacityUnits`);
  const ttlOn = ttl?.TimeToLiveStatus === "ENABLED" || ttl?.TimeToLiveStatus === "ENABLING";
  const sse = t.SSEDescription;
  const w = t.WarmThroughput;
  return (
    <SpaceBetween size="l">
      <Container header={<Header variant="h2" description="Capacity mode and throughput settings." actions={<Button href={editHref(t.TableName, "capacity")}>Edit</Button>}>Read/write capacity</Header>}>
        <ColumnLayout columns={3} variant="text-grid">
          <ValueWithLabel label="Capacity mode">{isOnDemand(t) ? "On-demand" : "Provisioned"}</ValueWithLabel>
          {isOnDemand(t) ? <>
            <ValueWithLabel label="Maximum read request units">{t.OnDemandThroughput?.MaxReadRequestUnits > 0 ? t.OnDemandThroughput.MaxReadRequestUnits : "-"}</ValueWithLabel>
            <ValueWithLabel label="Maximum write request units">{t.OnDemandThroughput?.MaxWriteRequestUnits > 0 ? t.OnDemandThroughput.MaxWriteRequestUnits : "-"}</ValueWithLabel>
          </> : <>
            {(["Read", "Write"] as const).map(side => {
              const s = sideScaling(side);
              return <ValueWithLabel key={side} label={`${side} capacity`}>{s ? `Auto scaling: ${s.MinCapacity}–${s.MaxCapacity} units` : `${t.ProvisionedThroughput?.[`${side}CapacityUnits`]} provisioned units (auto scaling off)`}</ValueWithLabel>;
            })}
          </>}
        </ColumnLayout>
      </Container>
      <Container header={<Header variant="h2" description="Pre-warm your table to handle instant peak throughput." actions={<Button href={editHref(t.TableName, "warm")}>Edit</Button>}>Warm throughput</Header>}>
        <ColumnLayout columns={3} variant="text-grid">
          <ValueWithLabel label="Read units per second">{w?.ReadUnitsPerSecond ?? "-"}</ValueWithLabel>
          <ValueWithLabel label="Write units per second">{w?.WriteUnitsPerSecond ?? "-"}</ValueWithLabel>
          <ValueWithLabel label="Status">{w?.Status ?? "-"}</ValueWithLabel>
        </ColumnLayout>
      </Container>
      <Container header={<Header variant="h2" description="Automatically delete expired items from your table." actions={<Button href={editHref(t.TableName, "ttl")}>{ttlOn ? "Turn off" : "Turn on"}</Button>}>Time to Live (TTL)</Header>}>
        <ColumnLayout columns={2} variant="text-grid">
          <ValueWithLabel label="TTL status">{onOff(ttlOn)}</ValueWithLabel>
          <ValueWithLabel label="TTL attribute">{ttl?.AttributeName || "-"}</ValueWithLabel>
        </ColumnLayout>
      </Container>
      <Container header={<Header variant="h2" description="All user data stored in DynamoDB is encrypted at rest." actions={<Button href={editHref(t.TableName, "encryption")}>Manage encryption</Button>}>Encryption</Header>}>
        <ColumnLayout columns={2} variant="text-grid">
          <ValueWithLabel label="Key management">{encryptionLabel(sse)}</ValueWithLabel>
          {sse?.KMSMasterKeyArn && <ValueWithLabel label="KMS key ARN">{sse.KMSMasterKeyArn}</ValueWithLabel>}
        </ColumnLayout>
      </Container>
      <Container header={<Header variant="h2" description="Protects the table from being deleted unintentionally." actions={<Button href={editHref(t.TableName, "deletion-protection")}>{t.DeletionProtectionEnabled ? "Turn off" : "Turn on"}</Button>}>Deletion protection</Header>}>
        <ValueWithLabel label="Deletion protection">{onOff(!!t.DeletionProtectionEnabled)}</ValueWithLabel>
      </Container>
      <Container header={<Header variant="h2" description="The table class determines the storage and throughput costs." actions={<Button href={editHref(t.TableName, "table-class")}>Edit</Button>}>Table class</Header>}>
        <ValueWithLabel label="Table class">{tableClassLabel(t.TableClassSummary?.TableClass)}</ValueWithLabel>
      </Container>
      <Table
        header={<Header counter={`(${tags.data?.length || 0})`} description="Tags are pairs of keys and optional values, that you can assign to AWS resources." actions={<Button href={editHref(t.TableName, "tags")}>Manage tags</Button>}>Tags</Header>}
        items={tags.data || []} loading={tags.loading}
        empty={<Box textAlign="center" color="inherit"><b>No tags</b></Box>}
        columnDefinitions={[{ id: "k", header: "Key", cell: (x: any) => x.Key }, { id: "v", header: "Value", cell: (x: any) => x.Value || "-" }]}
      />
    </SpaceBetween>
  );
}
