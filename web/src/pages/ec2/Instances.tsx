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
import CollectionPreferences from "@cloudscape-design/components/collection-preferences";
import Box from "@cloudscape-design/components/box";
import Link from "@cloudscape-design/components/link";
import Container from "@cloudscape-design/components/container";
import Tabs from "@cloudscape-design/components/tabs";
import ContentLayout from "@cloudscape-design/components/content-layout";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import { useCrumbs } from "../../App";
import { ErrorAlert, useAsync } from "../../common";
import { allInstances, ec2, nameOf, State, fmt, instHref, sgHref } from "./lib";
import { useModal } from "./ResourcePage";
import { InstanceModals, STATE_ITEMS, ACTION_ITEMS } from "./InstanceActions";
import { DetailsTab, SecurityTab, NetworkingTab, StorageTab, TagsTab, StatusTab, MonitoringTab } from "./InstanceDetail";

export const statusChecks = (st?: any) => {
  if (!st) return <>-</>;
  const a = st.SystemStatus?.Status, b = st.InstanceStatus?.Status;
  if (a === "ok" && b === "ok") return <StatusIndicator type="success">2/2 checks passed</StatusIndicator>;
  if (a === "initializing" || b === "initializing") return <StatusIndicator type="pending">Initializing</StatusIndicator>;
  if (!a || a === "not-applicable") return <>-</>;
  return <StatusIndicator type="warning">{[a, b].filter(x => x === "ok").length}/2 checks passed</StatusIndicator>;
};

const COLS = ["name", "id", "state", "type", "checks", "az", "pubdns", "pubip", "privip", "monitoring", "sg", "key", "launch", "platform"];

export default function Instances() {
  const nav = useNavigate();
  useCrumbs([{ text: "EC2", href: "#/ec2/dashboard" }, { text: "Instances", href: "#" }]);
  const data = useAsync(async () => {
    const [list, st] = await Promise.all([allInstances(), ec2("DescribeInstanceStatus", { IncludeAllInstances: true }).then((r: any) => r.InstanceStatuses || []).catch(() => [])]);
    const byId = new Map(st.map((s: any) => [s.InstanceId, s]));
    return list.map(i => ({ ...i, _status: byId.get(i.InstanceId) }));
  }, []);
  const [sel, setSel] = useState<any[]>([]);
  const [prefs, setPrefs] = useState({ pageSize: 25, visibleContent: COLS.filter(c => !["privip", "launch", "platform"].includes(c)) });
  const m = useModal();
  const busy = (data.data || []).some(i => ["pending", "stopping", "shutting-down"].includes(i.State?.Name));
  useEffect(() => { if (!busy) return; const t = setTimeout(() => data.reload(), 2500); return () => clearTimeout(t); }, [busy, data.data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (data.data) setSel(s => data.data!.filter(r => s.some(x => x.InstanceId === r.InstanceId))); }, [data.data]);
  const { items, filterProps, paginationProps, collectionProps, filteredItemsCount } = useCollection(data.data || [], {
    filtering: { filteringFunction: (i, t) => [i.InstanceId, nameOf(i), i.InstanceType, i.State?.Name, i.PrivateIpAddress, i.PublicIpAddress, i.Placement?.AvailabilityZone, i.KeyName, ...(i.Tags || []).map((x: any) => `${x.Key}=${x.Value}`)].join(" ").toLowerCase().includes(t.toLowerCase()) },
    pagination: { pageSize: prefs.pageSize }, sorting: {},
  });
  const defs = [
    { id: "name", header: "Name", sortingField: "Name", cell: (i: any) => nameOf(i) || "-" },
    { id: "id", header: "Instance ID", isRowHeader: true, cell: (i: any) => <Link href={instHref(i.InstanceId)}>{i.InstanceId}</Link> },
    { id: "state", header: "Instance state", cell: (i: any) => <State s={i.State?.Name} /> },
    { id: "type", header: "Instance type", sortingField: "InstanceType", cell: (i: any) => i.InstanceType },
    { id: "checks", header: "Status check", cell: (i: any) => i.State?.Name === "running" ? statusChecks(i._status) : "-" },
    { id: "az", header: "Availability Zone", cell: (i: any) => i.Placement?.AvailabilityZone },
    { id: "pubdns", header: "Public IPv4 DNS", cell: (i: any) => i.PublicDnsName || "-" },
    { id: "pubip", header: "Public IPv4 address", cell: (i: any) => i.PublicIpAddress || "-" },
    { id: "privip", header: "Private IP address", cell: (i: any) => i.PrivateIpAddress || "-" },
    { id: "monitoring", header: "Monitoring", cell: (i: any) => i.Monitoring?.State },
    { id: "sg", header: "Security group name", cell: (i: any) => (i.SecurityGroups || []).map((g: any, k: number) => <span key={g.GroupId}>{k ? ", " : ""}<Link href={sgHref(g.GroupId)}>{g.GroupName}</Link></span>) },
    { id: "key", header: "Key name", cell: (i: any) => i.KeyName || "-" },
    { id: "launch", header: "Launch time", sortingField: "LaunchTime", cell: (i: any) => fmt(i.LaunchTime) },
    { id: "platform", header: "Platform details", cell: (i: any) => i.PlatformDetails || "-" },
  ];
  const one = sel.length === 1 ? sel[0] : null;
  return (
    <ContentLayout>
      <SpaceBetween size="l">
        {data.error ? <ErrorAlert error={data.error} /> : null}
        <Table
          {...collectionProps} variant="full-page" stickyHeader resizableColumns
          items={items} loading={data.loading && !data.data} loadingText="Loading instances"
          trackBy="InstanceId" selectionType="multi" selectedItems={sel} onSelectionChange={e => setSel(e.detail.selectedItems)}
          columnDefinitions={defs} columnDisplay={COLS.map(id => ({ id, visible: prefs.visibleContent.includes(id) }))}
          header={
            <Header variant="awsui-h1-sticky" counter={data.data ? (sel.length ? `(${sel.length}/${data.data.length})` : `(${data.data.length})`) : undefined}
              actions={<SpaceBetween direction="horizontal" size="xs">
                <Button iconName="refresh" ariaLabel="Refresh" loading={data.loading && !!data.data} onClick={() => data.reload()} />
                <Button disabled={!one} onClick={() => m.open("connect", sel)}>Connect</Button>
                <ButtonDropdown items={STATE_ITEMS(sel)} onItemClick={e => m.open(e.detail.id, sel)}>Instance state</ButtonDropdown>
                <ButtonDropdown items={ACTION_ITEMS(sel)} onItemClick={e => m.open(e.detail.id, sel)}>Actions</ButtonDropdown>
                <Button variant="primary" onClick={() => nav("/ec2/launch")}>Launch instances</Button>
              </SpaceBetween>}>Instances</Header>
          }
          filter={<TextFilter {...filterProps} filteringPlaceholder="Find Instance by attribute or tag (case-sensitive)" countText={`${filteredItemsCount} matches`} />}
          pagination={<Pagination {...paginationProps} />}
          preferences={<CollectionPreferences title="Preferences" confirmLabel="Confirm" cancelLabel="Cancel" preferences={prefs} onConfirm={e => setPrefs(e.detail as any)}
            pageSizePreference={{ title: "Page size", options: [10, 25, 50].map(n => ({ value: n, label: `${n} instances` })) }}
            visibleContentPreference={{ title: "Attribute columns", options: [{ label: "Instance attributes", options: defs.map(d => ({ id: d.id, label: d.header })) }] }} />}
          empty={<Box textAlign="center" color="inherit"><b>No instances</b><Box variant="p" color="inherit">You do not have any instances in this region</Box><Button onClick={() => nav("/ec2/launch")}>Launch instances</Button></Box>}
        />
        {one ? (
          <Container header={<Header variant="h2">Instance: {one.InstanceId}{nameOf(one) ? ` (${nameOf(one)})` : ""}</Header>}>
            <Tabs tabs={[
              { id: "details", label: "Details", content: <DetailsTab i={one} /> },
              { id: "status", label: "Status and alarms", content: <StatusTab i={one} /> },
              { id: "monitoring", label: "Monitoring", content: <MonitoringTab i={one} /> },
              { id: "security", label: "Security", content: <SecurityTab i={one} /> },
              { id: "networking", label: "Networking", content: <NetworkingTab i={one} /> },
              { id: "storage", label: "Storage", content: <StorageTab i={one} /> },
              { id: "tags", label: "Tags", content: <TagsTab i={one} onManage={() => m.open("tags", [one])} /> },
            ]} />
          </Container>
        ) : sel.length > 1 ? <Container><Box color="text-body-secondary">{sel.length} instances selected. Select one to see details.</Box></Container> : null}
      </SpaceBetween>
      <InstanceModals m={m} reload={() => data.reload()} />
    </ContentLayout>
  );
}
