import { useEffect, useState } from "react";
import { useCollection } from "@cloudscape-design/collection-hooks";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Table from "@cloudscape-design/components/table";
import Header from "@cloudscape-design/components/header";
import Button from "@cloudscape-design/components/button";
import ButtonDropdown from "@cloudscape-design/components/button-dropdown";
import SpaceBetween from "@cloudscape-design/components/space-between";
import TextFilter from "@cloudscape-design/components/text-filter";
import Pagination from "@cloudscape-design/components/pagination";
import CollectionPreferences from "@cloudscape-design/components/collection-preferences";
import Link from "@cloudscape-design/components/link";
import Box from "@cloudscape-design/components/box";
import { useCrumbs } from "../../App";
import { useAsync, ErrorAlert } from "../../common";
import { rds, rdsAll, crumbs, Status, engineLabel, dbHref, clusterHref } from "./lib";
import { itemsFor, useDbActions, type Row } from "./DbActions";

export async function loadRows(): Promise<Row[]> {
  const [inst, cl, bg] = await Promise.all([
    rdsAll("DescribeDBInstances", "DBInstances"), rdsAll("DescribeDBClusters", "DBClusters"),
    rds("DescribeBlueGreenDeployments").then(r => r.BlueGreenDeployments || []).catch(() => []),
  ]);
  const rows: Row[] = [];
  const bgOf = (a?: string) => bg.find((b: any) => b.Status !== "SWITCHOVER_COMPLETED" && b.Status !== "DELETING" && (b.Source === a || b.Target === a));
  const blueGreenRole = (b: any, a?: string) => b.Source === a ? "Primary" : "Staging";
  for (const b of bg) rows.push({ kind: "bg", id: b.BlueGreenDeploymentIdentifier, role: "Blue/Green Deployment", raw: b });
  for (const c of cl) {
    const b = bgOf(c.DBClusterArn);
    rows.push({ kind: "cluster", id: c.DBClusterIdentifier, parent: b?.BlueGreenDeploymentIdentifier, role: b ? `${blueGreenRole(b, c.DBClusterArn)} cluster` : "Regional cluster", raw: c });
  }
  for (const i of inst) {
    const c = cl.find((x: any) => x.DBClusterIdentifier === i.DBClusterIdentifier);
    const b = !c ? bgOf(i.DBInstanceArn) : undefined;
    let role = "Instance", parent: string | undefined;
    if (c) { role = c.DBClusterMembers?.find((m: any) => m.DBInstanceIdentifier === i.DBInstanceIdentifier)?.IsClusterWriter ? "Writer instance" : "Reader instance"; parent = c.DBClusterIdentifier; }
    else if (b) { role = blueGreenRole(b, i.DBInstanceArn); parent = b.BlueGreenDeploymentIdentifier; }
    else if (i.ReadReplicaSourceDBInstanceIdentifier && inst.some((x: any) => x.DBInstanceIdentifier === i.ReadReplicaSourceDBInstanceIdentifier)) { role = "Replica"; parent = i.ReadReplicaSourceDBInstanceIdentifier; }
    else if (i.ReadReplicaDBInstanceIdentifiers?.length) role = "Primary";
    rows.push({ kind: "instance", id: i.DBInstanceIdentifier, parent, role, raw: i, cluster: c });
  }
  return rows;
}

const statusOf = (r: Row) => r.kind === "instance" ? r.raw.DBInstanceStatus : r.raw.Status;
const BUSY = /ing$|ING$|PROVISIONING/;

export default function Databases() {
  useCrumbs(crumbs({ text: "Databases" }));
  const data = useAsync(loadRows, []);
  const [sel, setSel] = useState<Row[]>([]);
  const [prefs, setPrefs] = useState({ pageSize: 50, visibleContent: ["id", "status", "role", "engine", "region", "size", "actions", "cpu", "activity", "maintenance", "vpc", "multiaz"] });
  const reload = () => data.reload();
  const { run, modal } = useDbActions(reload, () => setSel([]));
  const busy = (data.data || []).some(r => BUSY.test(statusOf(r) || ""));
  useEffect(() => { if (!busy) return; const t = setTimeout(reload, 3000); return () => clearTimeout(t); }, [busy, data.data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (data.data) setSel(s => data.data!.filter(r => s.some(x => x.id === r.id))); }, [data.data]);

  const { items, filterProps, paginationProps, collectionProps, filteredItemsCount } = useCollection(data.data || [], {
    filtering: { filteringFunction: (r, t) => JSON.stringify([r.id, r.role, r.raw.Engine, statusOf(r)]).toLowerCase().includes(t.toLowerCase()) },
    pagination: { pageSize: prefs.pageSize },
    sorting: {},
    expandableRows: { getId: r => r.id, getParentId: r => r.parent || null },
  });
  const href = (r: Row) => r.kind === "cluster" ? clusterHref(r.id) : r.kind === "instance" ? dbHref(r.id) : undefined;
  const r0 = sel[0];
  const modifyHref = r0 && r0.kind !== "bg" ? `${href(r0)}/modify` : undefined;
  const cols = [
    { id: "id", header: "DB identifier", cell: (r: Row) => href(r) ? <Link href={href(r)}>{r.id}</Link> : <b>{r.raw.BlueGreenDeploymentName}</b>, sortingField: "id", isRowHeader: true, width: 240 },
    { id: "status", header: "Status", cell: (r: Row) => <Status s={statusOf(r)} />, width: 140 },
    { id: "role", header: "Role", cell: (r: Row) => r.role, width: 170 },
    { id: "engine", header: "Engine", cell: (r: Row) => r.kind === "bg" ? "-" : engineLabel(r.raw.Engine), width: 170 },
    { id: "region", header: "Region & AZ", cell: (r: Row) => r.kind === "instance" ? r.raw.AvailabilityZone || "us-east-1" : r.kind === "cluster" ? "us-east-1" : "-" },
    { id: "size", header: "Size", cell: (r: Row) => r.kind === "instance" ? r.raw.DBInstanceClass : r.kind === "cluster" ? `${(r.raw.DBClusterMembers || []).length} instance${(r.raw.DBClusterMembers || []).length === 1 ? "" : "s"}` : "-" },
    { id: "actions", header: "Recommendations", cell: () => "-" },
    { id: "cpu", header: "CPU", cell: () => "-" },
    { id: "activity", header: "Current activity", cell: (r: Row) => r.kind === "bg" ? "-" : "0 Connections" },
    { id: "maintenance", header: "Maintenance", cell: (r: Row) => r.raw.PendingModifiedValues && Object.keys(r.raw.PendingModifiedValues).length ? "pending" : "none" },
    { id: "vpc", header: "VPC", cell: (r: Row) => r.kind === "instance" ? r.raw.DBSubnetGroup?.VpcId || "-" : "-" },
    { id: "multiaz", header: "Multi-AZ", cell: (r: Row) => r.kind === "instance" ? (r.raw.DBClusterIdentifier ? "-" : r.raw.MultiAZ ? "Yes" : "No") : r.kind === "cluster" ? ((r.raw.DBClusterMembers || []).length > 1 ? "Yes" : "No") : "-" },
    { id: "endpoint", header: "Endpoint", cell: (r: Row) => r.kind === "instance" && r.raw.Endpoint ? `${r.raw.Endpoint.Address}:${r.raw.Endpoint.Port}` : r.kind === "cluster" ? `${r.raw.Endpoint}:${r.raw.Port}` : "-" },
    { id: "version", header: "Engine version", cell: (r: Row) => r.raw.EngineVersion || "-" },
  ];
  return (
    <ContentLayout>
      <SpaceBetween size="l">
        {data.error ? <ErrorAlert error={data.error} /> : null}
        <Table {...collectionProps} variant="full-page" stickyHeader resizableColumns items={items} trackBy="id"
          loading={data.loading && !data.data} loadingText="Loading databases"
          selectionType="single" selectedItems={sel} onSelectionChange={e => setSel(e.detail.selectedItems)}
          columnDefinitions={cols} columnDisplay={cols.map(c => ({ id: c.id, visible: prefs.visibleContent.includes(c.id) }))}
          header={<Header variant="awsui-h1-sticky" counter={data.data ? `(${data.data.filter(r => r.kind !== "bg").length})` : undefined}
            actions={<SpaceBetween direction="horizontal" size="xs">
              <Button iconName="refresh" ariaLabel="Refresh" loading={data.loading && !!data.data} onClick={reload} />
              <Button disabled={!r0 || r0.kind === "bg"} href={modifyHref}>Modify</Button>
              <ButtonDropdown items={itemsFor(r0)} disabled={!r0} onItemClick={e => r0 && run(e.detail.id, r0)}>Actions</ButtonDropdown>
              <Button href="#/rds/snapshots">Restore from S3</Button>
              <Button variant="primary" href="#/rds/databases/create">Create database</Button>
            </SpaceBetween>}>Databases</Header>}
          filter={<TextFilter {...filterProps} filteringPlaceholder="Filter by databases" countText={`${filteredItemsCount} match${filteredItemsCount === 1 ? "" : "es"}`} />}
          pagination={<Pagination {...paginationProps} />}
          preferences={<CollectionPreferences title="Preferences" confirmLabel="Confirm" cancelLabel="Cancel" preferences={prefs} onConfirm={e => setPrefs(e.detail as any)}
            pageSizePreference={{ title: "Page size", options: [10, 25, 50, 100].map(n => ({ value: n, label: `${n} databases` })) }}
            visibleContentPreference={{ title: "Select visible columns", options: [{ label: "Columns", options: cols.map(c => ({ id: c.id, label: c.header })) }] }} />}
          empty={<Box textAlign="center" color="inherit"><b>No databases</b><Box variant="p" color="inherit">You don't have any databases in this Region.</Box><Button href="#/rds/databases/create">Create database</Button></Box>}
        />
      </SpaceBetween>
      {modal}
    </ContentLayout>
  );
}
