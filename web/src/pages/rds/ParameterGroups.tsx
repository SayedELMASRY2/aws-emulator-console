import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useCollection } from "@cloudscape-design/collection-hooks";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import SpaceBetween from "@cloudscape-design/components/space-between";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Select from "@cloudscape-design/components/select";
import Tiles from "@cloudscape-design/components/tiles";
import RadioGroup from "@cloudscape-design/components/radio-group";
import Button from "@cloudscape-design/components/button";
import ButtonDropdown from "@cloudscape-design/components/button-dropdown";
import Box from "@cloudscape-design/components/box";
import Link from "@cloudscape-design/components/link";
import Table from "@cloudscape-design/components/table";
import TextFilter from "@cloudscape-design/components/text-filter";
import Pagination from "@cloudscape-design/components/pagination";
import Spinner from "@cloudscape-design/components/spinner";
import Alert from "@cloudscape-design/components/alert";
import { useCrumbs } from "../../App";
import { ErrorAlert, useAsync, useFlash, ValueWithLabel, Copyable } from "../../common";
import { ResourcePage, ActionModal } from "../ec2/ResourcePage";
import { rds, rdsAll, crumbs, ENGINES } from "./lib";
import { TagsTab } from "./DatabaseDetail";

type PG = { kind: "db" | "cluster"; name: string; raw: any };
const pgHref = (g: PG) => `#/rds/parameter-groups/${g.kind}/${encodeURIComponent(g.name)}`;
const opt = (v: string, l?: string, d?: string) => ({ value: v, label: l || v, description: d });

async function loadPgs(): Promise<PG[]> {
  const [a, b] = await Promise.all([rdsAll("DescribeDBParameterGroups", "DBParameterGroups"), rdsAll("DescribeDBClusterParameterGroups", "DBClusterParameterGroups")]);
  return [...a.map((g: any) => ({ kind: "db" as const, name: g.DBParameterGroupName, raw: g })), ...b.map((g: any) => ({ kind: "cluster" as const, name: g.DBClusterParameterGroupName, raw: g }))];
}

export function ParameterGroups() {
  useCrumbs(crumbs({ text: "Parameter groups" }));
  const nav = useNavigate();
  const flash = useFlash();
  const [m, setM] = useState<{ id: string; g: PG[]; r: () => void } | null>(null);
  const custom = (s: PG[]) => !s.length || s.some(g => g.name.startsWith("default."));
  return (
    <>
      <ResourcePage<PG> title="Parameter groups" load={loadPgs} trackBy={g => `${g.kind}:${g.name}`}
        actions={[
          { id: "edit", text: "Edit", disabled: s => s.length !== 1 || custom(s), disabledReason: "Default parameter groups can't be modified.", run: s => nav(pgHref(s[0]).slice(1) + "?edit=1") },
          { id: "copy", text: "Copy", disabled: s => s.length !== 1, run: (s, r) => setM({ id: "copy", g: s, r }) },
          { id: "delete", text: "Delete", disabled: custom, disabledReason: "Default parameter groups can't be deleted.", run: (s, r) => setM({ id: "delete", g: s, r }) },
        ]}
        create={{ text: "Create parameter group", href: "#/rds/parameter-groups/create" }}
        columns={[
          { id: "n", header: "Name", cell: g => <Link href={pgHref(g)}>{g.name}</Link>, sortingField: "name" },
          { id: "f", header: "Family", cell: g => g.raw.DBParameterGroupFamily },
          { id: "t", header: "Type", cell: g => g.kind === "cluster" ? "DB cluster parameter group" : "DB parameter group" },
          { id: "d", header: "Description", cell: g => g.raw.Description },
        ]} />
      {m?.id === "copy" && <CopyPg g={m.g[0]} close={() => setM(null)} done={() => { setM(null); m.r(); }} />}
      {m?.id === "delete" && <ActionModal visible danger onDismiss={() => setM(null)} header="Delete parameter groups" ok="Delete" onOk={async () => {
        for (const g of m.g) await rds(g.kind === "cluster" ? "DeleteDBClusterParameterGroup" : "DeleteDBParameterGroup", g.kind === "cluster" ? { DBClusterParameterGroupName: g.name } : { DBParameterGroupName: g.name });
        flash.notify({ type: "success", content: `Deleted ${m.g.map(g => g.name).join(", ")}.` }); m.r();
      }}><Box>Are you sure you want to delete {m.g.map(g => <b key={g.name}>{g.name} </b>)}?</Box></ActionModal>}
    </>
  );
}

function CopyPg({ g, close, done }: { g: PG; close: () => void; done: () => void }) {
  const flash = useFlash();
  const [name, setName] = useState(`${g.name.replace(/^default\./, "")}-copy`);
  const [desc, setDesc] = useState(`Copy of ${g.name}`);
  return (
    <ActionModal visible onDismiss={close} header="Copy parameter group" ok="Create" disabled={!name || !desc} onOk={async () => {
      if (g.kind === "cluster") await rds("CopyDBClusterParameterGroup", { SourceDBClusterParameterGroupIdentifier: g.name, TargetDBClusterParameterGroupIdentifier: name, TargetDBClusterParameterGroupDescription: desc });
      else await rds("CopyDBParameterGroup", { SourceDBParameterGroupIdentifier: g.name, TargetDBParameterGroupIdentifier: name, TargetDBParameterGroupDescription: desc });
      flash.notify({ type: "success", content: `Created ${name}.` }); done();
    }}>
      <FormField label="New DB parameter group identifier"><Input value={name} onChange={e => setName(e.detail.value)} /></FormField>
      <FormField label="Description"><Input value={desc} onChange={e => setDesc(e.detail.value)} /></FormField>
    </ActionModal>
  );
}

export function CreateParameterGroup() {
  useCrumbs(crumbs({ text: "Parameter groups", href: "#/rds/parameter-groups" }, { text: "Create parameter group" }));
  const nav = useNavigate();
  const flash = useFlash();
  const [engine, setEngine] = useState<any>(opt("mysql", "MySQL Community"));
  const vers = useAsync(async () => rdsAll("DescribeDBEngineVersions", "DBEngineVersions", { Engine: engine.value }), [engine.value]);
  const families = useMemo(() => [...new Set((vers.data || []).map((v: any) => v.DBParameterGroupFamily as string))].filter(Boolean).map(f => opt(f)), [vers.data]);
  const [family, setFamily] = useState<any>(null);
  const [type, setType] = useState("db");
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const aurora = engine.value.startsWith("aurora");
  const fam = family && families.some(f => f.value === family.value) ? family : families[families.length - 1] || null;
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      if (type === "cluster") await rds("CreateDBClusterParameterGroup", { DBClusterParameterGroupName: name, DBParameterGroupFamily: fam.value, Description: desc });
      else await rds("CreateDBParameterGroup", { DBParameterGroupName: name, DBParameterGroupFamily: fam.value, Description: desc });
      flash.notify({ type: "success", content: `Successfully created ${name}.` });
      nav("/rds/parameter-groups");
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const engineOpts = [...ENGINES.flatMap(e => e.editions ? e.editions.map(x => opt(x.value, x.label)) : [opt(e.key, e.label)])];
  return (
    <ContentLayout header={<Header variant="h1" description="To create a parameter group, choose a parameter group family, then name and describe your parameter group.">Create parameter group</Header>}>
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Parameter group details</Header>}>
          <SpaceBetween size="l">
            <FormField label="Parameter group name" constraintText="Must begin with a letter. 1 to 255 letters, numbers or hyphens."><Input value={name} onChange={e => setName(e.detail.value)} /></FormField>
            <FormField label="Description"><Input value={desc} onChange={e => setDesc(e.detail.value)} /></FormField>
            <FormField label="Engine type"><Select selectedOption={engine} options={engineOpts} onChange={e => { setEngine(e.detail.selectedOption); setFamily(null); if (!e.detail.selectedOption.value!.startsWith("aurora")) setType("db"); }} /></FormField>
            <FormField label="Parameter group family"><Select selectedOption={fam} options={families} onChange={e => setFamily(e.detail.selectedOption)} statusType={vers.loading ? "loading" : "finished"} /></FormField>
            <FormField label="Type">
              <Tiles value={type} onChange={e => setType(e.detail.value)} items={[
                { value: "db", label: "DB Parameter Group", description: "Applies to DB instances." },
                { value: "cluster", label: "DB Cluster Parameter Group", description: "Applies to every DB instance in a cluster.", disabled: !aurora && !["mysql", "postgres"].includes(engine.value) },
              ]} />
            </FormField>
          </SpaceBetween>
        </Container>
        <ErrorAlert error={err} />
        <Box float="right"><SpaceBetween direction="horizontal" size="xs">
          <Button variant="link" onClick={() => nav(-1)}>Cancel</Button>
          <Button variant="primary" loading={busy} disabled={!name || !desc || !fam} onClick={submit}>Create</Button>
        </SpaceBetween></Box>
      </SpaceBetween>
    </ContentLayout>
  );
}

export function ParameterGroupDetail() {
  const { kind = "db", name = "" } = useParams();
  const flash = useFlash();
  const isCluster = kind === "cluster";
  useCrumbs(crumbs({ text: "Parameter groups", href: "#/rds/parameter-groups" }, { text: name }));
  const meta = useAsync(async () => isCluster
    ? (await rds("DescribeDBClusterParameterGroups", { DBClusterParameterGroupName: name })).DBClusterParameterGroups[0]
    : (await rds("DescribeDBParameterGroups", { DBParameterGroupName: name })).DBParameterGroups[0], [kind, name]);
  const params = useAsync(() => isCluster ? rdsAll("DescribeDBClusterParameters", "Parameters", { DBClusterParameterGroupName: name, MaxRecords: 100 })
    : rdsAll("DescribeDBParameters", "Parameters", { DBParameterGroupName: name, MaxRecords: 100 }), [kind, name]);
  const [edit, setEdit] = useState(new URLSearchParams(location.hash.split("?")[1] || "").get("edit") === "1");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [sel, setSel] = useState<any[]>([]);
  const [reset, setReset] = useState(false);
  const [busy, setBusy] = useState(false);
  const isDefault = name.startsWith("default.");
  const { items, filterProps, paginationProps, collectionProps, filteredItemsCount } = useCollection(params.data || [], {
    filtering: { filteringFunction: (p: any, t) => `${p.ParameterName} ${p.ParameterValue || ""} ${p.Description || ""}`.toLowerCase().includes(t.toLowerCase()) },
    pagination: { pageSize: 50 }, sorting: {},
  });
  const save = async () => {
    setBusy(true);
    try {
      const changed = Object.entries(draft).filter(([k, v]) => (params.data || []).find((p: any) => p.ParameterName === k)?.ParameterValue !== v);
      const list = changed.map(([k, v]) => { const p = params.data!.find((x: any) => x.ParameterName === k); return { ParameterName: k, ParameterValue: v, ApplyMethod: p?.ApplyType === "static" ? "pending-reboot" : "immediate" }; });
      for (let k = 0; k < list.length; k += 20) {
        const chunk = list.slice(k, k + 20);
        if (isCluster) await rds("ModifyDBClusterParameterGroup", { DBClusterParameterGroupName: name, Parameters: chunk });
        else await rds("ModifyDBParameterGroup", { DBParameterGroupName: name, Parameters: chunk });
      }
      flash.notify({ type: "success", content: list.length ? `Modified ${list.length} parameter(s) in ${name}.` : "No parameters were changed." });
      setEdit(false); setDraft({}); params.reload();
    } catch (e) { flash.error(e, "Save failed"); } finally { setBusy(false); }
  };
  if (meta.error) return <ErrorAlert error={meta.error} />;
  const g = meta.data;
  const V = ValueWithLabel;
  const parn = g?.DBParameterGroupArn || g?.DBClusterParameterGroupArn;
  return (
    <ContentLayout header={<Header variant="h1">{name}</Header>}>
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Parameter group details</Header>}>
          {g ? <ColumnLayout columns={4} variant="text-grid">
            <V label="Parameter group name">{name}</V><V label="Description">{g.Description}</V><V label="Family">{g.DBParameterGroupFamily}</V>
            <V label="Type">{isCluster ? "DB cluster parameter group" : "DB parameter group"}</V><V label="ARN"><Copyable text={parn} /></V>
          </ColumnLayout> : <Spinner />}
        </Container>
        {isDefault && <Alert type="info">Default parameter groups can't be modified. Copy this group or create a new one to change parameter values.</Alert>}
        <Table {...collectionProps} variant="container" resizableColumns items={items} loading={params.loading} loadingText="Loading parameters" trackBy="ParameterName"
          selectionType={edit || isDefault ? undefined : "multi"} selectedItems={sel} onSelectionChange={e => setSel(e.detail.selectedItems)}
          header={<Header variant="h2" counter={`(${params.data?.length || 0})`} actions={edit
            ? <SpaceBetween direction="horizontal" size="xs"><Button onClick={() => { setEdit(false); setDraft({}); }}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save changes</Button></SpaceBetween>
            : <SpaceBetween direction="horizontal" size="xs">
                <Button iconName="refresh" ariaLabel="Refresh" onClick={() => params.reload()} />
                <Button disabled={isDefault || !sel.length} onClick={() => setReset(true)}>Reset</Button>
                <Button disabled={isDefault} onClick={() => setEdit(true)}>Edit</Button>
              </SpaceBetween>}>Parameters</Header>}
          filter={<TextFilter {...filterProps} filteringPlaceholder="Filter parameters" countText={`${filteredItemsCount} matches`} />}
          pagination={<Pagination {...paginationProps} />}
          columnDefinitions={[
            { id: "n", header: "Name", cell: (p: any) => p.ParameterName, sortingField: "ParameterName", width: 260 },
            { id: "v", header: "Value", width: 200, cell: (p: any) => edit && p.IsModifiable
              ? (p.AllowedValues && /^[^-]+(,[^,]+)+$/.test(p.AllowedValues) && !/\d+-\d+/.test(p.AllowedValues)
                ? <Select selectedOption={opt(draft[p.ParameterName] ?? p.ParameterValue ?? "", draft[p.ParameterName] ?? p.ParameterValue ?? "(engine default)")} options={["", ...p.AllowedValues.split(",")].map((x: string) => opt(x, x || "(engine default)"))} onChange={e => setDraft({ ...draft, [p.ParameterName]: e.detail.selectedOption.value! })} />
                : <Input value={draft[p.ParameterName] ?? p.ParameterValue ?? ""} placeholder="engine-default" onChange={e => setDraft({ ...draft, [p.ParameterName]: e.detail.value })} />)
              : p.ParameterValue ?? <Box color="text-body-secondary">engine-default</Box> },
            { id: "a", header: "Allowed values", cell: (p: any) => p.AllowedValues || "-" },
            { id: "m", header: "Modifiable", cell: (p: any) => p.IsModifiable ? "true" : "false" },
            { id: "s", header: "Source", cell: (p: any) => p.Source },
            { id: "t", header: "Apply type", cell: (p: any) => p.ApplyType },
            { id: "d", header: "Data type", cell: (p: any) => p.DataType },
            { id: "desc", header: "Description", cell: (p: any) => p.Description },
          ]} />
        {parn && <TagsTab arnStr={parn} />}
      </SpaceBetween>
      {reset && <ActionModal visible onDismiss={() => setReset(false)} header="Reset parameters" ok="Reset" onOk={async () => {
        const ps = sel.map(p => ({ ParameterName: p.ParameterName, ApplyMethod: p.ApplyType === "static" ? "pending-reboot" : "immediate" }));
        if (isCluster) await rds("ResetDBClusterParameterGroup", { DBClusterParameterGroupName: name, Parameters: ps });
        else await rds("ResetDBParameterGroup", { DBParameterGroupName: name, Parameters: ps });
        flash.notify({ type: "success", content: `Reset ${ps.length} parameter(s).` }); setSel([]); params.reload();
      }}><Box>Reset {sel.map(p => p.ParameterName).join(", ")} to the engine default values?</Box></ActionModal>}
    </ContentLayout>
  );
}

// ---------------- option groups ----------------
export function OptionGroups() {
  useCrumbs(crumbs({ text: "Option groups" }));
  const flash = useFlash();
  const [del, setDel] = useState<{ g: any[]; r: () => void } | null>(null);
  return (
    <>
      <ResourcePage<any> title="Option groups" load={() => rdsAll("DescribeOptionGroups", "OptionGroupsList")} trackBy="OptionGroupName"
        primaryActions={[{ id: "delete", text: "Delete", disabled: s => !s.length || s.some(g => g.OptionGroupName.startsWith("default:")), run: (s, r) => setDel({ g: s, r }) }]}
        create={{ text: "Create group", href: "#/rds/option-groups/create" }}
        columns={[
          { id: "n", header: "Name", cell: g => <Link href={`#/rds/option-groups/${encodeURIComponent(g.OptionGroupName)}`}>{g.OptionGroupName}</Link>, sortingField: "OptionGroupName" },
          { id: "d", header: "Description", cell: g => g.OptionGroupDescription },
          { id: "e", header: "Engine", cell: g => g.EngineName },
          { id: "v", header: "Major engine version", cell: g => g.MajorEngineVersion },
          { id: "o", header: "Options", cell: g => (g.Options || []).length },
        ]} />
      {del && <ActionModal visible danger onDismiss={() => setDel(null)} header="Delete option groups" ok="Delete" onOk={async () => {
        for (const g of del.g) await rds("DeleteOptionGroup", { OptionGroupName: g.OptionGroupName });
        flash.notify({ type: "success", content: "Option group deleted." }); del.r();
      }}><Box>Delete {del.g.map(g => g.OptionGroupName).join(", ")}?</Box></ActionModal>}
    </>
  );
}

export function CreateOptionGroup() {
  useCrumbs(crumbs({ text: "Option groups", href: "#/rds/option-groups" }, { text: "Create option group" }));
  const nav = useNavigate();
  const flash = useFlash();
  const [f, setF] = useState<any>({ name: "", desc: "", engine: opt("mysql"), major: null });
  const vers = useAsync(async () => rdsAll("DescribeDBEngineVersions", "DBEngineVersions", { Engine: f.engine.value }), [f.engine.value]);
  const majors = [...new Set((vers.data || []).map((v: any) => v.MajorEngineVersion as string))].map(x => opt(x));
  const major = f.major && majors.some(m => m.value === f.major.value) ? f.major : majors[majors.length - 1] || null;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      await rds("CreateOptionGroup", { OptionGroupName: f.name, OptionGroupDescription: f.desc, EngineName: f.engine.value, MajorEngineVersion: major.value });
      flash.notify({ type: "success", content: `Created option group ${f.name}.` }); nav("/rds/option-groups");
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const engines = ["mysql", "mariadb", "postgres", "oracle-ee", "oracle-se2", "sqlserver-ex", "sqlserver-web", "sqlserver-se", "sqlserver-ee", "db2-se", "db2-ae"].map(e => opt(e));
  return (
    <ContentLayout header={<Header variant="h1">Create option group</Header>}>
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Option group details</Header>}>
          <SpaceBetween size="l">
            <FormField label="Name"><Input value={f.name} onChange={e => setF({ ...f, name: e.detail.value })} /></FormField>
            <FormField label="Description"><Input value={f.desc} onChange={e => setF({ ...f, desc: e.detail.value })} /></FormField>
            <FormField label="Engine"><Select selectedOption={f.engine} options={engines} onChange={e => setF({ ...f, engine: e.detail.selectedOption, major: null })} /></FormField>
            <FormField label="Major engine version"><Select selectedOption={major} options={majors} onChange={e => setF({ ...f, major: e.detail.selectedOption })} statusType={vers.loading ? "loading" : "finished"} /></FormField>
          </SpaceBetween>
        </Container>
        <ErrorAlert error={err} />
        <Box float="right"><SpaceBetween direction="horizontal" size="xs">
          <Button variant="link" onClick={() => nav(-1)}>Cancel</Button>
          <Button variant="primary" loading={busy} disabled={!f.name || !f.desc || !major} onClick={submit}>Create</Button>
        </SpaceBetween></Box>
      </SpaceBetween>
    </ContentLayout>
  );
}

export function OptionGroupDetail() {
  const { name = "" } = useParams();
  const flash = useFlash();
  useCrumbs(crumbs({ text: "Option groups", href: "#/rds/option-groups" }, { text: name }));
  const d = useAsync(async () => (await rds("DescribeOptionGroups", { OptionGroupName: name })).OptionGroupsList[0], [name]);
  const [add, setAdd] = useState(false);
  const [sel, setSel] = useState<any[]>([]);
  const [opt1, setOpt1] = useState({ name: "", port: "", apply: "now" });
  if (d.error) return <ErrorAlert error={d.error} />;
  const g = d.data;
  if (!g) return <Box textAlign="center" padding="xl"><Spinner size="large" /></Box>;
  const V = ValueWithLabel;
  const isDefault = name.startsWith("default:");
  const remove = async () => {
    try { await rds("ModifyOptionGroup", { OptionGroupName: name, OptionsToRemove: sel.map(o => o.OptionName), ApplyImmediately: true }); flash.notify({ type: "success", content: "Options removed." }); setSel([]); d.reload(); }
    catch (e) { flash.error(e, "Delete option failed"); }
  };
  return (
    <ContentLayout header={<Header variant="h1">{name}</Header>}>
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Details</Header>}>
          <ColumnLayout columns={4} variant="text-grid">
            <V label="Description">{g.OptionGroupDescription}</V><V label="Engine">{g.EngineName}</V><V label="Major engine version">{g.MajorEngineVersion}</V><V label="ARN"><Copyable text={g.OptionGroupArn} /></V>
          </ColumnLayout>
        </Container>
        <Table variant="container" items={g.Options || []} selectionType={isDefault ? undefined : "multi"} selectedItems={sel} onSelectionChange={e => setSel(e.detail.selectedItems)} trackBy="OptionName"
          header={<Header variant="h2" counter={`(${(g.Options || []).length})`} actions={<SpaceBetween direction="horizontal" size="xs">
            <Button disabled={isDefault || !sel.length} onClick={remove}>Delete option</Button>
            <ButtonDropdown disabled items={[{ id: "m", text: "Modify option" }]}>Modify option</ButtonDropdown>
            <Button variant="primary" disabled={isDefault} onClick={() => setAdd(true)}>Add option</Button>
          </SpaceBetween>}>Options</Header>}
          empty={<Box color="text-body-secondary">{isDefault ? "Default option groups can't be modified." : "No options. Add an option to enable features such as auditing."}</Box>}
          columnDefinitions={[
            { id: "n", header: "Name", cell: (o: any) => o.OptionName }, { id: "v", header: "Version", cell: (o: any) => o.OptionVersion || "-" },
            { id: "p", header: "Port", cell: (o: any) => o.Port || "-" }, { id: "per", header: "Persistent", cell: (o: any) => String(!!o.Persistent) },
            { id: "s", header: "Settings", cell: (o: any) => (o.OptionSettings || []).map((x: any) => `${x.Name}=${x.Value}`).join(", ") || "-" },
          ]} />
        <TagsTab arnStr={g.OptionGroupArn} />
      </SpaceBetween>
      {add && <ActionModal visible onDismiss={() => setAdd(false)} header="Add option" ok="Add option" disabled={!opt1.name} onOk={async () => {
        await rds("ModifyOptionGroup", { OptionGroupName: name, OptionsToInclude: [{ OptionName: opt1.name, ...(opt1.port ? { Port: Number(opt1.port) } : {}) }], ApplyImmediately: opt1.apply === "now" });
        flash.notify({ type: "success", content: `Added ${opt1.name}.` }); d.reload();
      }}>
        <FormField label="Option name" description={g.EngineName.includes("mysql") || g.EngineName === "mariadb" ? "For example MARIADB_AUDIT_PLUGIN or MEMCACHED." : g.EngineName.startsWith("sqlserver") ? "For example SQLSERVER_BACKUP_RESTORE or TDE." : g.EngineName.startsWith("oracle") ? "For example OEM, APEX or S3_INTEGRATION." : undefined}>
          <Input value={opt1.name} onChange={e => setOpt1({ ...opt1, name: e.detail.value.toUpperCase() })} />
        </FormField>
        <FormField label="Port - optional"><Input type="number" value={opt1.port} onChange={e => setOpt1({ ...opt1, port: e.detail.value })} /></FormField>
        <FormField label="Scheduling"><RadioGroup value={opt1.apply} onChange={e => setOpt1({ ...opt1, apply: e.detail.value })} items={[{ value: "now", label: "Immediately" }, { value: "window", label: "During the next scheduled maintenance window" }]} /></FormField>
      </ActionModal>}
    </ContentLayout>
  );
}
