import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Tabs from "@cloudscape-design/components/tabs";
import Container from "@cloudscape-design/components/container";
import SpaceBetween from "@cloudscape-design/components/space-between";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Button from "@cloudscape-design/components/button";
import ButtonDropdown from "@cloudscape-design/components/button-dropdown";
import Box from "@cloudscape-design/components/box";
import Spinner from "@cloudscape-design/components/spinner";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import { useCrumbs } from "../../App";
import { Copyable, ErrorAlert, fmtBytes, fmtDate, useAsync, ValueWithLabel } from "../../common";
import { ddb, keyLabel, capacityMode, isOnDemand, exploreHref, tableClassLabel } from "./lib";
import { tableStatus } from "./TablesList";
import DeleteTableModal from "./DeleteTableModal";
import { IndexesTab, MonitorTab, GlobalTab, BackupsTab, StreamsTab, PermissionsTab, SettingsTab } from "./TableTabs";

export function useTable(table: string) {
  const d = useAsync(async () => {
    const [t, pitr, ttl] = await Promise.all([
      ddb("DescribeTable", { TableName: table }).then((r: any) => r.Table),
      ddb("DescribeContinuousBackups", { TableName: table }).then((r: any) => r.ContinuousBackupsDescription).catch(() => null),
      ddb("DescribeTimeToLive", { TableName: table }).then((r: any) => r.TimeToLiveDescription).catch(() => null),
    ]);
    return { t, pitr, ttl };
  }, [table]);
  // Keep polling while the table or an index is changing.
  const changing = d.data && (d.data.t.TableStatus !== "ACTIVE" || (d.data.t.GlobalSecondaryIndexes || []).some((g: any) => g.IndexStatus !== "ACTIVE") || (d.data.t.Replicas || []).some((r: any) => r.ReplicaStatus !== "ACTIVE"));
  useEffect(() => { if (!changing) return; const x = setTimeout(() => d.reload(), 2500); return () => clearTimeout(x); }, [changing, d.data]); // eslint-disable-line react-hooks/exhaustive-deps
  return d;
}

export default function TableDetail() {
  const { table = "" } = useParams();
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const tab = sp.get("tab") || "overview";
  useCrumbs([{ text: "DynamoDB", href: "#/dynamodb/dashboard" }, { text: "Tables", href: "#/dynamodb/tables" }, { text: table, href: "#" }]);
  const d = useTable(table);
  const [del, setDel] = useState(false);
  const [count, setCount] = useState<{ n?: number; at?: Date; busy?: boolean; err?: unknown }>({});

  if (d.loading && !d.data) return <Box textAlign="center" padding="xl"><Spinner size="large" /></Box>;
  if (d.error) return <ErrorAlert error={d.error} />;
  const { t, pitr, ttl } = d.data!;
  const pitrOn = pitr?.PointInTimeRecoveryDescription?.PointInTimeRecoveryStatus === "ENABLED";

  const liveCount = async () => {
    setCount({ busy: true });
    try {
      let n = 0, start: any;
      do { const r: any = await ddb("Scan", { TableName: table, Select: "COUNT", ExclusiveStartKey: start }); n += r.Count; start = r.LastEvaluatedKey; } while (start);
      setCount({ n, at: new Date() });
    } catch (e) { setCount({ err: e }); }
  };

  const overview = (
    <SpaceBetween size="l">
      <Container header={<Header variant="h2">General information</Header>}>
        <ColumnLayout columns={4} variant="text-grid">
          <ValueWithLabel label="Partition key">{keyLabel(t, "HASH")}</ValueWithLabel>
          <ValueWithLabel label="Sort key">{keyLabel(t, "RANGE")}</ValueWithLabel>
          <ValueWithLabel label="Capacity mode">{capacityMode(t)}</ValueWithLabel>
          <ValueWithLabel label="Table status">{tableStatus(t.TableStatus)}</ValueWithLabel>
          <ValueWithLabel label="Point-in-time recovery (PITR)">{pitrOn ? <StatusIndicator type="success">On</StatusIndicator> : <StatusIndicator type="stopped">Off</StatusIndicator>}</ValueWithLabel>
          <ValueWithLabel label="Time to Live (TTL)">{ttl?.TimeToLiveStatus === "ENABLED" ? `On (${ttl.AttributeName})` : "Off"}</ValueWithLabel>
          <ValueWithLabel label="Table class">{tableClassLabel(t.TableClassSummary?.TableClass)}</ValueWithLabel>
          <ValueWithLabel label="Deletion protection">{t.DeletionProtectionEnabled ? <StatusIndicator type="success">On</StatusIndicator> : <StatusIndicator type="stopped">Off</StatusIndicator>}</ValueWithLabel>
          <ValueWithLabel label="Creation date">{fmtDate(t.CreationDateTime)}</ValueWithLabel>
          <ValueWithLabel label="Amazon Resource Name (ARN)"><Copyable text={t.TableArn} label="ARN" /></ValueWithLabel>
          {!isOnDemand(t) && <ValueWithLabel label="Provisioned read / write capacity">{t.ProvisionedThroughput?.ReadCapacityUnits} / {t.ProvisionedThroughput?.WriteCapacityUnits}</ValueWithLabel>}
          {t.LatestStreamArn && t.StreamSpecification?.StreamEnabled && <ValueWithLabel label="DynamoDB stream">On</ValueWithLabel>}
        </ColumnLayout>
      </Container>
      <Container header={<Header variant="h2" description="DynamoDB updates the following information approximately every six hours."
        actions={<Button loading={count.busy} onClick={liveCount}>Get live item count</Button>}>Items summary</Header>}>
        <ColumnLayout columns={4} variant="text-grid">
          <ValueWithLabel label="Item count">{t.ItemCount ?? 0}</ValueWithLabel>
          <ValueWithLabel label="Table size">{fmtBytes(t.TableSizeBytes || 0)}</ValueWithLabel>
          <ValueWithLabel label="Average item size">{t.ItemCount ? fmtBytes(Math.round((t.TableSizeBytes || 0) / t.ItemCount)) : "0 B"}</ValueWithLabel>
          <ValueWithLabel label="Live item count">{count.n !== undefined ? <>{count.n}<Box variant="small" display="block" color="text-body-secondary">Counted {count.at?.toLocaleTimeString()}</Box></> : count.err ? <ErrorAlert error={count.err} /> : "-"}</ValueWithLabel>
        </ColumnLayout>
      </Container>
    </SpaceBetween>
  );

  return (
    <ContentLayout header={
      <Header variant="h1"
        actions={<SpaceBetween direction="horizontal" size="xs">
          <Button iconName="refresh" ariaLabel="Refresh" onClick={() => d.reload()} />
          <ButtonDropdown onItemClick={e => {
            const id = e.detail.id;
            if (id === "delete") setDel(true);
            else if (id === "index") nav(`/dynamodb/tables/${encodeURIComponent(table)}/create-index`);
            else setSp({ tab: id });
          }} items={[
            { id: "index", text: "Create index" }, { id: "global", text: "Create replica" }, { id: "backups", text: "Create backup" },
            { id: "settings", text: "Update settings" }, { id: "delete", text: "Delete table" },
          ]}>Actions</ButtonDropdown>
          <Button variant="primary" href={exploreHref(table)}>Explore table items</Button>
        </SpaceBetween>}>{table}</Header>
    }>
      <Tabs activeTabId={tab} onChange={e => setSp({ tab: e.detail.activeTabId })} tabs={[
        { id: "overview", label: "Overview", content: overview },
        { id: "indexes", label: "Indexes", content: <IndexesTab t={t} reload={d.reload} /> },
        { id: "monitor", label: "Monitor", content: <MonitorTab t={t} /> },
        { id: "global", label: "Global tables", content: <GlobalTab t={t} reload={d.reload} /> },
        { id: "backups", label: "Backups", content: <BackupsTab t={t} pitr={pitr} /> },
        { id: "streams", label: "Exports and streams", content: <StreamsTab t={t} reload={d.reload} /> },
        { id: "permissions", label: "Permissions", content: <PermissionsTab t={t} /> },
        { id: "settings", label: "Additional settings", content: <SettingsTab t={t} ttl={ttl} reload={d.reload} /> },
      ]} />
      <DeleteTableModal visible={del} tables={[t]} onDismiss={() => setDel(false)} onDone={ok => { if (ok) nav("/dynamodb/tables"); else d.reload(); }} />
    </ContentLayout>
  );
}
