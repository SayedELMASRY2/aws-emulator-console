import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Wizard from "@cloudscape-design/components/wizard";
import Tabs from "@cloudscape-design/components/tabs";
import Table from "@cloudscape-design/components/table";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Textarea from "@cloudscape-design/components/textarea";
import Select from "@cloudscape-design/components/select";
import Multiselect from "@cloudscape-design/components/multiselect";
import RadioGroup from "@cloudscape-design/components/radio-group";
import Checkbox from "@cloudscape-design/components/checkbox";
import Button from "@cloudscape-design/components/button";
import Box from "@cloudscape-design/components/box";
import Link from "@cloudscape-design/components/link";
import Spinner from "@cloudscape-design/components/spinner";
import Alert from "@cloudscape-design/components/alert";
import { useCrumbs } from "../../App";
import { api } from "../../api";
import { ErrorAlert, useAsync, useFlash, ValueWithLabel, Copyable } from "../../common";
import { ResourcePage, ActionModal, forEachReport } from "../ec2/ResourcePage";
import { glue, glueAll, crumbs, enc, fmt, dur, St, useGlueRoles, createGlueRole, useDatabases, roleName, arn } from "./lib";
import { tableHref } from "./Catalog";

const V = ValueWithLabel;
const opt = (v: string, l?: string, d?: string) => ({ value: v, label: l || v, description: d });
const href = (n: string) => `#/glue/crawlers/${enc(n)}`;

export const SCHEDULES: Record<string, string> = { ondemand: "", hourly: "cron(0 * * * ? *)", daily: "cron(0 0 * * ? *)", weekly: "cron(0 0 ? * MON *)", monthly: "cron(0 0 1 * ? *)" };
export const schedLabel = (s?: string) => { if (!s) return "On demand"; const k = Object.entries(SCHEDULES).find(([, v]) => v === s)?.[0]; return k ? k[0].toUpperCase() + k.slice(1) : s; };

export function Crawlers() {
  useCrumbs(crumbs({ text: "Crawlers" }));
  const nav = useNavigate();
  const flash = useFlash();
  const metrics = useAsync(async () => Object.fromEntries((await glueAll("GetCrawlerMetrics", "CrawlerMetricsList")).map((m: any) => [m.CrawlerName, m])), []);
  const [del, setDel] = useState<{ rows: any[]; r: () => void } | null>(null);
  return (
    <>
      <ResourcePage<any> title="Crawlers" description="A crawler connects to a data store, determines the schema of your data, and creates metadata tables in the Data Catalog."
        load={() => glueAll("GetCrawlers", "Crawlers")} trackBy="Name" poll={c => c.State !== "READY"}
        primaryActions={[
          { id: "run", text: "Run", disabled: s => !s.length || s.some(c => c.State !== "READY"), run: async (s, r) => { await forEachReport(s, c => c.Name, c => glue("StartCrawler", { Name: c.Name }), flash, `Started ${s.map(c => c.Name).join(", ")}.`); r(); metrics.reload(); } },
        ]}
        actions={[
          { id: "edit", text: "Edit crawler", disabled: s => s.length !== 1, run: s => nav(`/glue/crawlers/${enc(s[0].Name)}/edit`) },
          { id: "stop", text: "Stop run", disabled: s => !s.length || s.some(c => c.State !== "RUNNING"), run: async (s, r) => { await forEachReport(s, c => c.Name, c => glue("StopCrawler", { Name: c.Name }), flash, "Stopping crawler."); r(); } },
          { id: "resume", text: "Resume schedule", disabled: s => !s.length || s.some(c => c.Schedule?.State !== "NOT_SCHEDULED"), run: async (s, r) => { await forEachReport(s, c => c.Name, c => glue("StartCrawlerSchedule", { CrawlerName: c.Name }), flash, "Schedule resumed."); r(); } },
          { id: "pause", text: "Pause schedule", disabled: s => !s.length || s.some(c => c.Schedule?.State !== "SCHEDULED"), run: async (s, r) => { await forEachReport(s, c => c.Name, c => glue("StopCrawlerSchedule", { CrawlerName: c.Name }), flash, "Schedule paused."); r(); } },
          { id: "delete", text: "Delete crawler", run: (s, r) => setDel({ rows: s, r }) },
        ]}
        create={{ text: "Create crawler", href: "#/glue/crawlers/create" }}
        columns={[
          { id: "n", header: "Name", cell: c => <Link href={href(c.Name)}>{c.Name}</Link>, sortingField: "Name" },
          { id: "s", header: "State", cell: c => <St s={c.State} /> },
          { id: "sch", header: "Schedule", cell: c => c.Schedule ? <>{schedLabel(c.Schedule.ScheduleExpression)} <Box variant="small" color="text-body-secondary">({c.Schedule.State === "SCHEDULED" ? "active" : "paused"})</Box></> : "-" },
          { id: "lr", header: "Last run", cell: c => <St s={c.LastCrawl?.Status} /> },
          { id: "lt", header: "Last run timestamp", cell: c => fmt(c.LastCrawl?.StartTime) },
          { id: "tc", header: "Table changes from last run", cell: c => { const m = metrics.data?.[c.Name]; return m ? `${m.TablesCreated} created, ${m.TablesUpdated} updated, ${m.TablesDeleted} deleted` : "-"; } },
          { id: "db", header: "Database", cell: c => c.DatabaseName || "-" },
        ]} />
      {del && <ActionModal visible danger onDismiss={() => setDel(null)} header="Delete crawlers" ok="Delete" onOk={async () => {
        for (const c of del.rows) await glue("DeleteCrawler", { Name: c.Name });
        flash.notify({ type: "success", content: "Crawler deleted." }); del.r();
      }}><Box>Delete {del.rows.map(c => c.Name).join(", ")}? Tables it created stay in the Data Catalog.</Box></ActionModal>}
    </>
  );
}

type Source = { type: "S3" | "JDBC" | "Catalog" | "DynamoDB"; path: string; exclusions: string; conn?: string; tables?: string[]; db?: string };
const srcFrom = (t: any): Source[] => [
  ...(t?.S3Targets || []).map((x: any) => ({ type: "S3" as const, path: x.Path, exclusions: (x.Exclusions || []).join("\n") })),
  ...(t?.JdbcTargets || []).map((x: any) => ({ type: "JDBC" as const, path: x.Path, exclusions: (x.Exclusions || []).join("\n"), conn: x.ConnectionName })),
  ...(t?.DynamoDBTargets || []).map((x: any) => ({ type: "DynamoDB" as const, path: x.Path, exclusions: "" })),
  ...(t?.CatalogTargets || []).map((x: any) => ({ type: "Catalog" as const, path: "", exclusions: "", db: x.DatabaseName, tables: x.Tables })),
];

export function CrawlerWizard() {
  const { name: editName } = useParams();
  const nav = useNavigate();
  const flash = useFlash();
  useCrumbs(crumbs({ text: "Crawlers", href: "#/glue/crawlers" }, ...(editName ? [{ text: editName, href: href(editName) }, { text: "Edit" }] : [{ text: "Add crawler" }])));
  const existing = useAsync(async () => editName ? (await glue("GetCrawler", { Name: editName })).Crawler : null, [editName]);
  const roles = useGlueRoles();
  const dbs = useDatabases();
  const classifiers = useAsync(async () => (await glueAll("GetClassifiers", "Classifiers")).map((c: any) => { const n = (c.CsvClassifier || c.JsonClassifier || c.XMLClassifier || c.GrokClassifier).Name; return opt(n); }), []);
  const conns = useAsync(async () => (await glueAll("GetConnections", "ConnectionList")).map((c: any) => opt(c.Name, c.Name, c.ConnectionType)), []);
  const secConfs = useAsync(async () => (await glueAll("GetSecurityConfigurations", "SecurityConfigurations")).map((c: any) => opt(c.Name)), []);
  const [step, setStep] = useState(0);
  const [f, setF] = useState<any>({ name: "", desc: "", sources: [] as Source[], cls: [] as any[], roleMode: "existing", role: null, newRole: "AWSGlueServiceRole-crawler", sec: null, db: null, newDb: "", prefix: "", maxTables: "", sched: "ondemand", cron: "", update: "UPDATE_IN_DATABASE", del: "LOG", recrawl: "CRAWL_EVERYTHING", partitionsInherit: false, tags: "" });
  const [src, setSrc] = useState<Source | null>(null);
  useEffect(() => {
    const c = existing.data; if (!c) return;
    const known = Object.values(SCHEDULES).includes(c.Schedule?.ScheduleExpression || "");
    setF((x: any) => ({ ...x, name: c.Name, desc: c.Description || "", sources: srcFrom(c.Targets), cls: (c.Classifiers || []).map((n: string) => opt(n)), role: opt(c.Role, roleName(c.Role)),
      sec: c.CrawlerSecurityConfiguration ? opt(c.CrawlerSecurityConfiguration) : null, db: c.DatabaseName ? opt(c.DatabaseName) : null, prefix: c.TablePrefix || "",
      sched: !c.Schedule ? "ondemand" : known ? Object.entries(SCHEDULES).find(([, v]) => v === c.Schedule.ScheduleExpression)![0] : "custom", cron: c.Schedule?.ScheduleExpression || "",
      update: c.SchemaChangePolicy?.UpdateBehavior || "UPDATE_IN_DATABASE", del: c.SchemaChangePolicy?.DeleteBehavior || "LOG", recrawl: c.RecrawlPolicy?.RecrawlBehavior || "CRAWL_EVERYTHING" }));
  }, [existing.data]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const set = (k: string) => (v: any) => setF({ ...f, [k]: v });
  if (editName && existing.loading) return <Box textAlign="center" padding="xl"><Spinner size="large" /></Box>;
  const schedule = f.sched === "custom" ? f.cron : SCHEDULES[f.sched];
  const targets = () => ({
    S3Targets: f.sources.filter((s: Source) => s.type === "S3").map((s: Source) => ({ Path: s.path, ...(s.exclusions ? { Exclusions: s.exclusions.split("\n").filter(Boolean) } : {}) })),
    JdbcTargets: f.sources.filter((s: Source) => s.type === "JDBC").map((s: Source) => ({ ConnectionName: s.conn, Path: s.path, ...(s.exclusions ? { Exclusions: s.exclusions.split("\n").filter(Boolean) } : {}) })),
    DynamoDBTargets: f.sources.filter((s: Source) => s.type === "DynamoDB").map((s: Source) => ({ Path: s.path })),
    CatalogTargets: f.sources.filter((s: Source) => s.type === "Catalog").map((s: Source) => ({ DatabaseName: s.db, Tables: s.tables })),
  });
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      let role = f.role?.value;
      if (f.roleMode === "new") role = await createGlueRole(f.newRole);
      let db = f.db?.value;
      if (f.newDb) { await glue("CreateDatabase", { DatabaseInput: { Name: f.newDb } }); db = f.newDb; }
      const p = {
        Name: f.name, Role: role, DatabaseName: db, ...(f.desc ? { Description: f.desc } : {}), Targets: targets(), Classifiers: f.cls.map((c: any) => c.value),
        TablePrefix: f.prefix, ...(schedule ? { Schedule: schedule } : {}), ...(f.sec ? { CrawlerSecurityConfiguration: f.sec.value } : {}),
        SchemaChangePolicy: { UpdateBehavior: f.recrawl === "CRAWL_EVERYTHING" ? f.update : "LOG", DeleteBehavior: f.recrawl === "CRAWL_EVERYTHING" ? f.del : "LOG" },
        RecrawlPolicy: { RecrawlBehavior: f.recrawl },
        ...(f.partitionsInherit ? { Configuration: JSON.stringify({ Version: 1.0, CrawlerOutput: { Partitions: { AddOrUpdateBehavior: "InheritFromTable" } } }) } : {}),
      };
      if (editName) { await glue("UpdateCrawler", p); if (!schedule && existing.data?.Schedule) await glue("StopCrawlerSchedule", { CrawlerName: f.name }).catch(() => {}); }
      else await glue("CreateCrawler", p);
      flash.notify({ type: "success", content: `${editName ? "Updated" : "Created"} crawler ${f.name}.`, action: <Button onClick={() => glue("StartCrawler", { Name: f.name }).then(() => flash.notify({ type: "success", content: `Started ${f.name}.` })).catch(e => flash.error(e))}>Run crawler</Button> });
      nav(href(f.name).slice(1));
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const review = (rows: [string, React.ReactNode][]) => <ColumnLayout columns={2} variant="text-grid">{rows.map(([l, v]) => <V key={l} label={l}>{v}</V>)}</ColumnLayout>;
  const stepProps = <SpaceBetween size="l">
    <FormField label="Name" constraintText="Up to 255 characters."><Input value={f.name} disabled={!!editName} onChange={e => set("name")(e.detail.value)} /></FormField>
    <FormField label="Description - optional"><Textarea value={f.desc} onChange={e => set("desc")(e.detail.value)} /></FormField>
  </SpaceBetween>;
  const stepSources = <SpaceBetween size="l">
    <Table variant="embedded" items={f.sources.map((s: Source, i: number) => ({ ...s, i }))}
      header={<Header variant="h3" counter={`(${f.sources.length})`} actions={<SpaceBetween direction="horizontal" size="xs">
        <Button onClick={() => set("sources")(f.sources.filter((_: any, i: number) => i !== (f._sel ?? -1)))} disabled={f._sel === undefined}>Remove</Button>
        <Button onClick={() => setSrc({ type: "S3", path: "s3://", exclusions: "" })}>Add a data source</Button>
      </SpaceBetween>}>Data sources</Header>}
      selectionType="single" selectedItems={f._sel !== undefined ? [{ ...f.sources[f._sel], i: f._sel }] : []} trackBy={(s: any) => String(s.i)}
      onSelectionChange={e => set("_sel")((e.detail.selectedItems[0] as any)?.i)}
      empty={<Box color="text-body-secondary">You don't have any data sources. Add a data source to continue.</Box>}
      columnDefinitions={[{ id: "t", header: "Type", cell: (s: any) => s.type }, { id: "p", header: "Data source", cell: (s: any) => s.type === "Catalog" ? `${s.db}: ${(s.tables || []).join(", ")}` : s.path },
        { id: "e", header: "Exclusions", cell: (s: any) => s.exclusions ? s.exclusions.split("\n").length : "-" }]} />
    <FormField label="Custom classifiers - optional" description="Classifiers are tried first, before the built-in classifiers."><Multiselect selectedOptions={f.cls} options={classifiers.data || []} onChange={e => set("cls")(e.detail.selectedOptions)} placeholder="Choose classifiers" empty="No custom classifiers" /></FormField>
  </SpaceBetween>;
  const stepSecurity = <SpaceBetween size="l">
    <FormField label="IAM role" description="The emulator enforces IAM, so the role needs read access to the data sources.">
      <RadioGroup value={f.roleMode} onChange={e => set("roleMode")(e.detail.value)} items={[{ value: "existing", label: "Choose an existing IAM role" }, { value: "new", label: "Create new IAM role" }]} />
    </FormField>
    {f.roleMode === "existing"
      ? <Select selectedOption={f.role} options={roles.data || []} onChange={e => set("role")(e.detail.selectedOption)} placeholder="Choose an IAM role" filteringType="auto" statusType={roles.loading ? "loading" : "finished"} />
      : <FormField label="Role name" description="Gets AWSGlueServiceRole and AmazonS3FullAccess."><Input value={f.newRole} onChange={e => set("newRole")(e.detail.value)} /></FormField>}
    <FormField label="Security configuration - optional"><Select selectedOption={f.sec} options={secConfs.data || []} onChange={e => set("sec")(e.detail.selectedOption)} placeholder="Choose a security configuration" empty="No security configurations" /></FormField>
  </SpaceBetween>;
  const stepOutput = <SpaceBetween size="l">
    <FormField label="Target database" secondaryControl={<Input value={f.newDb} onChange={e => set("newDb")(e.detail.value.toLowerCase())} placeholder="or a new database name" />}>
      <Select selectedOption={f.db} options={dbs.data || []} onChange={e => set("db")(e.detail.selectedOption)} placeholder="Choose a database" disabled={!!f.newDb} />
    </FormField>
    <FormField label="Table name prefix - optional"><Input value={f.prefix} onChange={e => set("prefix")(e.detail.value)} /></FormField>
    <FormField label="Crawler schedule" description="Frequency">
      <Select selectedOption={opt(f.sched, f.sched === "custom" ? "Custom" : schedLabel(SCHEDULES[f.sched]))} options={[...Object.keys(SCHEDULES).map(k => opt(k, schedLabel(SCHEDULES[k]), SCHEDULES[k] || undefined)), opt("custom", "Custom")]} onChange={e => set("sched")(e.detail.selectedOption.value)} />
    </FormField>
    {f.sched === "custom" && <FormField label="Cron expression" constraintText="cron(Minutes Hours Day-of-month Month Day-of-week Year)"><Input value={f.cron} onChange={e => set("cron")(e.detail.value)} placeholder="cron(15 12 * * ? *)" /></FormField>}
    <Container header={<Header variant="h3">Advanced options</Header>}>
      <SpaceBetween size="m">
        <FormField label="Subsequent crawler runs"><RadioGroup value={f.recrawl} onChange={e => set("recrawl")(e.detail.value)} items={[{ value: "CRAWL_EVERYTHING", label: "Crawl all sub-folders" }, { value: "CRAWL_NEW_FOLDERS_ONLY", label: "Crawl new sub-folders only" }, { value: "CRAWL_EVENT_MODE", label: "Crawl based on events" }]} /></FormField>
        {f.recrawl === "CRAWL_EVERYTHING" && <SpaceBetween size="m">
          <FormField label="When the crawler detects schema changes"><RadioGroup value={f.update} onChange={e => set("update")(e.detail.value)} items={[{ value: "UPDATE_IN_DATABASE", label: "Update the table definition in the Data Catalog" }, { value: "LOG", label: "Ignore the change and don't update the table" }]} /></FormField>
          <FormField label="When the crawler detects deleted objects"><RadioGroup value={f.del} onChange={e => set("del")(e.detail.value)} items={[{ value: "LOG", label: "Ignore the change and don't update the table" }, { value: "DEPRECATE_IN_DATABASE", label: "Mark the table as deprecated" }, { value: "DELETE_FROM_DATABASE", label: "Delete tables and partitions from the Data Catalog" }]} /></FormField>
        </SpaceBetween>}
        <Checkbox checked={f.partitionsInherit} onChange={e => set("partitionsInherit")(e.detail.checked)}>Update all new and existing partitions with metadata from the table</Checkbox>
      </SpaceBetween>
    </Container>
  </SpaceBetween>;
  const canNext = (i: number) => i === 0 ? !!f.name : i === 1 ? f.sources.length > 0 : i === 2 ? (f.roleMode === "new" ? !!f.newRole : !!f.role) : i === 3 ? !!(f.db || f.newDb) && (f.sched !== "custom" || !!f.cron) : true;
  return (
    <>
      <Wizard
        i18nStrings={{ stepNumberLabel: n => `Step ${n}`, collapsedStepsLabel: (n, t) => `Step ${n} of ${t}`, cancelButton: "Cancel", previousButton: "Previous", nextButton: "Next", submitButton: editName ? "Update crawler" : "Create crawler", optional: "optional" }}
        activeStepIndex={step} isLoadingNextStep={busy} onCancel={() => nav(-1)} onSubmit={submit}
        onNavigate={e => { if (e.detail.requestedStepIndex > step && !canNext(step)) return; setStep(e.detail.requestedStepIndex); }}
        steps={[
          { title: "Set crawler properties", content: <Container header={<Header variant="h2">Crawler details</Header>}>{stepProps}</Container> },
          { title: "Choose data sources and classifiers", content: <Container header={<Header variant="h2">Data source configuration</Header>}>{stepSources}</Container> },
          { title: "Configure security settings", content: <Container header={<Header variant="h2">IAM role</Header>}>{stepSecurity}</Container> },
          { title: "Set output and scheduling", content: <Container header={<Header variant="h2">Output configuration</Header>}>{stepOutput}</Container> },
          { title: "Review and create", errorText: err ? String((err as any).message || err) : undefined, content: <SpaceBetween size="l">
            <Container header={<Header variant="h2" actions={<Button onClick={() => setStep(0)}>Edit</Button>}>Step 1: Set crawler properties</Header>}>{review([["Name", f.name], ["Description", f.desc || "-"]])}</Container>
            <Container header={<Header variant="h2" actions={<Button onClick={() => setStep(1)}>Edit</Button>}>Step 2: Choose data sources and classifiers</Header>}>{review([["Data sources", f.sources.map((s: Source, i: number) => <div key={i}>{s.type}: {s.type === "Catalog" ? `${s.db}` : s.path}</div>)], ["Classifiers", f.cls.map((c: any) => c.value).join(", ") || "-"]])}</Container>
            <Container header={<Header variant="h2" actions={<Button onClick={() => setStep(2)}>Edit</Button>}>Step 3: Configure security settings</Header>}>{review([["IAM role", f.roleMode === "new" ? `${f.newRole} (new)` : f.role?.label], ["Security configuration", f.sec?.value || "-"]])}</Container>
            <Container header={<Header variant="h2" actions={<Button onClick={() => setStep(3)}>Edit</Button>}>Step 4: Set output and scheduling</Header>}>{review([["Database", f.newDb ? `${f.newDb} (new)` : f.db?.value], ["Table prefix", f.prefix || "-"], ["Schedule", schedLabel(schedule)], ["Recrawl", f.recrawl]])}</Container>
          </SpaceBetween> },
        ]} />
      {src && <SourceModal src={src} conns={conns.data || []} dbs={dbs.data || []} close={() => setSrc(null)} add={s => { set("sources")([...f.sources, s]); setSrc(null); }} />}
    </>
  );
}

function SourceModal({ src, conns, dbs, close, add }: { src: Source; conns: any[]; dbs: any[]; close: () => void; add: (s: Source) => void }) {
  const [s, setS] = useState<Source>(src);
  const tables = useAsync(async () => s.type === "Catalog" && s.db ? (await glueAll("GetTables", "TableList", { DatabaseName: s.db })).map((t: any) => opt(t.Name)) : [], [s.type, s.db]);
  const ddb = useAsync(async () => s.type === "DynamoDB" ? ((await api.call("dynamodb", "ListTables")).TableNames || []).map((n: string) => opt(n)) : [], [s.type]);
  return (
    <ActionModal visible onDismiss={close} header="Add data source" ok="Add a data source" size="medium" disabled={s.type === "Catalog" ? !s.db || !s.tables?.length : !s.path || s.path === "s3://"} onOk={async () => add(s)}>
      <FormField label="Data source"><Select selectedOption={opt(s.type)} options={["S3", "JDBC", "DynamoDB", "Catalog"].map(x => opt(x, x === "Catalog" ? "Data Catalog tables" : x))} onChange={e => setS({ type: e.detail.selectedOption.value as any, path: e.detail.selectedOption.value === "S3" ? "s3://" : "", exclusions: "" })} /></FormField>
      {s.type === "S3" && <SpaceBetween size="m">
        <FormField label="S3 path" description="Crawls all objects under this path." constraintText="s3://bucket/prefix/"><Input value={s.path} onChange={e => setS({ ...s, path: e.detail.value })} /></FormField>
        <FormField label="Exclude files matching pattern - optional" description="Glob patterns, one per line."><Textarea value={s.exclusions} onChange={e => setS({ ...s, exclusions: e.detail.value })} /></FormField>
      </SpaceBetween>}
      {s.type === "JDBC" && <SpaceBetween size="m">
        <FormField label="Connection"><Select selectedOption={s.conn ? opt(s.conn) : null} options={conns} onChange={e => setS({ ...s, conn: e.detail.selectedOption.value })} placeholder="Choose a connection" empty="No connections" /></FormField>
        <FormField label="Include path" constraintText="database/schema/table, with % as a wildcard"><Input value={s.path} onChange={e => setS({ ...s, path: e.detail.value })} placeholder="mydb/%" /></FormField>
      </SpaceBetween>}
      {s.type === "DynamoDB" && <FormField label="Table name"><Select selectedOption={s.path ? opt(s.path) : null} options={ddb.data || []} onChange={e => setS({ ...s, path: e.detail.selectedOption.value! })} placeholder="Choose a table" /></FormField>}
      {s.type === "Catalog" && <SpaceBetween size="m">
        <FormField label="Database"><Select selectedOption={s.db ? opt(s.db) : null} options={dbs} onChange={e => setS({ ...s, db: e.detail.selectedOption.value, tables: [] })} /></FormField>
        <FormField label="Tables"><Multiselect selectedOptions={(s.tables || []).map(t => opt(t))} options={tables.data || []} onChange={e => setS({ ...s, tables: e.detail.selectedOptions.map(o => o.value!) })} /></FormField>
      </SpaceBetween>}
    </ActionModal>
  );
}

export function CrawlerDetail() {
  const { name = "" } = useParams();
  const nav = useNavigate();
  const flash = useFlash();
  useCrumbs(crumbs({ text: "Crawlers", href: "#/glue/crawlers" }, { text: name }));
  const d = useAsync(async () => {
    const c = (await glue("GetCrawler", { Name: name })).Crawler;
    const m = (await glue("GetCrawlerMetrics", { CrawlerNameList: [name] })).CrawlerMetricsList?.[0];
    const tables = c.DatabaseName ? (await glueAll("GetTables", "TableList", { DatabaseName: c.DatabaseName }).catch(() => [])).filter((t: any) => t.Parameters?.UPDATED_BY_CRAWLER === name) : [];
    return { c, m, tables };
  }, [name]);
  useEffect(() => { if (d.data && d.data.c.State !== "READY") { const t = setTimeout(() => d.reload(), 2000); return () => clearTimeout(t); } }, [d.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const [del, setDel] = useState(false);
  if (d.error) return <ErrorAlert error={d.error} />;
  if (!d.data) return <Box textAlign="center" padding="xl"><Spinner size="large" /></Box>;
  const { c, m, tables } = d.data;
  const run = async () => { try { await glue("StartCrawler", { Name: name }); flash.notify({ type: "success", content: `Crawler ${name} started.` }); d.reload(); } catch (e) { flash.error(e, "Run failed"); } };
  const runs = c.LastCrawl ? [{ ...c.LastCrawl, m }] : [];
  return (
    <ContentLayout header={<Header variant="h1" actions={<SpaceBetween direction="horizontal" size="xs">
      <Button iconName="refresh" ariaLabel="Refresh" onClick={() => d.reload()} />
      {c.State === "RUNNING" ? <Button onClick={() => glue("StopCrawler", { Name: name }).then(() => d.reload()).catch(e => flash.error(e))}>Stop run</Button> : null}
      <Button onClick={() => nav(`/glue/crawlers/${enc(name)}/edit`)}>Edit</Button>
      <Button onClick={() => setDel(true)}>Delete</Button>
      <Button variant="primary" disabled={c.State !== "READY"} onClick={run}>Run crawler</Button>
    </SpaceBetween>}>{name}</Header>}>
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Crawler properties</Header>}>
          <ColumnLayout columns={4} variant="text-grid">
            <V label="Name">{c.Name}</V><V label="IAM role">{roleName(c.Role)}</V><V label="Database">{c.DatabaseName ? <Link href={`#/glue/databases/${enc(c.DatabaseName)}`}>{c.DatabaseName}</Link> : "-"}</V><V label="State"><St s={c.State} /></V>
            <V label="Description">{c.Description || "-"}</V><V label="Security configuration">{c.CrawlerSecurityConfiguration || "-"}</V><V label="Table prefix">{c.TablePrefix || "-"}</V><V label="Maximum table threshold">{c.MaximumTableThreshold || "-"}</V>
            <V label="Schedule">{schedLabel(c.Schedule?.ScheduleExpression)}</V><V label="Created">{fmt(c.CreationTime)}</V><V label="Last updated">{fmt(c.LastUpdated)}</V><V label="ARN"><Copyable text={arn("crawler", c.Name)} /></V>
          </ColumnLayout>
        </Container>
        <Tabs tabs={[
          { id: "runs", label: "Crawler runs", content: <Table variant="container" items={runs} header={<Header variant="h2" description="The emulator keeps the last run (ListCrawls isn't implemented).">Crawler runs</Header>}
              empty={<Box color="text-body-secondary">This crawler hasn't run yet.</Box>}
              columnDefinitions={[{ id: "s", header: "Status", cell: (r: any) => <St s={c.State === "RUNNING" ? "RUNNING" : r.Status} /> }, { id: "t", header: "Start time", cell: (r: any) => fmt(r.StartTime) },
                { id: "d", header: "Duration", cell: (r: any) => dur(r.m?.LastRuntimeSeconds) }, { id: "c", header: "Table changes", cell: (r: any) => r.m ? `${r.m.TablesCreated} created, ${r.m.TablesUpdated} updated, ${r.m.TablesDeleted} deleted` : "-" },
                { id: "e", header: "Error", cell: (r: any) => r.ErrorMessage || "-" }]} /> },
          { id: "tables", label: `Tables (${tables.length})`, content: <Table variant="container" items={tables} header={<Header variant="h2">Tables updated by this crawler</Header>}
              empty={<Box color="text-body-secondary">No tables yet. Run the crawler.</Box>}
              columnDefinitions={[{ id: "n", header: "Name", cell: (t: any) => <Link href={tableHref(t.DatabaseName, t.Name)}>{t.Name}</Link> }, { id: "c", header: "Classification", cell: (t: any) => t.Parameters?.classification || "-" },
                { id: "l", header: "Location", cell: (t: any) => t.StorageDescriptor?.Location }, { id: "cols", header: "Columns", cell: (t: any) => (t.StorageDescriptor?.Columns || []).length }, { id: "p", header: "Partition keys", cell: (t: any) => (t.PartitionKeys || []).map((k: any) => k.Name).join(", ") || "-" }]} /> },
          { id: "sources", label: "Data sources", content: <Table variant="container" items={srcFrom(c.Targets)} header={<Header variant="h2">Data sources</Header>}
              columnDefinitions={[{ id: "t", header: "Type", cell: (s: Source) => s.type }, { id: "p", header: "Data source", cell: (s: Source) => s.type === "Catalog" ? `${s.db}: ${(s.tables || []).join(", ")}` : s.path }, { id: "e", header: "Exclusions", cell: (s: Source) => s.exclusions || "-" }]} /> },
          { id: "cls", label: "Classifiers", content: <Container><Box>{(c.Classifiers || []).join(", ") || "Built-in classifiers only."}</Box></Container> },
          { id: "adv", label: "Advanced settings", content: <Container><ColumnLayout columns={3} variant="text-grid">
            <V label="Recrawl policy">{c.RecrawlPolicy?.RecrawlBehavior || "-"}</V><V label="Schema updates">{c.SchemaChangePolicy?.UpdateBehavior || "-"}</V><V label="Object deletion">{c.SchemaChangePolicy?.DeleteBehavior || "-"}</V>
            <V label="Configuration">{c.Configuration || "-"}</V><V label="Lineage">{c.LineageConfiguration?.CrawlerLineageSettings || "DISABLE"}</V>
          </ColumnLayout></Container> },
        ]} />
        {c.State === "READY" && c.LastCrawl?.Status === "FAILED" && <Alert type="error" header="Last run failed">{c.LastCrawl.ErrorMessage}</Alert>}
      </SpaceBetween>
      {del && <ActionModal visible danger onDismiss={() => setDel(false)} header={`Delete ${name}?`} ok="Delete" onOk={async () => { await glue("DeleteCrawler", { Name: name }); nav("/glue/crawlers"); }}><Box>Tables created by the crawler stay in the Data Catalog.</Box></ActionModal>}
    </ContentLayout>
  );
}
