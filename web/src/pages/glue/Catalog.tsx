import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Tabs from "@cloudscape-design/components/tabs";
import Table from "@cloudscape-design/components/table";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Textarea from "@cloudscape-design/components/textarea";
import Select from "@cloudscape-design/components/select";
import Tiles from "@cloudscape-design/components/tiles";
import Checkbox from "@cloudscape-design/components/checkbox";
import Button from "@cloudscape-design/components/button";
import ButtonDropdown from "@cloudscape-design/components/button-dropdown";
import Box from "@cloudscape-design/components/box";
import Link from "@cloudscape-design/components/link";
import Spinner from "@cloudscape-design/components/spinner";
import Alert from "@cloudscape-design/components/alert";
import Modal from "@cloudscape-design/components/modal";
import { useCrumbs } from "../../App";
import { api, isNotConfigured } from "../../api";
import { ErrorAlert, useAsync, useFlash, ValueWithLabel, Copyable, EmulatorNote } from "../../common";
import { ResourcePage, ActionModal } from "../ec2/ResourcePage";
import { glue, glueAll, crumbs, enc, fmt, St, ASSETS, ensureAssets, useDatabases, useGlueRoles, arn } from "./lib";

const V = ValueWithLabel;
const opt = (v: string, l?: string, d?: string) => ({ value: v, label: l || v, description: d });
export const tableHref = (db: string, t: string) => `#/glue/tables/${enc(db)}/${enc(t)}`;
const dbHref = (db: string) => `#/glue/databases/${enc(db)}`;

// ---------------- databases ----------------
function DbModal({ db, close, done }: { db?: any; close: () => void; done: () => void }) {
  const flash = useFlash();
  const [f, setF] = useState({ name: db?.Name || "", loc: db?.LocationUri || "", desc: db?.Description || "" });
  return (
    <ActionModal visible onDismiss={close} header={db ? `Edit ${db.Name}` : "Create a database"} ok={db ? "Save" : "Create database"} disabled={!f.name} onOk={async () => {
      const input = { Name: f.name, ...(f.loc ? { LocationUri: f.loc } : {}), ...(f.desc ? { Description: f.desc } : {}) };
      if (db) await glue("UpdateDatabase", { Name: db.Name, DatabaseInput: input }); else await glue("CreateDatabase", { DatabaseInput: input });
      flash.notify({ type: "success", content: `${db ? "Updated" : "Created"} database ${f.name}.` }); done();
    }}>
      <FormField label="Name" constraintText="Lowercase letters, numbers and underscores. 255 characters max."><Input value={f.name} disabled={!!db} onChange={e => setF({ ...f, name: e.detail.value.toLowerCase() })} /></FormField>
      <FormField label="Location - optional" description="Set the URI location for use by clients of the Data Catalog."><Input value={f.loc} onChange={e => setF({ ...f, loc: e.detail.value })} placeholder="s3://bucket/prefix/" /></FormField>
      <FormField label="Description - optional"><Textarea value={f.desc} onChange={e => setF({ ...f, desc: e.detail.value })} /></FormField>
    </ActionModal>
  );
}

export function Databases() {
  useCrumbs(crumbs({ text: "Databases" }));
  const flash = useFlash();
  const [m, setM] = useState<{ id: string; rows: any[]; r: () => void } | null>(null);
  return (
    <>
      <ResourcePage<any> title="Databases" description="A database is a set of associated table definitions, organized into a logical group."
        load={() => glueAll("GetDatabases", "DatabaseList")} trackBy="Name"
        primaryActions={[
          { id: "edit", text: "Edit", disabled: s => s.length !== 1, run: (s, r) => setM({ id: "edit", rows: s, r }) },
          { id: "delete", text: "Delete", run: (s, r) => setM({ id: "delete", rows: s, r }) },
        ]}
        create={{ text: "Add database", onClick: r => setM({ id: "create", rows: [], r }) }}
        columns={[
          { id: "n", header: "Name", cell: d => <Link href={dbHref(d.Name)}>{d.Name}</Link>, sortingField: "Name" },
          { id: "d", header: "Description", cell: d => d.Description || "-" },
          { id: "l", header: "Location URI", cell: d => d.LocationUri || "-" },
          { id: "c", header: "Created on (UTC)", cell: d => fmt(d.CreateTime) },
          { id: "cat", header: "Catalog ID", cell: d => d.CatalogId, hidden: true },
        ]} />
      {(m?.id === "create" || m?.id === "edit") && <DbModal db={m.rows[0]} close={() => setM(null)} done={() => { setM(null); m.r(); }} />}
      {m?.id === "delete" && <ActionModal visible danger onDismiss={() => setM(null)} header="Delete databases" ok="Delete" onOk={async () => {
        for (const d of m.rows) await glue("DeleteDatabase", { Name: d.Name });
        flash.notify({ type: "success", content: `Deleted ${m.rows.map(d => d.Name).join(", ")}.` }); m.r();
      }}><Alert type="warning">Deleting a database also deletes all of its tables from the Data Catalog. Data in Amazon S3 isn't deleted.</Alert><Box>Delete {m.rows.map(d => d.Name).join(", ")}?</Box></ActionModal>}
    </>
  );
}

export function DatabaseDetail() {
  const { db = "" } = useParams();
  useCrumbs(crumbs({ text: "Databases", href: "#/glue/databases" }, { text: db }));
  const d = useAsync(async () => (await glue("GetDatabase", { Name: db })).Database, [db]);
  const [edit, setEdit] = useState(false);
  if (d.error) return <ErrorAlert error={d.error} />;
  if (!d.data) return <Box textAlign="center" padding="xl"><Spinner size="large" /></Box>;
  const x = d.data;
  return (
    <ContentLayout header={<Header variant="h1" actions={<Button onClick={() => setEdit(true)}>Edit</Button>}>{db}</Header>}>
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Database properties</Header>}>
          <ColumnLayout columns={4} variant="text-grid">
            <V label="Name">{x.Name}</V><V label="Description">{x.Description || "-"}</V><V label="Location">{x.LocationUri || "-"}</V><V label="Created on (UTC)">{fmt(x.CreateTime)}</V>
          </ColumnLayout>
        </Container>
        <TablesList db={db} />
      </SpaceBetween>
      {edit && <DbModal db={x} close={() => setEdit(false)} done={() => { setEdit(false); d.reload(); }} />}
    </ContentLayout>
  );
}

// ---------------- tables ----------------
async function allTables(db?: string) {
  const dbs = db ? [db] : (await glueAll("GetDatabases", "DatabaseList")).map((d: any) => d.Name);
  return (await Promise.all(dbs.map((n: string) => glueAll("GetTables", "TableList", { DatabaseName: n }).catch(() => [])))).flat();
}

function TablesList({ db }: { db?: string }) {
  const nav = useNavigate();
  const flash = useFlash();
  const [del, setDel] = useState<{ rows: any[]; r: () => void } | null>(null);
  return (
    <>
      <ResourcePage<any> title="Tables" description={db ? undefined : "A table is the metadata definition that represents your data, including its schema."}
        load={() => allTables(db)} trackBy={t => `${t.DatabaseName}.${t.Name}`} deps={[db]}
        primaryActions={[{ id: "delete", text: "Delete", run: (s, r) => setDel({ rows: s, r }) }]}
        actions={[
          { id: "edit", text: "Edit table", disabled: s => s.length !== 1, run: s => nav(`/glue/tables/${enc(s[0].DatabaseName)}/${enc(s[0].Name)}/edit`) },
          { id: "crawler", text: "Add tables using crawler", disabled: () => false, run: () => nav("/glue/crawlers/create") },
        ]}
        create={{ text: "Add table", href: `#/glue/tables/create${db ? `?db=${enc(db)}` : ""}` }}
        columns={[
          { id: "n", header: "Name", cell: t => <Link href={tableHref(t.DatabaseName, t.Name)}>{t.Name}</Link>, sortingField: "Name" },
          { id: "d", header: "Database", cell: t => <Link href={dbHref(t.DatabaseName)}>{t.DatabaseName}</Link> },
          { id: "l", header: "Location", cell: t => t.StorageDescriptor?.Location || "-" },
          { id: "c", header: "Classification", cell: t => t.Parameters?.classification || "-" },
          { id: "u", header: "Last updated", cell: t => fmt(t.UpdateTime) },
          { id: "v", header: "View data", cell: t => <Link href={`${tableHref(t.DatabaseName, t.Name)}?view=1`}>Table data</Link> },
        ]} />
      {del && <ActionModal visible danger onDismiss={() => setDel(null)} header="Delete tables" ok="Delete" onOk={async () => {
        for (const t of del.rows) await glue("DeleteTable", { DatabaseName: t.DatabaseName, Name: t.Name });
        flash.notify({ type: "success", content: `Deleted ${del.rows.length} table(s).` }); del.r();
      }}><Box>Delete {del.rows.map(t => `${t.DatabaseName}.${t.Name}`).join(", ")}? The data in Amazon S3 isn't deleted.</Box></ActionModal>}
    </>
  );
}

export function Tables() {
  useCrumbs(crumbs({ text: "Tables" }));
  return <TablesList />;
}

/** Runs SELECT * LIMIT 10 through Athena (the emulator runs SQL over the table's S3 data). */
function ViewData({ db, table, close }: { db: string; table: string; close: () => void }) {
  const [sql, setSql] = useState(`SELECT * FROM "${db}"."${table}" LIMIT 10`);
  const [runKey, setRunKey] = useState(0);
  const q = useAsync(async () => {
    await ensureAssets();
    const id = (await api.call("athena", "StartQueryExecution", { QueryString: sql, QueryExecutionContext: { Database: db }, ResultConfiguration: { OutputLocation: `s3://${ASSETS}/athena-results/` } })).QueryExecutionId;
    for (let k = 0; k < 60; k++) {
      const st = (await api.call("athena", "GetQueryExecution", { QueryExecutionId: id })).QueryExecution.Status;
      if (st.State === "SUCCEEDED") break;
      if (st.State === "FAILED" || st.State === "CANCELLED") throw new Error(st.StateChangeReason || st.State);
      await new Promise(r => setTimeout(r, 700));
    }
    const res = await api.call("athena", "GetQueryResults", { QueryExecutionId: id });
    const rows = res.ResultSet.Rows.map((r: any) => r.Data.map((c: any) => c.VarCharValue));
    return { cols: rows[0] || [], rows: rows.slice(1) };
  }, [runKey]);
  return (
    <Modal visible onDismiss={close} size="max" header="Preview data" footer={<Box float="right"><Button onClick={close}>Close</Button></Box>}>
      <SpaceBetween size="m">
        <Box color="text-body-secondary">Amazon Athena runs this query on the table's data in Amazon S3.</Box>
        <SpaceBetween direction="horizontal" size="xs">
          <div style={{ width: 700 }}><Input value={sql} onChange={e => setSql(e.detail.value)} /></div>
          <Button onClick={() => setRunKey(k => k + 1)} loading={q.loading}>Run</Button>
          <Button href="/legacy/#/athena" variant="link">Open in Athena</Button>
        </SpaceBetween>
        {q.error ? <ErrorAlert error={q.error} /> : null}
        <Table variant="embedded" loading={q.loading} items={q.data?.rows || []} empty={<Box color="text-body-secondary">No rows</Box>}
          columnDefinitions={(q.data?.cols || []).map((c: string, k: number) => ({ id: String(k), header: c, cell: (r: any) => r[k] ?? "" }))} />
      </SpaceBetween>
    </Modal>
  );
}

function DataQuality({ t }: { t: any }) {
  const flash = useFlash();
  const rs = useAsync(async () => (await glueAll("ListDataQualityRulesets", "Rulesets", { Filter: { TargetTable: { DatabaseName: t.DatabaseName, TableName: t.Name } } })), [t.Name]);
  const runs = useAsync(async () => {
    const r = await glueAll("ListDataQualityRulesetEvaluationRuns", "Runs", { Filter: { DataSource: { GlueTable: { DatabaseName: t.DatabaseName, TableName: t.Name } } } }).catch(() => []);
    const full = await Promise.all(r.slice(0, 20).map((x: any) => glue("GetDataQualityRulesetEvaluationRun", { RunId: x.RunId }).catch(() => x)));
    return full;
  }, [t.Name]);
  const roles = useGlueRoles();
  const [create, setCreate] = useState(false);
  const [f, setF] = useState({ name: `${t.Name}_ruleset`, rules: 'Rules = [\n    RowCount > 0,\n    IsComplete "' + (t.StorageDescriptor?.Columns?.[0]?.Name || "id") + '"\n]' });
  const [run, setRun] = useState<{ names: string[] } | null>(null);
  const [role, setRole] = useState<any>(null);
  const [result, setResult] = useState<string | null>(null);
  const res = useAsync(async () => result ? glue("GetDataQualityResult", { ResultId: result }) : null, [result]);
  const busy = (runs.data || []).some((r: any) => /RUNNING|STARTING/.test(r.Status));
  useEffect(() => { if (busy) { const x = setTimeout(() => runs.reload(), 2000); return () => clearTimeout(x); } }, [runs.data]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <SpaceBetween size="l">
      <Table variant="container" items={rs.data || []} loading={rs.loading} trackBy="Name"
        header={<Header variant="h2" counter={`(${rs.data?.length || 0})`} description="Rulesets are written in Data Quality Definition Language (DQDL)."
          actions={<SpaceBetween direction="horizontal" size="xs"><Button disabled={!rs.data?.length} onClick={() => setRun({ names: (rs.data || []).map((x: any) => x.Name) })}>Run</Button><Button variant="primary" onClick={() => setCreate(true)}>Create data quality rules</Button></SpaceBetween>}>Data quality rulesets</Header>}
        empty={<Box color="text-body-secondary">No rulesets. Create data quality rules to check this table.</Box>}
        columnDefinitions={[{ id: "n", header: "Ruleset name", cell: (x: any) => x.Name }, { id: "c", header: "Rule count", cell: (x: any) => x.RuleCount ?? "-" }, { id: "m", header: "Last modified", cell: (x: any) => fmt(x.LastModifiedOn) },
          { id: "x", header: "", cell: (x: any) => <Button variant="inline-link" onClick={async () => { try { await glue("DeleteDataQualityRuleset", { Name: x.Name }); rs.reload(); } catch (e) { flash.error(e); } }}>Delete</Button> }]} />
      <Table variant="container" items={runs.data || []} loading={runs.loading}
        header={<Header variant="h2" counter={`(${runs.data?.length || 0})`} actions={<Button iconName="refresh" ariaLabel="Refresh" onClick={() => runs.reload()} />}>Data quality runs</Header>}
        empty={<Box color="text-body-secondary">No runs yet.</Box>}
        columnDefinitions={[
          { id: "id", header: "Run ID", cell: (r: any) => r.RunId },
          { id: "s", header: "Status", cell: (r: any) => <St s={r.Status} /> },
          { id: "rs", header: "Rulesets", cell: (r: any) => (r.RulesetNames || []).join(", ") || "-" },
          { id: "t", header: "Started", cell: (r: any) => fmt(r.StartedOn) },
          { id: "res", header: "Results", cell: (r: any) => (r.ResultIds || []).map((id: string) => <div key={id}><Button variant="inline-link" onClick={() => setResult(id)}>View result</Button></div>) },
        ]} />
      {create && <ActionModal visible size="large" onDismiss={() => setCreate(false)} header="Create data quality rules" ok="Save ruleset" disabled={!f.name} onOk={async () => {
        await glue("CreateDataQualityRuleset", { Name: f.name, Ruleset: f.rules, TargetTable: { DatabaseName: t.DatabaseName, TableName: t.Name } });
        flash.notify({ type: "success", content: `Saved ruleset ${f.name}.` }); rs.reload();
      }}>
        <FormField label="Ruleset name"><Input value={f.name} onChange={e => setF({ ...f, name: e.detail.value })} /></FormField>
        <FormField label="Ruleset (DQDL)" description={`Columns: ${(t.StorageDescriptor?.Columns || []).map((c: any) => c.Name).join(", ")}`}><Textarea rows={10} value={f.rules} onChange={e => setF({ ...f, rules: e.detail.value })} spellcheck={false} /></FormField>
      </ActionModal>}
      {run && <ActionModal visible onDismiss={() => setRun(null)} header="Run data quality evaluation" ok="Run" disabled={!role} onOk={async () => {
        await glue("StartDataQualityRulesetEvaluationRun", { DataSource: { GlueTable: { DatabaseName: t.DatabaseName, TableName: t.Name } }, Role: role.value, RulesetNames: run.names });
        flash.notify({ type: "success", content: "Data quality run started." }); runs.reload();
      }}>
        <FormField label="Rulesets"><Box>{run.names.join(", ")}</Box></FormField>
        <FormField label="IAM role"><Select selectedOption={role} options={roles.data || []} onChange={e => setRole(e.detail.selectedOption)} placeholder="Choose an IAM role" filteringType="auto" /></FormField>
      </ActionModal>}
      <Modal visible={!!result} onDismiss={() => setResult(null)} size="large" header="Data quality result">
        {res.loading || !res.data ? <Spinner /> : <SpaceBetween size="m">
          <ColumnLayout columns={3} variant="text-grid"><V label="Score">{Math.round((res.data.Score ?? 0) * 100)}%</V><V label="Ruleset">{res.data.RulesetName}</V><V label="Completed">{fmt(res.data.CompletedOn)}</V></ColumnLayout>
          <Table variant="embedded" items={res.data.RuleResults || []} columnDefinitions={[
            { id: "r", header: "Rule", cell: (x: any) => x.Description || x.Name }, { id: "s", header: "Result", cell: (x: any) => <St s={x.Result} /> },
            { id: "m", header: "Evaluated metrics", cell: (x: any) => Object.entries(x.EvaluatedMetrics || {}).map(([k, v]) => `${k} = ${v}`).join(", ") || "-" },
            { id: "e", header: "Message", cell: (x: any) => x.EvaluationMessage || "-" },
          ]} />
        </SpaceBetween>}
      </Modal>
    </SpaceBetween>
  );
}

export function TableDetail() {
  const { db = "", table = "" } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const flash = useFlash();
  useCrumbs(crumbs({ text: "Tables", href: "#/glue/tables" }, { text: table }));
  const d = useAsync(async () => (await glue("GetTable", { DatabaseName: db, Name: table })).Table, [db, table]);
  const parts = useAsync(async () => glueAll("GetPartitions", "Partitions", { DatabaseName: db, TableName: table }).catch(() => []), [db, table]);
  const vers = useAsync(async () => (await glue("GetTableVersions", { DatabaseName: db, TableName: table })).TableVersions || [], [db, table]);
  const idx = useAsync(async () => (await glue("GetPartitionIndexes", { DatabaseName: db, TableName: table })).PartitionIndexDescriptorList || [], [db, table]);
  const [view, setView] = useState(sp.get("view") === "1");
  const [del, setDel] = useState(false);
  const [ver, setVer] = useState<any>(null);
  if (d.error) return <ErrorAlert error={d.error} />;
  if (!d.data) return <Box textAlign="center" padding="xl"><Spinner size="large" /></Box>;
  const t = d.data, sd = t.StorageDescriptor || {};
  const cols = [...(sd.Columns || []).map((c: any, k: number) => ({ ...c, n: k + 1 })), ...(t.PartitionKeys || []).map((c: any, k: number) => ({ ...c, n: (sd.Columns || []).length + k + 1, partition: k + 1 }))];
  return (
    <ContentLayout header={<Header variant="h1" actions={<SpaceBetween direction="horizontal" size="xs">
      <Button iconName="refresh" ariaLabel="Refresh" onClick={() => d.reload()} />
      <ButtonDropdown items={[{ id: "edit", text: "Edit table" }, { id: "schema", text: "Edit schema" }, { id: "delete", text: "Delete" }]} onItemClick={e => {
        if (e.detail.id === "delete") setDel(true); else nav(`/glue/tables/${enc(db)}/${enc(table)}/edit`);
      }}>Actions</ButtonDropdown>
      <Button variant="primary" onClick={() => setView(true)}>View data</Button>
    </SpaceBetween>}>{table}</Header>}>
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Table overview</Header>}>
          <ColumnLayout columns={4} variant="text-grid">
            <V label="Name">{t.Name}</V><V label="Database"><Link href={dbHref(db)}>{db}</Link></V><V label="Description">{t.Description || "-"}</V>
            <V label="Location"><Copyable text={sd.Location || ""} /></V><V label="Classification">{t.Parameters?.classification || "-"}</V><V label="Table type">{t.TableType || "-"}</V>
            <V label="Last updated">{fmt(t.UpdateTime)}</V><V label="Created">{fmt(t.CreateTime)}</V><V label="Updated by crawler">{t.Parameters?.UPDATED_BY_CRAWLER ? <Link href={`#/glue/crawlers/${enc(t.Parameters.UPDATED_BY_CRAWLER)}`}>{t.Parameters.UPDATED_BY_CRAWLER}</Link> : "-"}</V>
            <V label="Input format">{sd.InputFormat || "-"}</V><V label="Output format">{sd.OutputFormat || "-"}</V><V label="Serde serialization lib">{sd.SerdeInfo?.SerializationLibrary || "-"}</V>
            <V label="Serde parameters">{Object.entries(sd.SerdeInfo?.Parameters || {}).map(([k, v]) => `${k}=${v}`).join(", ") || "-"}</V><V label="ARN"><Copyable text={arn("table", `${db}/${table}`)} /></V>
          </ColumnLayout>
        </Container>
        <Tabs tabs={[
          { id: "schema", label: "Schema", content: <Table variant="container" items={cols}
              header={<Header variant="h2" counter={`(${cols.length})`} actions={<Button onClick={() => nav(`/glue/tables/${enc(db)}/${enc(table)}/edit`)}>Edit schema</Button>}>Schema</Header>}
              columnDefinitions={[{ id: "n", header: "#", cell: (c: any) => c.n, width: 60 }, { id: "c", header: "Column name", cell: (c: any) => c.Name }, { id: "t", header: "Data type", cell: (c: any) => c.Type },
                { id: "p", header: "Partition key", cell: (c: any) => c.partition ? `Partition (${c.partition})` : "-" }, { id: "cm", header: "Comment", cell: (c: any) => c.Comment || "-" }]} /> },
          { id: "parts", label: `Partitions (${parts.data?.length || 0})`, content: <Table variant="container" items={parts.data || []} loading={parts.loading}
              header={<Header variant="h2" counter={`(${parts.data?.length || 0})`}>Partitions</Header>} empty={<Box color="text-body-secondary">No partitions.</Box>}
              columnDefinitions={[
                ...(t.PartitionKeys || []).map((k: any, i: number) => ({ id: `k${i}`, header: k.Name, cell: (p: any) => p.Values?.[i] })),
                { id: "l", header: "Location", cell: (p: any) => p.StorageDescriptor?.Location }, { id: "c", header: "Created", cell: (p: any) => fmt(p.CreationTime) },
              ]} /> },
          { id: "idx", label: "Indexes", content: <Table variant="container" items={idx.data || []} header={<Header variant="h2">Partition indexes</Header>} empty={<Box color="text-body-secondary">No partition indexes.</Box>}
              columnDefinitions={[{ id: "n", header: "Index name", cell: (x: any) => x.IndexName }, { id: "k", header: "Keys", cell: (x: any) => (x.Keys || []).map((k: any) => k.Name).join(", ") }, { id: "s", header: "Status", cell: (x: any) => <St s={x.IndexStatus} /> }]} /> },
          { id: "dq", label: "Data quality", content: <DataQuality t={t} /> },
          { id: "stats", label: "Column statistics", content: <Container><EmulatorNote>Column statistics generation isn't covered by this console.</EmulatorNote></Container> },
          { id: "adv", label: "Advanced properties", content: <Table variant="container" header={<Header variant="h2">Table properties</Header>}
              items={Object.entries(t.Parameters || {}).map(([k, v]) => ({ k, v }))} columnDefinitions={[{ id: "k", header: "Key", cell: (x: any) => x.k }, { id: "v", header: "Value", cell: (x: any) => String(x.v) }]} /> },
          { id: "vers", label: "Versions", content: <Table variant="container" items={vers.data || []} header={<Header variant="h2" counter={`(${vers.data?.length || 0})`}>Table versions</Header>}
              columnDefinitions={[{ id: "v", header: "Version", cell: (x: any) => x.VersionId }, { id: "u", header: "Updated", cell: (x: any) => fmt(x.Table?.UpdateTime) },
                { id: "c", header: "Columns", cell: (x: any) => (x.Table?.StorageDescriptor?.Columns || []).length }, { id: "s", header: "", cell: (x: any) => <Button variant="inline-link" onClick={() => setVer(x)}>View schema</Button> }]} /> },
        ]} />
      </SpaceBetween>
      {view && <ViewData db={db} table={table} close={() => setView(false)} />}
      <Modal visible={!!ver} onDismiss={() => setVer(null)} header={`Version ${ver?.VersionId}`} size="medium">
        <Table variant="embedded" items={ver?.Table?.StorageDescriptor?.Columns || []} columnDefinitions={[{ id: "n", header: "Column", cell: (c: any) => c.Name }, { id: "t", header: "Type", cell: (c: any) => c.Type }]} />
      </Modal>
      {del && <ActionModal visible danger onDismiss={() => setDel(false)} header={`Delete ${table}?`} ok="Delete" onOk={async () => {
        await glue("DeleteTable", { DatabaseName: db, Name: table }); flash.notify({ type: "success", content: `Deleted ${table}.` }); nav("/glue/tables");
      }}><Box>The table definition is removed from the Data Catalog. The data in Amazon S3 isn't deleted.</Box></ActionModal>}
    </ContentLayout>
  );
}

// ---------------- create / edit table ----------------
const FORMATS: Record<string, { label: string; input: string; output: string; serde: string; params?: Record<string, string> }> = {
  csv: { label: "CSV", input: "org.apache.hadoop.mapred.TextInputFormat", output: "org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat", serde: "org.apache.hadoop.hive.serde2.lazy.LazySimpleSerDe" },
  json: { label: "JSON", input: "org.apache.hadoop.mapred.TextInputFormat", output: "org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat", serde: "org.openx.data.jsonserde.JsonSerDe" },
  parquet: { label: "Parquet", input: "org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat", output: "org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat", serde: "org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe" },
  avro: { label: "Avro", input: "org.apache.hadoop.hive.ql.io.avro.AvroContainerInputFormat", output: "org.apache.hadoop.hive.ql.io.avro.AvroContainerOutputFormat", serde: "org.apache.hadoop.hive.serde2.avro.AvroSerDe" },
  orc: { label: "ORC", input: "org.apache.hadoop.hive.ql.io.orc.OrcInputFormat", output: "org.apache.hadoop.hive.ql.io.orc.OrcOutputFormat", serde: "org.apache.hadoop.hive.ql.io.orc.OrcSerde" },
};
const TYPES = ["string", "int", "bigint", "smallint", "tinyint", "double", "float", "decimal(10,2)", "boolean", "date", "timestamp", "binary", "array<string>", "map<string,string>", "struct<>"];
type Col = { Name: string; Type: string; Comment?: string };

function ColumnsEditor({ cols, onChange, label }: { cols: Col[]; onChange: (c: Col[]) => void; label: string }) {
  const set = (i: number, k: keyof Col, v: string) => onChange(cols.map((c, j) => j === i ? { ...c, [k]: v } : c));
  return (
    <Table variant="embedded" items={cols.map((c, i) => ({ ...c, i }))} header={<Header variant="h3" counter={`(${cols.length})`} actions={<Button onClick={() => onChange([...cols, { Name: "", Type: "string" }])}>Add column</Button>}>{label}</Header>}
      empty={<Box color="text-body-secondary">No columns</Box>}
      columnDefinitions={[
        { id: "n", header: "#", cell: (c: any) => c.i + 1, width: 50 },
        { id: "name", header: "Name", cell: (c: any) => <Input value={c.Name} onChange={e => set(c.i, "Name", e.detail.value)} placeholder="column_name" /> },
        { id: "type", header: "Data type", cell: (c: any) => <Select selectedOption={opt(c.Type)} options={[...new Set([c.Type, ...TYPES])].map(x => opt(x))} filteringType="auto" onChange={e => set(c.i, "Type", e.detail.selectedOption.value!)} /> },
        { id: "cm", header: "Comment", cell: (c: any) => <Input value={c.Comment || ""} onChange={e => set(c.i, "Comment", e.detail.value)} /> },
        { id: "x", header: "", width: 90, cell: (c: any) => <Button variant="inline-link" onClick={() => onChange(cols.filter((_, j) => j !== c.i))}>Remove</Button> },
      ]} />
  );
}

export function EditTable() {
  const { db: editDb, table: editTable } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const flash = useFlash();
  const editing = !!editTable;
  useCrumbs(crumbs({ text: "Tables", href: "#/glue/tables" }, ...(editing ? [{ text: editTable!, href: tableHref(editDb!, editTable!) }, { text: "Edit" }] : [{ text: "Add table" }])));
  const dbs = useDatabases();
  const existing = useAsync(async () => editing ? (await glue("GetTable", { DatabaseName: editDb, Name: editTable })).Table : null, [editDb, editTable]);
  const [f, setF] = useState<any>({ name: "", db: sp.get("db") || "", desc: "", loc: "", format: "csv", delim: ",", header: true, cols: [{ Name: "id", Type: "bigint" }] as Col[], parts: [] as Col[], props: "" });
  const [mode, setMode] = useState("form");
  const [json, setJson] = useState("");
  useEffect(() => {
    const t = existing.data; if (!t) return;
    const sd = t.StorageDescriptor || {};
    const fmtKey = Object.entries(FORMATS).find(([, v]) => v.serde === sd.SerdeInfo?.SerializationLibrary)?.[0] || (t.Parameters?.classification && FORMATS[t.Parameters.classification] ? t.Parameters.classification : "csv");
    setF({ name: t.Name, db: t.DatabaseName, desc: t.Description || "", loc: sd.Location || "", format: fmtKey, delim: sd.SerdeInfo?.Parameters?.["field.delim"] || ",",
      header: t.Parameters?.["skip.header.line.count"] === "1", cols: sd.Columns || [], parts: t.PartitionKeys || [],
      props: Object.entries(t.Parameters || {}).filter(([k]) => !["classification", "skip.header.line.count"].includes(k)).map(([k, v]) => `${k}=${v}`).join("\n") });
  }, [existing.data]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  if (editing && existing.loading) return <Box textAlign="center" padding="xl"><Spinner size="large" /></Box>;
  const set = (k: string) => (v: any) => setF({ ...f, [k]: v });
  const buildInput = () => {
    const fm = FORMATS[f.format];
    const props: Record<string, string> = Object.fromEntries(String(f.props).split("\n").map((l: string) => l.trim()).filter(Boolean).map((l: string) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }));
    return {
      Name: f.name, ...(f.desc ? { Description: f.desc } : {}), TableType: "EXTERNAL_TABLE",
      Parameters: { ...props, classification: f.format, ...(f.format === "csv" && f.header ? { "skip.header.line.count": "1" } : {}) },
      PartitionKeys: f.parts.filter((c: Col) => c.Name),
      StorageDescriptor: { Columns: f.cols.filter((c: Col) => c.Name), Location: f.loc, InputFormat: fm.input, OutputFormat: fm.output,
        SerdeInfo: { SerializationLibrary: fm.serde, Parameters: f.format === "csv" ? { "field.delim": f.delim } : {} } },
    };
  };
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const input = mode === "json" ? JSON.parse(json) : buildInput();
      if (editing) await glue("UpdateTable", { DatabaseName: editDb, TableInput: input });
      else await glue("CreateTable", { DatabaseName: f.db, TableInput: input });
      flash.notify({ type: "success", content: `${editing ? "Updated" : "Created"} table ${input.Name}.` });
      nav(tableHref(editing ? editDb! : f.db, input.Name).slice(1));
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <ContentLayout header={<Header variant="h1" actions={<Tiles columns={2} value={mode} onChange={e => { if (e.detail.value === "json") setJson(JSON.stringify(buildInput(), null, 2)); setMode(e.detail.value); }} items={[{ value: "form", label: "Form" }, { value: "json", label: "JSON" }]} />}>{editing ? `Edit ${editTable}` : "Add table"}</Header>}>
      <SpaceBetween size="l">
        {mode === "json" ? (
          <Container header={<Header variant="h2" description="The TableInput structure sent to CreateTable / UpdateTable.">Table definition (JSON)</Header>}>
            <Textarea rows={26} value={json} onChange={e => setJson(e.detail.value)} spellcheck={false} />
          </Container>
        ) : <SpaceBetween size="l">
          <Container header={<Header variant="h2">Table details</Header>}>
            <SpaceBetween size="l">
              <FormField label="Name" constraintText="Lowercase letters, numbers and underscores."><Input value={f.name} disabled={editing} onChange={e => set("name")(e.detail.value.toLowerCase())} /></FormField>
              <FormField label="Database"><Select selectedOption={f.db ? opt(f.db) : null} options={dbs.data || []} disabled={editing} onChange={e => set("db")(e.detail.selectedOption.value)} placeholder="Choose a database" /></FormField>
              <FormField label="Description - optional"><Textarea value={f.desc} onChange={e => set("desc")(e.detail.value)} /></FormField>
            </SpaceBetween>
          </Container>
          <Container header={<Header variant="h2">Data store</Header>}>
            <SpaceBetween size="l">
              <FormField label="Select the type of source"><Tiles value="s3" items={[{ value: "s3", label: "S3" }, { value: "kinesis", label: "Kinesis", disabled: true }, { value: "kafka", label: "Kafka", disabled: true }]} /></FormField>
              <FormField label="Include path" description="The S3 location of the table's data, ending in a slash."><Input value={f.loc} onChange={e => set("loc")(e.detail.value)} placeholder="s3://bucket/prefix/" /></FormField>
            </SpaceBetween>
          </Container>
          <Container header={<Header variant="h2">Data format</Header>}>
            <SpaceBetween size="l">
              <Tiles columns={5} value={f.format} onChange={e => set("format")(e.detail.value)} items={Object.entries(FORMATS).map(([k, v]) => ({ value: k, label: v.label }))} />
              {f.format === "csv" && <SpaceBetween direction="horizontal" size="l">
                <FormField label="Delimiter"><Select selectedOption={opt(f.delim, { ",": "Comma (,)", "\t": "Tab (\\t)", "|": "Pipe (|)", ";": "Semicolon (;)" }[f.delim as string] || f.delim)} options={[opt(",", "Comma (,)"), opt("\t", "Tab (\\t)"), opt("|", "Pipe (|)"), opt(";", "Semicolon (;)")]} onChange={e => set("delim")(e.detail.selectedOption.value)} /></FormField>
                <FormField label="Header"><Checkbox checked={f.header} onChange={e => set("header")(e.detail.checked)}>First row is a header (skip it)</Checkbox></FormField>
              </SpaceBetween>}
            </SpaceBetween>
          </Container>
          <Container header={<Header variant="h2">Schema</Header>}>
            <SpaceBetween size="l">
              <ColumnsEditor cols={f.cols} onChange={set("cols")} label="Columns" />
              <ColumnsEditor cols={f.parts} onChange={set("parts")} label="Partition keys" />
            </SpaceBetween>
          </Container>
          <Container header={<Header variant="h2">Table properties - optional</Header>}>
            <FormField label="Properties" description="One key=value per line."><Textarea value={f.props} onChange={e => set("props")(e.detail.value)} /></FormField>
          </Container>
        </SpaceBetween>}
        <ErrorAlert error={err} />
        <Box float="right"><SpaceBetween direction="horizontal" size="xs">
          <Button variant="link" onClick={() => nav(-1)}>Cancel</Button>
          <Button variant="primary" loading={busy} disabled={mode === "form" && (!f.name || !f.db || !f.loc)} onClick={submit}>{editing ? "Save" : "Create"}</Button>
        </SpaceBetween></Box>
      </SpaceBetween>
    </ContentLayout>
  );
}

// ---------------- catalog settings ----------------
export function CatalogSettings() {
  useCrumbs(crumbs({ text: "Catalog settings" }));
  const flash = useFlash();
  const encQ = useAsync(async () => (await glue("GetDataCatalogEncryptionSettings")).DataCatalogEncryptionSettings, []);
  const pol = useAsync(async () => { try { return (await glue("GetResourcePolicy")).PolicyInJson || ""; } catch (e) { if (isNotConfigured(e) || /EntityNotFound/.test(String((e as any).code))) return ""; throw e; } }, []);
  const keys = useAsync(async () => ((await api.call("kms", "ListKeys")).Keys || []).map((k: any) => opt(k.KeyArn, k.KeyId)), []);
  const [f, setF] = useState<any>(null);
  const [policy, setPolicy] = useState<string | null>(null);
  useEffect(() => { if (encQ.data) setF({ meta: encQ.data.EncryptionAtRest?.CatalogEncryptionMode === "SSE-KMS", key: encQ.data.EncryptionAtRest?.SseAwsKmsKeyId || "", pw: !!encQ.data.ConnectionPasswordEncryption?.ReturnConnectionPasswordEncrypted, pwKey: encQ.data.ConnectionPasswordEncryption?.AwsKmsKeyId || "" }); }, [encQ.data]);
  useEffect(() => { if (pol.data !== undefined) setPolicy(pol.data); }, [pol.data]);
  const save = async () => {
    try {
      await glue("PutDataCatalogEncryptionSettings", { DataCatalogEncryptionSettings: {
        EncryptionAtRest: { CatalogEncryptionMode: f.meta ? "SSE-KMS" : "DISABLED", ...(f.meta && f.key ? { SseAwsKmsKeyId: f.key } : {}) },
        ConnectionPasswordEncryption: { ReturnConnectionPasswordEncrypted: f.pw, ...(f.pw && f.pwKey ? { AwsKmsKeyId: f.pwKey } : {}) } } });
      if (policy !== null && policy !== pol.data) {
        if (policy.trim()) await glue("PutResourcePolicy", { PolicyInJson: policy });
        else if (pol.data) await glue("DeleteResourcePolicy");
      }
      flash.notify({ type: "success", content: "Catalog settings saved." }); encQ.reload(); pol.reload();
    } catch (e) { flash.error(e, "Save failed"); }
  };
  if (!f) return <Box textAlign="center" padding="xl"><Spinner size="large" /></Box>;
  const example = JSON.stringify({ Version: "2012-10-17", Statement: [{ Effect: "Allow", Principal: { AWS: "arn:aws:iam::000000000000:root" }, Action: "glue:*", Resource: "arn:aws:glue:us-east-1:000000000000:*" }] }, null, 2);
  return (
    <ContentLayout header={<Header variant="h1" description="Data Catalog settings apply to all databases and tables in this Region.">Data catalog settings</Header>}>
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Encryption</Header>}>
          <SpaceBetween size="m">
            <Checkbox checked={f.meta} onChange={e => setF({ ...f, meta: e.detail.checked })} description="Encrypts Data Catalog objects with a KMS key.">Metadata encryption</Checkbox>
            {f.meta && <FormField label="AWS KMS key"><Select selectedOption={f.key ? opt(f.key, f.key.split("/").pop()) : null} options={keys.data || []} onChange={e => setF({ ...f, key: e.detail.selectedOption.value })} placeholder="aws/glue" /></FormField>}
            <Checkbox checked={f.pw} onChange={e => setF({ ...f, pw: e.detail.checked })} description="Connection passwords are returned encrypted by GetConnection.">Encrypt connection passwords</Checkbox>
            {f.pw && <FormField label="AWS KMS key for passwords"><Select selectedOption={f.pwKey ? opt(f.pwKey, f.pwKey.split("/").pop()) : null} options={keys.data || []} onChange={e => setF({ ...f, pwKey: e.detail.selectedOption.value })} placeholder="Choose a key" /></FormField>}
          </SpaceBetween>
        </Container>
        <Container header={<Header variant="h2" description="Controls access to the Data Catalog from other accounts and principals." actions={<Button onClick={() => setPolicy(example)}>Insert example</Button>}>Permissions</Header>}>
          <Textarea rows={12} value={policy || ""} onChange={e => setPolicy(e.detail.value)} placeholder="No resource policy" spellcheck={false} />
        </Container>
        <Box float="right"><Button variant="primary" onClick={save}>Save</Button></Box>
      </SpaceBetween>
    </ContentLayout>
  );
}
