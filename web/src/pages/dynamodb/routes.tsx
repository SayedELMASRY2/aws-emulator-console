import { Fragment, type ReactElement } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { SideNavigationProps } from "@cloudscape-design/components/side-navigation";
import Badge from "@cloudscape-design/components/badge";
import Dashboard from "./Dashboard";
import TablesList from "./TablesList";
import CreateTable from "./CreateTable";
import TableDetail from "./TableDetail";
import EditTableSetting from "./EditTableSetting";
import CreateIndex from "./CreateIndex";
import ExploreItems from "./ExploreItems";
import ItemEditor from "./ItemEditor";
import PartiQL from "./PartiQL";
import { BackupsPage, RestoreBackup } from "./Backups";
import { ExportsPage, ExportForm, ImportsPage, ImportForm } from "./ExportsImports";
import { DaxClusters, DaxSubnetGroups, DaxParameterGroups, DaxEvents } from "./Dax";
import Unsupported from "./Unsupported";

const na = <Badge color="grey">n/a</Badge>;
export const DDB_NAV: { header: SideNavigationProps.Header; items: SideNavigationProps.Item[] } = {
  header: { text: "DynamoDB", href: "#/dynamodb/dashboard" },
  items: [
    { type: "link", text: "Dashboard", href: "#/dynamodb/dashboard" },
    { type: "link", text: "Tables", href: "#/dynamodb/tables" },
    { type: "link", text: "Explore items", href: "#/dynamodb/explore" },
    { type: "link", text: "PartiQL editor", href: "#/dynamodb/partiql" },
    { type: "link", text: "Backups", href: "#/dynamodb/backups" },
    { type: "link", text: "Exports to S3", href: "#/dynamodb/exports" },
    { type: "link", text: "Imports from S3", href: "#/dynamodb/imports" },
    { type: "link", text: "Integrations", href: "#/dynamodb/unsupported/integrations", info: na },
    { type: "link", text: "Reserved capacity", href: "#/dynamodb/unsupported/reserved-capacity", info: na },
    { type: "link", text: "Settings", href: "#/dynamodb/unsupported/settings", info: na },
    { type: "section", text: "DAX", defaultExpanded: true, items: [
      { type: "link", text: "Clusters", href: "#/dynamodb/dax/clusters" },
      { type: "link", text: "Subnet groups", href: "#/dynamodb/dax/subnet-groups" },
      { type: "link", text: "Parameter groups", href: "#/dynamodb/dax/parameter-groups" },
      { type: "link", text: "Events", href: "#/dynamodb/dax/events" },
    ] },
    { type: "divider" },
    { type: "link", text: "Console home", href: "#/" },
  ],
};

function Fresh({ children }: { children: ReactElement }) {
  const loc = useLocation();
  return <Fragment key={loc.pathname + loc.search}>{children}</Fragment>;
}

export default function DynamoRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="dashboard" replace />} />
      <Route path="dashboard" element={<Dashboard />} />
      <Route path="tables" element={<TablesList />} />
      <Route path="create-table" element={<Fresh><CreateTable /></Fresh>} />
      <Route path="tables/:table" element={<TableDetail />} />
      <Route path="tables/:table/edit/:setting" element={<Fresh><EditTableSetting /></Fresh>} />
      <Route path="tables/:table/create-index" element={<Fresh><CreateIndex /></Fresh>} />
      <Route path="explore" element={<ExploreItems />} />
      <Route path="item" element={<Fresh><ItemEditor /></Fresh>} />
      <Route path="partiql" element={<PartiQL />} />
      <Route path="backups" element={<BackupsPage />} />
      <Route path="backups/restore" element={<Fresh><RestoreBackup /></Fresh>} />
      <Route path="exports" element={<ExportsPage />} />
      <Route path="exports/new" element={<Fresh><ExportForm /></Fresh>} />
      <Route path="imports" element={<ImportsPage />} />
      <Route path="imports/new" element={<Fresh><ImportForm /></Fresh>} />
      <Route path="dax/clusters" element={<DaxClusters />} />
      <Route path="dax/subnet-groups" element={<DaxSubnetGroups />} />
      <Route path="dax/parameter-groups" element={<DaxParameterGroups />} />
      <Route path="dax/events" element={<DaxEvents />} />
      <Route path="unsupported/:feature" element={<Unsupported />} />
      <Route path="*" element={<Navigate to="dashboard" replace />} />
    </Routes>
  );
}
