import { Fragment, type ReactElement } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { SideNavigationProps } from "@cloudscape-design/components/side-navigation";
import Badge from "@cloudscape-design/components/badge";
import GettingStarted from "./GettingStarted";
import { Databases, DatabaseDetail, Tables, TableDetail, EditTable, CatalogSettings } from "./Catalog";
import { Connections, CreateConnection, ConnectionDetail, Classifiers, Registries, RegistryDetail } from "./CatalogExtras";
import { Crawlers, CrawlerWizard, CrawlerDetail } from "./Crawlers";
import { Jobs, JobEditor, JobRunMonitoring } from "./Jobs";
import { Triggers, TriggerEditor, Workflows, CreateWorkflow, WorkflowDetail } from "./Orchestration";
import { SecurityConfigs, CreateSecurityConfig, Sessions, Blueprints, SensitiveData, RecordMatching, Unsupported } from "./Misc";

const na = <Badge color="grey">n/a</Badge>;
const L = (text: string, path: string, info?: any): SideNavigationProps.Item => ({ type: "link", text, href: `#/glue/${path}`, info });
export const GLUE_NAV: { header: SideNavigationProps.Header; items: SideNavigationProps.Item[] } = {
  header: { text: "AWS Glue", href: "#/glue/getting-started" },
  items: [
    L("Getting started", "getting-started"),
    { type: "section", text: "ETL jobs", defaultExpanded: true, items: [
      L("Visual ETL", "unsupported/visual-etl", na), L("Script editor jobs", "jobs"), L("Notebooks", "unsupported/notebooks", na), L("Job run monitoring", "monitoring"),
    ] },
    L("Zero-ETL integrations", "unsupported/zero-etl", na),
    L("Data Catalog tables", "tables"),
    L("Data connections", "connections"),
    L("Workflows (orchestration)", "workflows"),
    { type: "divider" },
    { type: "section", text: "Data Catalog", defaultExpanded: true, items: [
      L("Databases", "databases"), L("Tables", "tables"), L("Stream schema registries", "registries"), L("Schemas", "unsupported/schemas", na),
      L("Connections", "connections"), L("Crawlers", "crawlers"), L("Classifiers", "classifiers"), L("Catalog settings", "catalog-settings"),
    ] },
    { type: "section", text: "Data Integration and ETL", defaultExpanded: true, items: [
      L("ETL jobs", "jobs"), L("Interactive Sessions", "sessions"),
      { type: "expandable-link-group", text: "Data classification tools", href: "#/glue/sensitive-data", items: [L("Sensitive data detection", "sensitive-data"), L("Record Matching", "record-matching")] },
      L("Triggers", "triggers"), L("Workflows (orchestration)", "workflows"), L("Blueprints", "blueprints"), L("Security configurations", "security-configurations"),
    ] },
    { type: "divider" },
    { type: "link", text: "Console home", href: "#/" },
  ],
};

function Fresh({ children }: { children: ReactElement }) {
  const loc = useLocation();
  return <Fragment key={loc.pathname + loc.search}>{children}</Fragment>;
}

export default function GlueRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="getting-started" replace />} />
      <Route path="getting-started" element={<GettingStarted />} />
      <Route path="databases" element={<Databases />} />
      <Route path="databases/:db" element={<Fresh><DatabaseDetail /></Fresh>} />
      <Route path="tables" element={<Tables />} />
      <Route path="tables/create" element={<Fresh><EditTable /></Fresh>} />
      <Route path="tables/:db/:table" element={<Fresh><TableDetail /></Fresh>} />
      <Route path="tables/:db/:table/edit" element={<Fresh><EditTable /></Fresh>} />
      <Route path="catalog-settings" element={<CatalogSettings />} />
      <Route path="connections" element={<Connections />} />
      <Route path="connections/create" element={<Fresh><CreateConnection /></Fresh>} />
      <Route path="connections/:name" element={<Fresh><ConnectionDetail /></Fresh>} />
      <Route path="classifiers" element={<Classifiers />} />
      <Route path="registries" element={<Registries />} />
      <Route path="registries/:name" element={<Fresh><RegistryDetail /></Fresh>} />
      <Route path="crawlers" element={<Crawlers />} />
      <Route path="crawlers/create" element={<Fresh><CrawlerWizard /></Fresh>} />
      <Route path="crawlers/:name" element={<Fresh><CrawlerDetail /></Fresh>} />
      <Route path="crawlers/:name/edit" element={<Fresh><CrawlerWizard /></Fresh>} />
      <Route path="jobs" element={<Jobs />} />
      <Route path="jobs/create" element={<Fresh><JobEditor /></Fresh>} />
      <Route path="jobs/edit/:name" element={<Fresh><JobEditor /></Fresh>} />
      <Route path="monitoring" element={<JobRunMonitoring />} />
      <Route path="triggers" element={<Triggers />} />
      <Route path="triggers/create" element={<Fresh><TriggerEditor /></Fresh>} />
      <Route path="triggers/:name" element={<Fresh><TriggerEditor /></Fresh>} />
      <Route path="workflows" element={<Workflows />} />
      <Route path="workflows/create" element={<Fresh><CreateWorkflow /></Fresh>} />
      <Route path="workflows/:name" element={<Fresh><WorkflowDetail /></Fresh>} />
      <Route path="sessions" element={<Sessions />} />
      <Route path="blueprints" element={<Blueprints />} />
      <Route path="security-configurations" element={<SecurityConfigs />} />
      <Route path="security-configurations/create" element={<Fresh><CreateSecurityConfig /></Fresh>} />
      <Route path="sensitive-data" element={<SensitiveData />} />
      <Route path="record-matching" element={<RecordMatching />} />
      <Route path="unsupported/:feature" element={<Unsupported />} />
      <Route path="*" element={<Navigate to="getting-started" replace />} />
    </Routes>
  );
}
