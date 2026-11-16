import { Fragment, type ReactElement } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { SideNavigationProps } from "@cloudscape-design/components/side-navigation";
import Badge from "@cloudscape-design/components/badge";
import Dashboard from "./Dashboard";
import Databases from "./Databases";
import CreateDatabase from "./CreateDatabase";
import { InstanceDetail, ClusterDetail } from "./DatabaseDetail";
import { ModifyInstance, ModifyCluster } from "./Modify";
import { CreateReplica, AddReader } from "./Replica";
import { Snapshots, TakeSnapshot, RestoreSnapshot, SnapshotDetail, Exports } from "./Snapshots";
import { SubnetGroups, EditSubnetGroup, SubnetGroupDetail } from "./SubnetGroups";
import { ParameterGroups, CreateParameterGroup, ParameterGroupDetail, OptionGroups, CreateOptionGroup, OptionGroupDetail } from "./ParameterGroups";
import { Proxies, CreateProxy, ProxyDetail } from "./Proxies";
import { Events, EventSubscriptions, CreateEventSubscription, Recommendations, Certificates, ZeroEtl, Unsupported } from "./Misc";

const na = <Badge color="grey">n/a</Badge>;
const L = (text: string, path: string, info?: any): SideNavigationProps.Item => ({ type: "link", text, href: `#/rds/${path}`, info });
export const RDS_NAV: { header: SideNavigationProps.Header; items: SideNavigationProps.Item[] } = {
  header: { text: "Aurora and RDS", href: "#/rds/dashboard" },
  items: [
    L("Dashboard", "dashboard"),
    L("Databases", "databases"),
    L("Query editor", "unsupported/query-editor", na),
    L("Performance insights", "unsupported/performance-insights", na),
    L("Snapshots", "snapshots"),
    L("Exports in Amazon S3", "exports"),
    L("Automated backups", "unsupported/automated-backups", na),
    L("Reserved instances", "unsupported/reserved-instances", na),
    L("Proxies", "proxies"),
    { type: "divider" },
    L("Subnet groups", "subnet-groups"),
    L("Parameter groups", "parameter-groups"),
    L("Option groups", "option-groups"),
    L("Custom engine versions", "unsupported/custom-engine-versions", na),
    L("Zero-ETL integrations", "zero-etl"),
    { type: "divider" },
    L("Events", "events"),
    L("Event subscriptions", "event-subscriptions"),
    { type: "divider" },
    L("Recommendations", "recommendations"),
    L("Certificate update", "certificate-update"),
    { type: "divider" },
    { type: "link", text: "Console home", href: "#/" },
  ],
};

function Fresh({ children }: { children: ReactElement }) {
  const loc = useLocation();
  return <Fragment key={loc.pathname + loc.search}>{children}</Fragment>;
}

export default function RdsRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="dashboard" replace />} />
      <Route path="dashboard" element={<Dashboard />} />
      <Route path="databases" element={<Databases />} />
      <Route path="databases/create" element={<Fresh><CreateDatabase /></Fresh>} />
      <Route path="databases/instance/:id" element={<Fresh><InstanceDetail /></Fresh>} />
      <Route path="databases/instance/:id/modify" element={<Fresh><ModifyInstance /></Fresh>} />
      <Route path="databases/instance/:id/replica" element={<Fresh><CreateReplica /></Fresh>} />
      <Route path="databases/cluster/:id" element={<Fresh><ClusterDetail /></Fresh>} />
      <Route path="databases/cluster/:id/modify" element={<Fresh><ModifyCluster /></Fresh>} />
      <Route path="databases/cluster/:id/add-reader" element={<Fresh><AddReader /></Fresh>} />
      <Route path="snapshots" element={<Snapshots />} />
      <Route path="snapshots/take" element={<Fresh><TakeSnapshot /></Fresh>} />
      <Route path="snapshots/:kind/:id" element={<Fresh><SnapshotDetail /></Fresh>} />
      <Route path="snapshots/:kind/:id/restore" element={<Fresh><RestoreSnapshot /></Fresh>} />
      <Route path="exports" element={<Exports />} />
      <Route path="proxies" element={<Proxies />} />
      <Route path="proxies/create" element={<Fresh><CreateProxy /></Fresh>} />
      <Route path="proxies/:name" element={<Fresh><ProxyDetail /></Fresh>} />
      <Route path="subnet-groups" element={<SubnetGroups />} />
      <Route path="subnet-groups/create" element={<Fresh><EditSubnetGroup /></Fresh>} />
      <Route path="subnet-groups/:name" element={<Fresh><SubnetGroupDetail /></Fresh>} />
      <Route path="subnet-groups/:name/edit" element={<Fresh><EditSubnetGroup /></Fresh>} />
      <Route path="parameter-groups" element={<ParameterGroups />} />
      <Route path="parameter-groups/create" element={<Fresh><CreateParameterGroup /></Fresh>} />
      <Route path="parameter-groups/:kind/:name" element={<Fresh><ParameterGroupDetail /></Fresh>} />
      <Route path="option-groups" element={<OptionGroups />} />
      <Route path="option-groups/create" element={<Fresh><CreateOptionGroup /></Fresh>} />
      <Route path="option-groups/:name" element={<Fresh><OptionGroupDetail /></Fresh>} />
      <Route path="zero-etl" element={<ZeroEtl />} />
      <Route path="events" element={<Events />} />
      <Route path="event-subscriptions" element={<EventSubscriptions />} />
      <Route path="event-subscriptions/create" element={<Fresh><CreateEventSubscription /></Fresh>} />
      <Route path="recommendations" element={<Recommendations />} />
      <Route path="certificate-update" element={<Certificates />} />
      <Route path="unsupported/:feature" element={<Unsupported />} />
      <Route path="*" element={<Navigate to="dashboard" replace />} />
    </Routes>
  );
}
