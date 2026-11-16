import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCollection } from "@cloudscape-design/collection-hooks";
import Table from "@cloudscape-design/components/table";
import Header from "@cloudscape-design/components/header";
import Button from "@cloudscape-design/components/button";
import ButtonDropdown from "@cloudscape-design/components/button-dropdown";
import SpaceBetween from "@cloudscape-design/components/space-between";
import TextFilter from "@cloudscape-design/components/text-filter";
import Pagination from "@cloudscape-design/components/pagination";
import Link from "@cloudscape-design/components/link";
import Box from "@cloudscape-design/components/box";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import CollectionPreferences from "@cloudscape-design/components/collection-preferences";
import { useCrumbs } from "../../App";
import { ErrorAlert, fmtBytes, useAsync } from "../../common";
import { describeAll, keyLabel, isOnDemand, tableHref, tableClassLabel, exploreHref } from "./lib";
import DeleteTableModal from "./DeleteTableModal";

export const tableStatus = (s: string) =>
  s === "ACTIVE" ? <StatusIndicator type="success">Active</StatusIndicator>
    : s === "DELETING" ? <StatusIndicator type="pending">Deleting</StatusIndicator>
      : <StatusIndicator type="in-progress">{s.charAt(0) + s.slice(1).toLowerCase()}</StatusIndicator>;

const COLS = ["name", "status", "pk", "sk", "indexes", "replication", "protection", "read", "write", "size", "class", "items"];

export default function TablesList() {
  const nav = useNavigate();
  useCrumbs([{ text: "DynamoDB", href: "#/dynamodb/dashboard" }, { text: "Tables", href: "#" }]);
  const data = useAsync(describeAll, []);
  const [selected, setSelected] = useState<any[]>([]);
  const [del, setDel] = useState(false);
  const [prefs, setPrefs] = useState<{ pageSize: number; visibleContent: string[] }>({ pageSize: 20, visibleContent: COLS.filter(c => c !== "items") });
  const { items, filterProps, paginationProps, collectionProps, filteredItemsCount } = useCollection(data.data || [], {
    filtering: { filteringFunction: (t, text) => t.TableName.toLowerCase().includes(text.toLowerCase()), empty: "No tables", noMatch: "No matches" },
    pagination: { pageSize: prefs.pageSize },
    sorting: { defaultState: { sortingColumn: { sortingField: "TableName" } } },
  });
  const one = selected.length === 1 ? selected[0] : null;
  const busy = (data.data || []).some(t => t.TableStatus !== "ACTIVE");
  useEffect(() => { if (!busy) return; const t = setTimeout(() => data.reload(), 2500); return () => clearTimeout(t); }, [busy, data.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const defs = [
    { id: "name", header: "Name", sortingField: "TableName", isRowHeader: true, cell: (t: any) => <Link href={tableHref(t.TableName)}>{t.TableName}</Link> },
    { id: "status", header: "Status", cell: (t: any) => tableStatus(t.TableStatus) },
    { id: "pk", header: "Partition key", cell: (t: any) => keyLabel(t, "HASH") },
    { id: "sk", header: "Sort key", cell: (t: any) => keyLabel(t, "RANGE") },
    { id: "indexes", header: "Indexes", cell: (t: any) => (t.GlobalSecondaryIndexes?.length || 0) + (t.LocalSecondaryIndexes?.length || 0) },
    { id: "replication", header: "Replication Regions", cell: (t: any) => t.Replicas?.length || 0 },
    { id: "protection", header: "Deletion protection", cell: (t: any) => t.DeletionProtectionEnabled ? <StatusIndicator type="success">On</StatusIndicator> : <StatusIndicator type="stopped">Off</StatusIndicator> },
    { id: "read", header: "Read capacity mode", cell: (t: any) => isOnDemand(t) ? "On-demand" : `Provisioned (${t.ProvisionedThroughput?.ReadCapacityUnits})` },
    { id: "write", header: "Write capacity mode", cell: (t: any) => isOnDemand(t) ? "On-demand" : `Provisioned (${t.ProvisionedThroughput?.WriteCapacityUnits})` },
    { id: "size", header: "Total size", sortingField: "TableSizeBytes", cell: (t: any) => fmtBytes(t.TableSizeBytes || 0) },
    { id: "class", header: "Table class", cell: (t: any) => tableClassLabel(t.TableClassSummary?.TableClass) },
    { id: "items", header: "Item count", sortingField: "ItemCount", cell: (t: any) => t.ItemCount ?? 0 },
  ];

  return (
    <SpaceBetween size="l">
      {data.error ? <ErrorAlert error={data.error} /> : null}
      <Table
        {...collectionProps}
        variant="full-page"
        stickyHeader
        loading={data.loading && !data.data}
        loadingText="Loading tables"
        items={items}
        trackBy="TableName"
        selectionType="multi"
        selectedItems={selected}
        onSelectionChange={e => setSelected(e.detail.selectedItems)}
        columnDefinitions={defs}
        columnDisplay={COLS.map(id => ({ id, visible: prefs.visibleContent.includes(id) }))}
        header={
          <Header variant="awsui-h1-sticky" counter={data.data ? `(${data.data.length})` : undefined}
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button iconName="refresh" ariaLabel="Refresh" onClick={() => data.reload()} />
                <ButtonDropdown disabled={!one} onItemClick={e => {
                  if (e.detail.id === "explore") nav(exploreHref(one.TableName).slice(1));
                  else nav(`/dynamodb/tables/${encodeURIComponent(one.TableName)}${e.detail.id === "settings" ? "?tab=settings" : e.detail.id === "index" ? "/create-index" : e.detail.id === "replica" ? "?tab=global" : e.detail.id === "backup" ? "?tab=backups" : ""}`);
                }} items={[
                  { id: "explore", text: "Explore items" },
                  { id: "settings", text: "Update settings" },
                  { id: "index", text: "Create index" },
                  { id: "replica", text: "Create replica" },
                  { id: "backup", text: "Create backup" },
                ]}>Actions</ButtonDropdown>
                <Button disabled={!selected.length} onClick={() => setDel(true)}>Delete</Button>
                <Button variant="primary" onClick={() => nav("/dynamodb/create-table")}>Create table</Button>
              </SpaceBetween>
            }
          >Tables</Header>
        }
        filter={<TextFilter {...filterProps} filteringPlaceholder="Find tables by table name" countText={`${filteredItemsCount} matches`} />}
        pagination={<Pagination {...paginationProps} />}
        preferences={
          <CollectionPreferences
            title="Preferences" confirmLabel="Confirm" cancelLabel="Cancel"
            preferences={prefs}
            onConfirm={e => setPrefs(e.detail as any)}
            pageSizePreference={{ title: "Page size", options: [{ value: 10, label: "10 tables" }, { value: 20, label: "20 tables" }, { value: 50, label: "50 tables" }] }}
            visibleContentPreference={{ title: "Select visible columns", options: [{ label: "Table properties", options: defs.map(d => ({ id: d.id, label: d.header, editable: d.id !== "name" })) }] }}
          />
        }
        empty={
          <Box textAlign="center" color="inherit">
            <b>No tables</b>
            <Box variant="p" color="inherit">You have not created any tables.</Box>
            <Button onClick={() => nav("/dynamodb/create-table")}>Create table</Button>
          </Box>
        }
      />
      <DeleteTableModal visible={del} tables={selected} onDismiss={() => setDel(false)} onDone={() => { setSelected([]); data.reload(); }} />
    </SpaceBetween>
  );
}
