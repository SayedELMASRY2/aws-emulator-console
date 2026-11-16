import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Table from "@cloudscape-design/components/table";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Textarea from "@cloudscape-design/components/textarea";
import Select from "@cloudscape-design/components/select";
import Multiselect from "@cloudscape-design/components/multiselect";
import Tiles from "@cloudscape-design/components/tiles";
import RadioGroup from "@cloudscape-design/components/radio-group";
import Checkbox from "@cloudscape-design/components/checkbox";
import Button from "@cloudscape-design/components/button";
import Box from "@cloudscape-design/components/box";
import Link from "@cloudscape-design/components/link";
import Spinner from "@cloudscape-design/components/spinner";
import Modal from "@cloudscape-design/components/modal";
import { useCrumbs } from "../../App";
import { api } from "../../api";
import { ErrorAlert, useAsync, useFlash, ValueWithLabel, Copyable } from "../../common";
import { useSubnets, useSgs } from "../ec2/lib";
import { ResourcePage, ActionModal } from "../ec2/ResourcePage";
import { glue, glueAll, crumbs, enc, fmt, St } from "./lib";

const V = ValueWithLabel;
const opt = (v: string, l?: string, d?: string) => ({ value: v, label: l || v, description: d });

// ---------------- connections ----------------
const CONN_TYPES = [
  { value: "JDBC", label: "JDBC", description: "MySQL, PostgreSQL, Oracle, SQL Server and other JDBC data stores" },
  { value: "MONGODB", label: "MongoDB", description: "MongoDB or Amazon DocumentDB" },
  { value: "KAFKA", label: "Kafka", description: "Apache Kafka or Amazon MSK" },
  { value: "NETWORK", label: "Network", description: "A connection to a data source in a VPC" },
  { value: "CUSTOM", label: "Custom", description: "Connector-based connection" },
];

export function Connections() {
  useCrumbs(crumbs({ text: "Connections" }));
  const flash = useFlash();
  const [del, setDel] = useState<{ rows: any[]; r: () => void } | null>(null);
  return (
    <>
      <ResourcePage<any> title="Connections" description="Connections store login credentials, URI strings and VPC information for data stores."
        load={() => glueAll("GetConnections", "ConnectionList")} trackBy="Name"
        primaryActions={[{ id: "delete", text: "Delete", run: (s, r) => setDel({ rows: s, r }) }]}
        actions={[{ id: "test", text: "Test connection", disabled: () => true, disabledReason: "TestConnection isn't implemented in the emulator.", run: () => {} }]}
        create={{ text: "Create connection", href: "#/glue/connections/create" }}
        columns={[
          { id: "n", header: "Name", cell: c => <Link href={`#/glue/connections/${enc(c.Name)}`}>{c.Name}</Link>, sortingField: "Name" },
          { id: "t", header: "Type", cell: c => c.ConnectionType },
          { id: "u", header: "URL", cell: c => c.ConnectionProperties?.JDBC_CONNECTION_URL || c.ConnectionProperties?.CONNECTION_URL || c.ConnectionProperties?.KAFKA_BOOTSTRAP_SERVERS || "-" },
          { id: "s", header: "Status", cell: c => <St s={c.Status || "READY"} /> },
          { id: "m", header: "Last modified", cell: c => fmt(c.LastUpdatedTime || c.CreationTime) },
        ]} />
      {del && <ActionModal visible danger onDismiss={() => setDel(null)} header="Delete connections" ok="Delete" onOk={async () => {
        for (const c of del.rows) await glue("DeleteConnection", { ConnectionName: c.Name });
        flash.notify({ type: "success", content: "Connection deleted." }); del.r();
      }}><Box>Delete {del.rows.map(c => c.Name).join(", ")}?</Box></ActionModal>}
    </>
  );
}

export function CreateConnection() {
  useCrumbs(crumbs({ text: "Connections", href: "#/glue/connections" }, { text: "Create connection" }));
  const nav = useNavigate();
  const flash = useFlash();
  const [f, setF] = useState<any>({ type: "JDBC", name: "", desc: "", url: "jdbc:mysql://127.0.0.1:3306/mydb", user: "", pw: "", secret: null, auth: "pw", servers: "", ssl: false, subnet: null, sgs: [] });
  const secrets = useAsync(async () => ((await api.call("secretsmanager", "ListSecrets")).SecretList || []).map((s: any) => opt(s.ARN, s.Name)), []);
  const subnets = useSubnets();
  const sgs = useSgs(f.subnet?.raw?.VpcId);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const set = (k: string) => (v: any) => setF({ ...f, [k]: v });
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const props: Record<string, string> = {};
      if (f.type === "JDBC") props.JDBC_CONNECTION_URL = f.url;
      if (f.type === "MONGODB") props.CONNECTION_URL = f.url;
      if (f.type === "KAFKA") { props.KAFKA_BOOTSTRAP_SERVERS = f.servers; props.KAFKA_SSL_ENABLED = String(f.ssl); }
      if (["JDBC", "MONGODB"].includes(f.type)) { if (f.auth === "secret" && f.secret) props.SECRET_ID = f.secret.label; else { props.USERNAME = f.user; props.PASSWORD = f.pw; } }
      if (f.type === "JDBC") props.JDBC_ENFORCE_SSL = String(f.ssl);
      await glue("CreateConnection", { ConnectionInput: { Name: f.name, ...(f.desc ? { Description: f.desc } : {}), ConnectionType: f.type, ConnectionProperties: props,
        ...(f.subnet ? { PhysicalConnectionRequirements: { SubnetId: f.subnet.value, AvailabilityZone: f.subnet.raw.AvailabilityZone, SecurityGroupIdList: f.sgs.map((s: any) => s.value) } } : {}) } });
      flash.notify({ type: "success", content: `Created connection ${f.name}.` }); nav("/glue/connections");
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <ContentLayout header={<Header variant="h1">Create connection</Header>}>
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Choose data source</Header>}><Tiles columns={3} value={f.type} onChange={e => set("type")(e.detail.value)} items={CONN_TYPES} /></Container>
        <Container header={<Header variant="h2">Configure connection</Header>}>
          <SpaceBetween size="l">
            {(f.type === "JDBC" || f.type === "MONGODB") && <FormField label={f.type === "JDBC" ? "JDBC URL" : "MongoDB URL"} constraintText={f.type === "JDBC" ? "jdbc:protocol://host:port/database. RDS databases in this console run on 127.0.0.1." : "mongodb://host:port/database"}>
              <Input value={f.url} onChange={e => set("url")(e.detail.value)} /></FormField>}
            {f.type === "KAFKA" && <FormField label="Kafka bootstrap server URLs" description="Comma-separated host:port list."><Input value={f.servers} onChange={e => set("servers")(e.detail.value)} /></FormField>}
            {(f.type === "JDBC" || f.type === "MONGODB") && <SpaceBetween size="m">
              <FormField label="Authentication"><RadioGroup value={f.auth} onChange={e => set("auth")(e.detail.value)} items={[{ value: "pw", label: "Username and password" }, { value: "secret", label: "AWS Secrets Manager" }]} /></FormField>
              {f.auth === "pw" ? <SpaceBetween direction="horizontal" size="l">
                <FormField label="Username"><Input value={f.user} onChange={e => set("user")(e.detail.value)} /></FormField>
                <FormField label="Password"><Input type="password" value={f.pw} onChange={e => set("pw")(e.detail.value)} /></FormField>
              </SpaceBetween> : <FormField label="Secret"><Select selectedOption={f.secret} options={secrets.data || []} onChange={e => set("secret")(e.detail.selectedOption)} placeholder="Choose a secret" empty="No secrets" /></FormField>}
            </SpaceBetween>}
            {f.type !== "NETWORK" && f.type !== "CUSTOM" && <Checkbox checked={f.ssl} onChange={e => set("ssl")(e.detail.checked)}>Require SSL connection</Checkbox>}
            <ColumnLayout columns={2}>
              <FormField label="Subnet - optional"><Select selectedOption={f.subnet} options={subnets.data || []} onChange={e => setF({ ...f, subnet: e.detail.selectedOption, sgs: [] })} placeholder="Choose a subnet" /></FormField>
              <FormField label="Security groups"><Multiselect selectedOptions={f.sgs} options={sgs.data || []} onChange={e => set("sgs")(e.detail.selectedOptions)} disabled={!f.subnet} placeholder="Choose security groups" /></FormField>
            </ColumnLayout>
          </SpaceBetween>
        </Container>
        <Container header={<Header variant="h2">Set properties</Header>}>
          <SpaceBetween size="l">
            <FormField label="Name"><Input value={f.name} onChange={e => set("name")(e.detail.value)} /></FormField>
            <FormField label="Description - optional"><Textarea value={f.desc} onChange={e => set("desc")(e.detail.value)} /></FormField>
          </SpaceBetween>
        </Container>
        <ErrorAlert error={err} />
        <Box float="right"><SpaceBetween direction="horizontal" size="xs">
          <Button variant="link" onClick={() => nav(-1)}>Cancel</Button>
          <Button variant="primary" loading={busy} disabled={!f.name} onClick={submit}>Create connection</Button>
        </SpaceBetween></Box>
      </SpaceBetween>
    </ContentLayout>
  );
}

export function ConnectionDetail() {
  const { name = "" } = useParams();
  useCrumbs(crumbs({ text: "Connections", href: "#/glue/connections" }, { text: name }));
  const d = useAsync(async () => (await glue("GetConnection", { Name: name, HidePassword: true })).Connection, [name]);
  if (d.error) return <ErrorAlert error={d.error} />;
  if (!d.data) return <Box textAlign="center" padding="xl"><Spinner size="large" /></Box>;
  const c = d.data;
  return (
    <ContentLayout header={<Header variant="h1">{name}</Header>}>
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Connection details</Header>}>
          <ColumnLayout columns={3} variant="text-grid">
            <V label="Name">{c.Name}</V><V label="Type">{c.ConnectionType}</V><V label="Description">{c.Description || "-"}</V>
            <V label="Subnet">{c.PhysicalConnectionRequirements?.SubnetId || "-"}</V><V label="Security groups">{(c.PhysicalConnectionRequirements?.SecurityGroupIdList || []).join(", ") || "-"}</V>
            <V label="Availability Zone">{c.PhysicalConnectionRequirements?.AvailabilityZone || "-"}</V><V label="Created">{fmt(c.CreationTime)}</V><V label="Last modified">{fmt(c.LastUpdatedTime)}</V>
          </ColumnLayout>
        </Container>
        <Table variant="container" header={<Header variant="h2">Connection properties</Header>}
          items={Object.entries(c.ConnectionProperties || {}).map(([k, v]) => ({ k, v: k === "PASSWORD" ? "****" : v }))}
          columnDefinitions={[{ id: "k", header: "Key", cell: (x: any) => x.k }, { id: "v", header: "Value", cell: (x: any) => String(x.v) }]} />
      </SpaceBetween>
    </ContentLayout>
  );
}

// ---------------- classifiers ----------------
const kindOf = (c: any) => c.CsvClassifier ? "CSV" : c.JsonClassifier ? "JSON" : c.XMLClassifier ? "XML" : c.GrokClassifier ? "Grok" : "-";
const inner = (c: any) => c.CsvClassifier || c.JsonClassifier || c.XMLClassifier || c.GrokClassifier || {};
export function Classifiers() {
  useCrumbs(crumbs({ text: "Classifiers" }));
  const flash = useFlash();
  const [m, setM] = useState<{ id: string; rows: any[]; r: () => void } | null>(null);
  const [f, setF] = useState<any>({ name: "", type: "csv", delim: ",", quote: "\"", header: "PRESENT", headers: "", jsonPath: "$[*]", rowTag: "", grokClass: "", pattern: "", custom: "" });
  const set = (k: string) => (v: any) => setF({ ...f, [k]: v });
  return (
    <>
      <ResourcePage<any> title="Classifiers" description="A classifier reads data in a data store and gives the crawler its schema and format."
        load={() => glueAll("GetClassifiers", "Classifiers")} trackBy={c => inner(c).Name}
        primaryActions={[{ id: "delete", text: "Delete", run: (s, r) => setM({ id: "delete", rows: s, r }) }]}
        create={{ text: "Add classifier", onClick: r => setM({ id: "create", rows: [], r }) }}
        columns={[
          { id: "n", header: "Name", cell: c => inner(c).Name },
          { id: "t", header: "Type", cell: c => kindOf(c) },
          { id: "d", header: "Details", cell: c => c.CsvClassifier ? `delimiter "${c.CsvClassifier.Delimiter}", header ${c.CsvClassifier.ContainsHeader}` : c.JsonClassifier ? c.JsonClassifier.JsonPath : c.XMLClassifier ? `<${c.XMLClassifier.RowTag}>` : c.GrokClassifier ? c.GrokClassifier.GrokPattern : "-" },
          { id: "c", header: "Created", cell: c => fmt(inner(c).CreationTime) },
          { id: "v", header: "Version", cell: c => inner(c).Version ?? "-" },
        ]} />
      {m?.id === "create" && <ActionModal visible size="medium" onDismiss={() => setM(null)} header="Add classifier" ok="Create" disabled={!f.name} onOk={async () => {
        const p: any = f.type === "csv" ? { CsvClassifier: { Name: f.name, Delimiter: f.delim, QuoteSymbol: f.quote, ContainsHeader: f.header, ...(f.headers ? { Header: f.headers.split(",").map((x: string) => x.trim()) } : {}) } }
          : f.type === "json" ? { JsonClassifier: { Name: f.name, JsonPath: f.jsonPath } }
          : f.type === "xml" ? { XMLClassifier: { Name: f.name, Classification: "xml", RowTag: f.rowTag } }
          : { GrokClassifier: { Name: f.name, Classification: f.grokClass, GrokPattern: f.pattern, ...(f.custom ? { CustomPatterns: f.custom } : {}) } };
        await glue("CreateClassifier", p); flash.notify({ type: "success", content: `Created classifier ${f.name}.` }); m.r();
      }}>
        <FormField label="Classifier name"><Input value={f.name} onChange={e => set("name")(e.detail.value)} /></FormField>
        <FormField label="Classifier type"><Tiles columns={4} value={f.type} onChange={e => set("type")(e.detail.value)} items={[{ value: "grok", label: "Grok" }, { value: "xml", label: "XML" }, { value: "json", label: "JSON" }, { value: "csv", label: "CSV" }]} /></FormField>
        {f.type === "csv" && <SpaceBetween size="m">
          <FormField label="Column delimiter"><Select selectedOption={opt(f.delim, f.delim === "\t" ? "Tab" : f.delim)} options={[opt(","), opt(";"), opt("|"), opt("\t", "Tab")]} onChange={e => set("delim")(e.detail.selectedOption.value)} /></FormField>
          <FormField label="Quote symbol"><Select selectedOption={opt(f.quote)} options={[opt("\""), opt("'")]} onChange={e => set("quote")(e.detail.selectedOption.value)} /></FormField>
          <FormField label="Column headings"><RadioGroup value={f.header} onChange={e => set("header")(e.detail.value)} items={[{ value: "UNKNOWN", label: "Detect headings" }, { value: "PRESENT", label: "Has headings" }, { value: "ABSENT", label: "No headings" }]} /></FormField>
          <FormField label="Custom headings - optional" description="Comma-separated column names."><Input value={f.headers} onChange={e => set("headers")(e.detail.value)} /></FormField>
        </SpaceBetween>}
        {f.type === "json" && <FormField label="JSON path"><Input value={f.jsonPath} onChange={e => set("jsonPath")(e.detail.value)} /></FormField>}
        {f.type === "xml" && <FormField label="Row tag"><Input value={f.rowTag} onChange={e => set("rowTag")(e.detail.value)} placeholder="record" /></FormField>}
        {f.type === "grok" && <SpaceBetween size="m">
          <FormField label="Classification"><Input value={f.grokClass} onChange={e => set("grokClass")(e.detail.value)} placeholder="apache-log" /></FormField>
          <FormField label="Grok pattern"><Input value={f.pattern} onChange={e => set("pattern")(e.detail.value)} placeholder="%{COMBINEDAPACHELOG}" /></FormField>
          <FormField label="Custom patterns - optional"><Textarea value={f.custom} onChange={e => set("custom")(e.detail.value)} /></FormField>
        </SpaceBetween>}
      </ActionModal>}
      {m?.id === "delete" && <ActionModal visible danger onDismiss={() => setM(null)} header="Delete classifiers" ok="Delete" onOk={async () => {
        for (const c of m.rows) await glue("DeleteClassifier", { Name: inner(c).Name });
        flash.notify({ type: "success", content: "Classifier deleted." }); m.r();
      }}><Box>Delete {m.rows.map(c => inner(c).Name).join(", ")}?</Box></ActionModal>}
    </>
  );
}

// ---------------- schema registries ----------------
export function Registries() {
  useCrumbs(crumbs({ text: "Stream schema registries" }));
  const flash = useFlash();
  const [m, setM] = useState<{ id: string; rows: any[]; r: () => void } | null>(null);
  const [f, setF] = useState({ name: "", desc: "" });
  return (
    <>
      <ResourcePage<any> title="Schema registries" description="A registry is a logical container of schemas for streaming data."
        load={() => glueAll("ListRegistries", "Registries")} trackBy="RegistryName"
        primaryActions={[{ id: "delete", text: "Delete", disabled: () => true, disabledReason: "DeleteRegistry isn't implemented in the emulator.", run: (s, r) => setM({ id: "delete", rows: s, r }) }]}
        create={{ text: "Add registry", onClick: r => setM({ id: "create", rows: [], r }) }}
        columns={[
          { id: "n", header: "Registry name", cell: x => <Link href={`#/glue/registries/${enc(x.RegistryName)}`}>{x.RegistryName}</Link> },
          { id: "d", header: "Description", cell: x => x.Description || "-" },
          { id: "s", header: "Status", cell: x => <St s={x.Status} /> },
          { id: "c", header: "Created", cell: x => fmt(x.CreatedTime) },
        ]} />
      {m?.id === "create" && <ActionModal visible onDismiss={() => setM(null)} header="Add a new registry" ok="Add registry" disabled={!f.name} onOk={async () => {
        await glue("CreateRegistry", { RegistryName: f.name, ...(f.desc ? { Description: f.desc } : {}) }); flash.notify({ type: "success", content: `Created registry ${f.name}.` }); m.r();
      }}>
        <FormField label="Registry name"><Input value={f.name} onChange={e => setF({ ...f, name: e.detail.value })} /></FormField>
        <FormField label="Description - optional"><Textarea value={f.desc} onChange={e => setF({ ...f, desc: e.detail.value })} /></FormField>
      </ActionModal>}
      {m?.id === "delete" && <ActionModal visible danger onDismiss={() => setM(null)} header="Delete registries" ok="Delete" onOk={async () => {
        for (const x of m.rows) await glue("DeleteRegistry", { RegistryId: { RegistryName: x.RegistryName } });
        flash.notify({ type: "success", content: "Registry deleted." }); m.r();
      }}><Box>Delete {m.rows.map(x => x.RegistryName).join(", ")} and all of its schemas?</Box></ActionModal>}
    </>
  );
}

const AVRO_EXAMPLE = JSON.stringify({ type: "record", namespace: "example", name: "Order", fields: [{ name: "id", type: "string" }, { name: "amount", type: "double" }] }, null, 2);
export function RegistryDetail() {
  const { name = "" } = useParams();
  const flash = useFlash();
  useCrumbs(crumbs({ text: "Stream schema registries", href: "#/glue/registries" }, { text: name }));
  const reg = useAsync(async () => glue("GetRegistry", { RegistryId: { RegistryName: name } }), [name]);
  const [known, setKnown] = useState<string[]>(() => JSON.parse(localStorage.getItem(`glue-schemas:${name}`) || "[]"));
  const remember = (l: string[]) => { setKnown(l); localStorage.setItem(`glue-schemas:${name}`, JSON.stringify(l)); };
  const schemas = useAsync(async () => (await Promise.all(known.map(s => glue("GetSchema", { SchemaId: { RegistryName: name, SchemaName: s } }).catch(() => null)))).filter(Boolean), [known.join()]);
  const [create, setCreate] = useState(false);
  const [lookup, setLookup] = useState("");
  const [f, setF] = useState({ name: "", format: "AVRO", compat: "BACKWARD", def: AVRO_EXAMPLE, desc: "" });
  const [ver, setVer] = useState<any>(null);
  const [newVer, setNewVer] = useState<{ s: string; def: string } | null>(null);
  const versions = useAsync(async () => ver ? (await glue("ListSchemaVersions", { SchemaId: { RegistryName: name, SchemaName: ver } })).Schemas || [] : [], [ver]);
  const [shown, setShown] = useState<string | null>(null);
  const shownDef = useAsync(async () => shown ? (await glue("GetSchemaVersion", { SchemaVersionId: shown })).SchemaDefinition : null, [shown]);
  if (reg.error) return <ErrorAlert error={reg.error} />;
  if (!reg.data) return <Box textAlign="center" padding="xl"><Spinner size="large" /></Box>;
  return (
    <ContentLayout header={<Header variant="h1">{name}</Header>}>
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Registry details</Header>}>
          <ColumnLayout columns={3} variant="text-grid"><V label="ARN"><Copyable text={reg.data.RegistryArn} /></V><V label="Description">{reg.data.Description || "-"}</V><V label="Status"><St s={reg.data.Status} /></V></ColumnLayout>
        </Container>
        <Table variant="container" items={schemas.data || []} loading={schemas.loading}
          header={<Header variant="h2" counter={`(${schemas.data?.length || 0})`} description="ListSchemas isn't implemented in the emulator, so this list shows schemas created or looked up from this browser."
            actions={<SpaceBetween direction="horizontal" size="xs">
              <Input value={lookup} onChange={e => setLookup(e.detail.value)} placeholder="Schema name" />
              <Button disabled={!lookup} onClick={async () => { try { await glue("GetSchema", { SchemaId: { RegistryName: name, SchemaName: lookup } }); remember([...new Set([...known, lookup])]); setLookup(""); } catch (e) { flash.error(e, "Schema not found"); } }}>Look up</Button>
              <Button variant="primary" onClick={() => setCreate(true)}>Add schema</Button>
            </SpaceBetween>}>Schemas</Header>}
          empty={<Box color="text-body-secondary">No schemas shown.</Box>}
          columnDefinitions={[
            { id: "n", header: "Schema name", cell: (s: any) => s.SchemaName }, { id: "f", header: "Data format", cell: (s: any) => s.DataFormat },
            { id: "c", header: "Compatibility", cell: (s: any) => s.Compatibility }, { id: "l", header: "Latest version", cell: (s: any) => s.LatestSchemaVersion },
            { id: "s", header: "Status", cell: (s: any) => <St s={s.SchemaStatus} /> },
            { id: "a", header: "", cell: (s: any) => <SpaceBetween direction="horizontal" size="xs">
              <Button variant="inline-link" onClick={() => setVer(s.SchemaName)}>Versions</Button>
              <Button variant="inline-link" onClick={() => setNewVer({ s: s.SchemaName, def: "" })}>Register version</Button>
              <Button variant="inline-link" disabled disabledReason="DeleteSchema isn't implemented in the emulator." onClick={async () => { try { await glue("DeleteSchema", { SchemaId: { RegistryName: name, SchemaName: s.SchemaName } }); remember(known.filter(k => k !== s.SchemaName)); } catch (e) { flash.error(e, "Delete failed"); } }}>Delete</Button>
            </SpaceBetween> },
          ]} />
      </SpaceBetween>
      {create && <ActionModal visible size="large" onDismiss={() => setCreate(false)} header="Add a new schema" ok="Create schema" disabled={!f.name} onOk={async () => {
        await glue("CreateSchema", { RegistryId: { RegistryName: name }, SchemaName: f.name, DataFormat: f.format, Compatibility: f.compat, SchemaDefinition: f.def, ...(f.desc ? { Description: f.desc } : {}) });
        remember([...new Set([...known, f.name])]); flash.notify({ type: "success", content: `Created schema ${f.name}.` });
      }}>
        <FormField label="Schema name"><Input value={f.name} onChange={e => setF({ ...f, name: e.detail.value })} /></FormField>
        <ColumnLayout columns={2}>
          <FormField label="Data format"><Select selectedOption={opt(f.format)} options={["AVRO", "JSON", "PROTOBUF"].map(x => opt(x))} onChange={e => setF({ ...f, format: e.detail.selectedOption.value! })} /></FormField>
          <FormField label="Compatibility mode"><Select selectedOption={opt(f.compat)} options={["NONE", "DISABLED", "BACKWARD", "BACKWARD_ALL", "FORWARD", "FORWARD_ALL", "FULL", "FULL_ALL"].map(x => opt(x))} onChange={e => setF({ ...f, compat: e.detail.selectedOption.value! })} /></FormField>
        </ColumnLayout>
        <FormField label="First schema version"><Textarea rows={12} value={f.def} onChange={e => setF({ ...f, def: e.detail.value })} spellcheck={false} /></FormField>
      </ActionModal>}
      {newVer && <ActionModal visible size="large" onDismiss={() => setNewVer(null)} header={`Register a new version of ${newVer.s}`} ok="Register version" disabled={!newVer.def} onOk={async () => {
        const r = await glue("RegisterSchemaVersion", { SchemaId: { RegistryName: name, SchemaName: newVer.s }, SchemaDefinition: newVer.def });
        flash.notify({ type: r.Status === "FAILURE" ? "error" : "success", content: `Version ${r.VersionNumber}: ${r.Status}` }); schemas.reload();
      }}><Textarea rows={14} value={newVer.def} onChange={e => setNewVer({ ...newVer, def: e.detail.value })} spellcheck={false} placeholder="Schema definition" /></ActionModal>}
      <Modal visible={!!ver} onDismiss={() => { setVer(null); setShown(null); }} size="large" header={`Versions of ${ver}`}>
        <SpaceBetween size="m">
          <Table variant="embedded" items={versions.data || []} loading={versions.loading} columnDefinitions={[
            { id: "v", header: "Version", cell: (x: any) => x.VersionNumber }, { id: "s", header: "Status", cell: (x: any) => <St s={x.Status} /> },
            { id: "c", header: "Created", cell: (x: any) => fmt(x.CreatedTime) }, { id: "d", header: "", cell: (x: any) => <Button variant="inline-link" onClick={() => setShown(x.SchemaVersionId)}>Show definition</Button> },
          ]} />
          {shown && <pre style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>{shownDef.loading ? "Loading…" : (() => { try { return JSON.stringify(JSON.parse(shownDef.data), null, 2); } catch { return shownDef.data; } })()}</pre>}
        </SpaceBetween>
      </Modal>
    </ContentLayout>
  );
}
