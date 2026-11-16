import { useEffect, useMemo, useState } from "react";
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
import RadioGroup from "@cloudscape-design/components/radio-group";
import Checkbox from "@cloudscape-design/components/checkbox";
import Button from "@cloudscape-design/components/button";
import Box from "@cloudscape-design/components/box";
import Link from "@cloudscape-design/components/link";
import Spinner from "@cloudscape-design/components/spinner";
import { useCrumbs } from "../../App";
import { ErrorAlert, useAsync, useFlash, ValueWithLabel } from "../../common";
import { ResourcePage, ActionModal, forEachReport } from "../ec2/ResourcePage";
import { glue, glueAll, crumbs, enc, fmt, St } from "./lib";
import { SCHEDULES, schedLabel } from "./Crawlers";

const V = ValueWithLabel;
const opt = (v: string, l?: string, d?: string) => ({ value: v, label: l || v, description: d });
const TYPE_LABEL: Record<string, string> = { SCHEDULED: "Schedule", CONDITIONAL: "Job or crawler event", ON_DEMAND: "On demand", EVENT: "EventBridge event" };
const trigHref = (n: string) => `#/glue/triggers/${enc(n)}`;
const wfHref = (n: string) => `#/glue/workflows/${enc(n)}`;
const actionText = (a: any) => a.JobName ? `Job: ${a.JobName}` : a.CrawlerName ? `Crawler: ${a.CrawlerName}` : "-";

// ---------------- triggers ----------------
export function Triggers() {
  useCrumbs(crumbs({ text: "Triggers" }));
  const flash = useFlash();
  const [del, setDel] = useState<{ rows: any[]; r: () => void } | null>(null);
  return (
    <>
      <ResourcePage<any> title="Triggers" description="Triggers start jobs and crawlers on a schedule, on demand, or when other jobs and crawlers finish."
        load={() => glueAll("GetTriggers", "Triggers")} trackBy="Name" poll={t => /ING$/.test(t.State)}
        primaryActions={[{ id: "run", text: "Run trigger", disabled: s => !s.length || s.some(t => t.Type !== "ON_DEMAND"), run: async (s, r) => { await forEachReport(s, t => t.Name, t => glue("StartTrigger", { Name: t.Name }), flash, "Trigger fired."); r(); } }]}
        actions={[
          { id: "activate", text: "Activate trigger", disabled: s => !s.length || s.some(t => t.Type === "ON_DEMAND" || t.State === "ACTIVATED"), run: async (s, r) => { await forEachReport(s, t => t.Name, t => glue("StartTrigger", { Name: t.Name }), flash, "Trigger activated."); r(); } },
          { id: "deactivate", text: "Deactivate trigger", disabled: s => !s.length || s.some(t => t.State !== "ACTIVATED"), run: async (s, r) => { await forEachReport(s, t => t.Name, t => glue("StopTrigger", { Name: t.Name }), flash, "Trigger deactivated."); r(); } },
          { id: "delete", text: "Delete trigger", run: (s, r) => setDel({ rows: s, r }) },
        ]}
        create={{ text: "Add trigger", href: "#/glue/triggers/create" }}
        columns={[
          { id: "n", header: "Name", cell: t => <Link href={trigHref(t.Name)}>{t.Name}</Link>, sortingField: "Name" },
          { id: "s", header: "Status", cell: t => <St s={t.State} /> },
          { id: "t", header: "Trigger type", cell: t => TYPE_LABEL[t.Type] || t.Type },
          { id: "p", header: "Parameters", cell: t => t.Type === "SCHEDULED" ? `${schedLabel(t.Schedule)} · ${t.Schedule}` : t.Type === "CONDITIONAL" ? `${(t.Predicate?.Conditions || []).length} condition(s), ${t.Predicate?.Logical || "AND"}` : "-" },
          { id: "a", header: "Jobs and crawlers to start", cell: t => (t.Actions || []).map(actionText).join(", ") },
          { id: "w", header: "Workflow", cell: t => t.WorkflowName ? <Link href={wfHref(t.WorkflowName)}>{t.WorkflowName}</Link> : "-" },
        ]} />
      {del && <ActionModal visible danger onDismiss={() => setDel(null)} header="Delete triggers" ok="Delete" onOk={async () => {
        for (const t of del.rows) await glue("DeleteTrigger", { Name: t.Name });
        flash.notify({ type: "success", content: "Trigger deleted." }); del.r();
      }}><Box>Delete {del.rows.map(t => t.Name).join(", ")}?</Box></ActionModal>}
    </>
  );
}

type Cond = { kind: "job" | "crawler"; name: string; state: string };
type Act = { kind: "job" | "crawler"; name: string; args: string; timeout: string };

export function TriggerEditor() {
  const { name: editName } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const flash = useFlash();
  useCrumbs(crumbs({ text: "Triggers", href: "#/glue/triggers" }, { text: editName || "Add trigger" }));
  const existing = useAsync(async () => editName ? (await glue("GetTrigger", { Name: editName })).Trigger : null, [editName]);
  const jobs = useAsync(async () => (await glueAll("GetJobs", "Jobs")).map((j: any) => opt(j.Name)), []);
  const crawlers = useAsync(async () => (await glueAll("GetCrawlers", "Crawlers")).map((c: any) => opt(c.Name)), []);
  const wfs = useAsync(async () => (await glueAll("ListWorkflows", "Workflows")).map((w: string) => opt(w)), []);
  const [f, setF] = useState<any>({ name: "", desc: "", type: sp.get("workflow") ? "ON_DEMAND" : "SCHEDULED", freq: "daily", cron: "", logic: "AND", conds: [] as Cond[], acts: [{ kind: "job", name: "", args: "", timeout: "" }] as Act[], start: true, workflow: sp.get("workflow") || "", batch: "", batchWin: "" });
  useEffect(() => {
    const t = existing.data; if (!t) return;
    const known = Object.entries(SCHEDULES).find(([, v]) => v === t.Schedule)?.[0];
    setF({ name: t.Name, desc: t.Description || "", type: t.Type, freq: t.Type === "SCHEDULED" ? (known || "custom") : "daily", cron: t.Schedule || "", logic: t.Predicate?.Logical || "AND",
      conds: (t.Predicate?.Conditions || []).map((c: any) => ({ kind: c.JobName ? "job" : "crawler", name: c.JobName || c.CrawlerName, state: c.State || c.CrawlState })),
      acts: (t.Actions || []).map((a: any) => ({ kind: a.JobName ? "job" : "crawler", name: a.JobName || a.CrawlerName, args: Object.entries(a.Arguments || {}).map(([k, v]) => `${k}=${v}`).join("\n"), timeout: a.Timeout ? String(a.Timeout) : "" })),
      start: t.State === "ACTIVATED", workflow: t.WorkflowName || "", batch: t.EventBatchingCondition?.BatchSize ? String(t.EventBatchingCondition.BatchSize) : "", batchWin: t.EventBatchingCondition?.BatchWindow ? String(t.EventBatchingCondition.BatchWindow) : "" });
  }, [existing.data]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const set = (k: string) => (v: any) => setF({ ...f, [k]: v });
  if (editName && existing.loading) return <Box textAlign="center" padding="xl"><Spinner size="large" /></Box>;
  const t = existing.data;
  const build = () => ({
    ...(f.desc ? { Description: f.desc } : {}),
    ...(f.type === "SCHEDULED" ? { Schedule: f.freq === "custom" ? f.cron : SCHEDULES[f.freq] } : {}),
    ...(f.type === "CONDITIONAL" ? { Predicate: { Logical: f.logic === "ANY" ? "ANY" : "AND", Conditions: f.conds.map((c: Cond) => c.kind === "job" ? { LogicalOperator: "EQUALS", JobName: c.name, State: c.state } : { LogicalOperator: "EQUALS", CrawlerName: c.name, CrawlState: c.state }) } } : {}),
    ...(f.type === "EVENT" && f.batch ? { EventBatchingCondition: { BatchSize: Number(f.batch), ...(f.batchWin ? { BatchWindow: Number(f.batchWin) } : {}) } } : {}),
    Actions: f.acts.filter((a: Act) => a.name).map((a: Act) => a.kind === "job"
      ? { JobName: a.name, ...(a.args ? { Arguments: Object.fromEntries(a.args.split("\n").filter(Boolean).map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; })) } : {}), ...(a.timeout ? { Timeout: Number(a.timeout) } : {}) }
      : { CrawlerName: a.name }),
  });
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      if (editName) await glue("UpdateTrigger", { Name: editName, TriggerUpdate: { Name: editName, ...build() } });
      else await glue("CreateTrigger", { Name: f.name, Type: f.type, ...build(), ...(f.workflow ? { WorkflowName: f.workflow } : {}), ...(f.type !== "ON_DEMAND" ? { StartOnCreation: f.start } : {}) });
      flash.notify({ type: "success", content: `${editName ? "Updated" : "Created"} trigger ${editName || f.name}.` });
      nav(f.workflow && !editName ? wfHref(f.workflow).slice(1) : "/glue/triggers");
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const simple = async (op: string, msg: string) => { try { await glue(op, { Name: editName }); flash.notify({ type: "success", content: msg }); existing.reload(); } catch (e) { flash.error(e); } };
  const STATES = { job: ["SUCCEEDED", "STOPPED", "FAILED", "TIMEOUT"], crawler: ["SUCCEEDED", "FAILED", "CANCELLED"] };
  return (
    <ContentLayout header={<Header variant="h1" actions={editName ? <SpaceBetween direction="horizontal" size="xs">
      {t?.Type === "ON_DEMAND" && <Button onClick={() => simple("StartTrigger", "Trigger fired.")}>Run trigger</Button>}
      {t?.Type !== "ON_DEMAND" && (t?.State === "ACTIVATED" ? <Button onClick={() => simple("StopTrigger", "Trigger deactivated.")}>Deactivate</Button> : <Button onClick={() => simple("StartTrigger", "Trigger activated.")}>Activate</Button>)}
      <Button onClick={async () => { try { await glue("DeleteTrigger", { Name: editName }); nav("/glue/triggers"); } catch (e) { flash.error(e); } }}>Delete</Button>
    </SpaceBetween> : undefined}>{editName || "Add trigger"}</Header>}>
      <SpaceBetween size="l">
        {t && <Container header={<Header variant="h2">Trigger details</Header>}><ColumnLayout columns={4} variant="text-grid">
          <V label="Status"><St s={t.State} /></V><V label="Type">{TYPE_LABEL[t.Type]}</V><V label="Workflow">{t.WorkflowName ? <Link href={wfHref(t.WorkflowName)}>{t.WorkflowName}</Link> : "-"}</V><V label="ID">{t.Id || "-"}</V>
        </ColumnLayout></Container>}
        <Container header={<Header variant="h2">Trigger properties</Header>}>
          <SpaceBetween size="l">
            <FormField label="Name"><Input value={f.name} disabled={!!editName} onChange={e => set("name")(e.detail.value)} /></FormField>
            <FormField label="Description - optional"><Textarea value={f.desc} onChange={e => set("desc")(e.detail.value)} /></FormField>
            <FormField label="Trigger type"><Tiles columns={4} value={f.type} onChange={e => !editName && set("type")(e.detail.value)} items={Object.entries(TYPE_LABEL).map(([k, v]) => ({ value: k, label: v, disabled: !!editName && k !== f.type }))} /></FormField>
            {f.type === "SCHEDULED" && <SpaceBetween size="m">
              <FormField label="Frequency"><Select selectedOption={opt(f.freq, f.freq === "custom" ? "Custom" : schedLabel(SCHEDULES[f.freq]))} options={[...Object.keys(SCHEDULES).filter(k => k !== "ondemand").map(k => opt(k, schedLabel(SCHEDULES[k]), SCHEDULES[k])), opt("custom", "Custom")]} onChange={e => set("freq")(e.detail.selectedOption.value)} /></FormField>
              {f.freq === "custom" && <FormField label="Cron expression" constraintText="cron(Minutes Hours Day-of-month Month Day-of-week Year)"><Input value={f.cron} onChange={e => set("cron")(e.detail.value)} placeholder="cron(15 12 * * ? *)" /></FormField>}
              <Box variant="small" color="text-body-secondary">The emulator stores schedules; it doesn't fire them on the cron clock. Use Run or the workflow to start jobs.</Box>
            </SpaceBetween>}
            {f.type === "CONDITIONAL" && <SpaceBetween size="m">
              <Box variant="small" color="text-body-secondary">In testing, the emulator stored conditional triggers but didn't fire them when the watched job succeeded. Start the next step yourself, or use separate on-demand triggers.</Box>
              <FormField label="Trigger logic"><RadioGroup value={f.logic} onChange={e => set("logic")(e.detail.value)} items={[{ value: "ANY", label: "Start after ANY watched event" }, { value: "AND", label: "Start after ALL watched events" }]} /></FormField>
              <Table variant="embedded" items={f.conds.map((c: Cond, i: number) => ({ ...c, i }))} header={<Header variant="h3" actions={<Button onClick={() => set("conds")([...f.conds, { kind: "job", name: "", state: "SUCCEEDED" }])}>Add event</Button>}>Watched jobs and crawlers</Header>}
                empty={<Box color="text-body-secondary">Add the job or crawler events that fire this trigger.</Box>}
                columnDefinitions={[
                  { id: "k", header: "Type", cell: (c: any) => <Select selectedOption={opt(c.kind, c.kind === "job" ? "Job" : "Crawler")} options={[opt("job", "Job"), opt("crawler", "Crawler")]} onChange={e => set("conds")(f.conds.map((x: Cond, j: number) => j === c.i ? { ...x, kind: e.detail.selectedOption.value, name: "", state: "SUCCEEDED" } : x))} /> },
                  { id: "n", header: "Name", cell: (c: any) => <Select selectedOption={c.name ? opt(c.name) : null} options={(c.kind === "job" ? jobs.data : crawlers.data) || []} onChange={e => set("conds")(f.conds.map((x: Cond, j: number) => j === c.i ? { ...x, name: e.detail.selectedOption.value } : x))} placeholder="Choose" /> },
                  { id: "s", header: "State", cell: (c: any) => <Select selectedOption={opt(c.state)} options={STATES[c.kind as "job" | "crawler"].map(s => opt(s))} onChange={e => set("conds")(f.conds.map((x: Cond, j: number) => j === c.i ? { ...x, state: e.detail.selectedOption.value } : x))} /> },
                  { id: "x", header: "", width: 90, cell: (c: any) => <Button variant="inline-link" onClick={() => set("conds")(f.conds.filter((_: any, j: number) => j !== c.i))}>Remove</Button> },
                ]} />
            </SpaceBetween>}
            {f.type === "EVENT" && <ColumnLayout columns={2}>
              <FormField label="Number of events" description="Start after this many EventBridge events."><Input type="number" value={f.batch} onChange={e => set("batch")(e.detail.value)} /></FormField>
              <FormField label="Time delay (seconds)"><Input type="number" value={f.batchWin} onChange={e => set("batchWin")(e.detail.value)} /></FormField>
            </ColumnLayout>}
            {!editName && f.type !== "ON_DEMAND" && <Checkbox checked={f.start} onChange={e => set("start")(e.detail.checked)}>Start trigger after it's created</Checkbox>}
            {!editName && <FormField label="Workflow - optional" description="Add the trigger to a workflow graph."><Select selectedOption={f.workflow ? opt(f.workflow) : opt("", "None")} options={[opt("", "None"), ...(wfs.data || [])]} onChange={e => set("workflow")(e.detail.selectedOption.value)} /></FormField>}
          </SpaceBetween>
        </Container>
        <Table variant="container" items={f.acts.map((a: Act, i: number) => ({ ...a, i }))}
          header={<Header variant="h2" description="Jobs and crawlers this trigger starts." actions={<Button onClick={() => set("acts")([...f.acts, { kind: "job", name: "", args: "", timeout: "" }])}>Add target</Button>}>Target resources</Header>}
          columnDefinitions={[
            { id: "k", header: "Resource type", cell: (a: any) => <Select selectedOption={opt(a.kind, a.kind === "job" ? "Job" : "Crawler")} options={[opt("job", "Job"), opt("crawler", "Crawler")]} onChange={e => set("acts")(f.acts.map((x: Act, j: number) => j === a.i ? { ...x, kind: e.detail.selectedOption.value, name: "" } : x))} /> },
            { id: "n", header: "Name", cell: (a: any) => <Select selectedOption={a.name ? opt(a.name) : null} options={(a.kind === "job" ? jobs.data : crawlers.data) || []} onChange={e => set("acts")(f.acts.map((x: Act, j: number) => j === a.i ? { ...x, name: e.detail.selectedOption.value } : x))} placeholder="Choose" /> },
            { id: "a", header: "Parameters (key=value per line)", cell: (a: any) => a.kind === "job" ? <Textarea rows={2} value={a.args} onChange={e => set("acts")(f.acts.map((x: Act, j: number) => j === a.i ? { ...x, args: e.detail.value } : x))} placeholder="--day=2026-01-01" /> : "-" },
            { id: "t", header: "Timeout (min)", cell: (a: any) => a.kind === "job" ? <Input type="number" value={a.timeout} onChange={e => set("acts")(f.acts.map((x: Act, j: number) => j === a.i ? { ...x, timeout: e.detail.value } : x))} /> : "-" },
            { id: "x", header: "", width: 90, cell: (a: any) => <Button variant="inline-link" onClick={() => set("acts")(f.acts.filter((_: any, j: number) => j !== a.i))}>Remove</Button> },
          ]} />
        <ErrorAlert error={err} />
        <Box float="right"><SpaceBetween direction="horizontal" size="xs">
          <Button variant="link" onClick={() => nav(-1)}>Cancel</Button>
          <Button variant="primary" loading={busy} disabled={!f.name || !f.acts.some((a: Act) => a.name) || (f.type === "CONDITIONAL" && !f.conds.some((c: Cond) => c.name))} onClick={submit}>{editName ? "Save" : "Create"}</Button>
        </SpaceBetween></Box>
      </SpaceBetween>
    </ContentLayout>
  );
}

// ---------------- workflows ----------------
export function Workflows() {
  useCrumbs(crumbs({ text: "Workflows (orchestration)" }));
  const flash = useFlash();
  const [del, setDel] = useState<{ rows: any[]; r: () => void } | null>(null);
  const load = async () => {
    const names = await glueAll("ListWorkflows", "Workflows");
    if (!names.length) return [];
    return (await glue("BatchGetWorkflows", { Names: names, IncludeGraph: true })).Workflows || [];
  };
  return (
    <>
      <ResourcePage<any> title="Workflows" description="Workflows chain triggers, jobs and crawlers into a single ETL pipeline." load={load} trackBy="Name" poll={w => w.LastRun?.Status === "RUNNING"}
        primaryActions={[{ id: "run", text: "Run workflow", run: async (s, r) => { await forEachReport(s, w => w.Name, w => glue("StartWorkflowRun", { Name: w.Name }), flash, "Workflow run started."); r(); } }]}
        actions={[{ id: "delete", text: "Delete workflow", run: (s, r) => setDel({ rows: s, r }) }]}
        create={{ text: "Add workflow", href: "#/glue/workflows/create" }}
        columns={[
          { id: "n", header: "Name", cell: w => <Link href={wfHref(w.Name)}>{w.Name}</Link>, sortingField: "Name" },
          { id: "s", header: "Last run status", cell: w => <St s={w.LastRun?.Status} /> },
          { id: "t", header: "Last run time", cell: w => fmt(w.LastRun?.StartedOn) },
          { id: "c", header: "Created", cell: w => fmt(w.CreatedOn) },
          { id: "nodes", header: "Nodes", cell: w => (w.Graph?.Nodes || []).length },
          { id: "d", header: "Description", cell: w => w.Description || "-" },
        ]} />
      {del && <ActionModal visible danger onDismiss={() => setDel(null)} header="Delete workflows" ok="Delete" onOk={async () => {
        for (const w of del.rows) await glue("DeleteWorkflow", { Name: w.Name });
        flash.notify({ type: "success", content: "Workflow deleted." }); del.r();
      }}><Box>Delete {del.rows.map(w => w.Name).join(", ")}? Its triggers are deleted; jobs and crawlers stay.</Box></ActionModal>}
    </>
  );
}

export function CreateWorkflow() {
  useCrumbs(crumbs({ text: "Workflows", href: "#/glue/workflows" }, { text: "Add workflow" }));
  const nav = useNavigate();
  const flash = useFlash();
  const [f, setF] = useState({ name: "", desc: "", props: "", max: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const props = Object.fromEntries(f.props.split("\n").filter(Boolean).map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }));
      await glue("CreateWorkflow", { Name: f.name, ...(f.desc ? { Description: f.desc } : {}), ...(Object.keys(props).length ? { DefaultRunProperties: props } : {}), ...(f.max ? { MaxConcurrentRuns: Number(f.max) } : {}) });
      flash.notify({ type: "success", content: `Created workflow ${f.name}. Add a start trigger to build its graph.` });
      nav(wfHref(f.name).slice(1));
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <ContentLayout header={<Header variant="h1">Add workflow</Header>}>
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Workflow properties</Header>}>
          <SpaceBetween size="l">
            <FormField label="Name"><Input value={f.name} onChange={e => setF({ ...f, name: e.detail.value })} /></FormField>
            <FormField label="Description - optional"><Textarea value={f.desc} onChange={e => setF({ ...f, desc: e.detail.value })} /></FormField>
            <FormField label="Default run properties - optional" description="key=value per line, available to every job in a run."><Textarea value={f.props} onChange={e => setF({ ...f, props: e.detail.value })} /></FormField>
            <FormField label="Max concurrency - optional"><Input type="number" value={f.max} onChange={e => setF({ ...f, max: e.detail.value })} /></FormField>
          </SpaceBetween>
        </Container>
        <ErrorAlert error={err} />
        <Box float="right"><SpaceBetween direction="horizontal" size="xs">
          <Button variant="link" onClick={() => nav(-1)}>Cancel</Button>
          <Button variant="primary" loading={busy} disabled={!f.name} onClick={submit}>Create workflow</Button>
        </SpaceBetween></Box>
      </SpaceBetween>
    </ContentLayout>
  );
}

/** Layered left-to-right drawing of a workflow graph (nodes are triggers, jobs and crawlers). */
function Graph({ graph }: { graph?: any }) {
  const layout = useMemo(() => {
    const nodes: any[] = graph?.Nodes || [], edges: any[] = graph?.Edges || [];
    const inc: Record<string, number> = {};
    nodes.forEach(n => (inc[n.UniqueId] = 0)); edges.forEach(e => (inc[e.DestinationId] = (inc[e.DestinationId] || 0) + 1));
    const layer: Record<string, number> = {};
    const queue = nodes.filter(n => !inc[n.UniqueId]).map(n => n.UniqueId);
    queue.forEach(id => (layer[id] = 0));
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i];
      for (const e of edges.filter(x => x.SourceId === id)) {
        const l = layer[id] + 1;
        if (layer[e.DestinationId] === undefined || layer[e.DestinationId] < l) { layer[e.DestinationId] = l; if (queue.length < 500) queue.push(e.DestinationId); }
      }
    }
    nodes.forEach(n => { if (layer[n.UniqueId] === undefined) layer[n.UniqueId] = 0; });
    const cols: Record<number, any[]> = {};
    nodes.forEach(n => { (cols[layer[n.UniqueId]] ||= []).push(n); });
    const W = 190, H = 64, GX = 70, GY = 26;
    const pos: Record<string, { x: number; y: number }> = {};
    Object.entries(cols).forEach(([l, ns]) => ns.forEach((n, i) => (pos[n.UniqueId] = { x: Number(l) * (W + GX) + 10, y: i * (H + GY) + 10 })));
    const width = (Math.max(0, ...Object.keys(cols).map(Number)) + 1) * (W + GX) + 20;
    const height = Math.max(1, ...Object.values(cols).map(c => c.length)) * (H + GY) + 20;
    return { nodes, edges, pos, W, H, width, height };
  }, [graph]);
  if (!layout.nodes.length) return <Box color="text-body-secondary" padding="l">This workflow is empty. Add a start trigger, then add jobs and crawlers to it.</Box>;
  const statusOf = (n: any) => n.Type === "JOB" ? n.JobDetails?.JobRuns?.[0]?.JobRunState : n.Type === "CRAWLER" ? n.CrawlerDetails?.Crawls?.[0]?.State : n.TriggerDetails?.Trigger?.State;
  const color = (s?: string) => !s ? "#8d99a8" : /SUCCEEDED|ACTIVATED|COMPLETED/.test(s) ? "#29ad32" : /FAILED|ERROR|TIMEOUT/.test(s) ? "#d91515" : /RUNNING|STARTING|WAITING/.test(s) ? "#0972d3" : "#8d99a8";
  const icon: Record<string, string> = { TRIGGER: "⚡", JOB: "⚙", CRAWLER: "🕷" };
  const href = (n: any) => n.Type === "JOB" ? `#/glue/jobs/edit/${enc(n.Name)}?tab=runs` : n.Type === "CRAWLER" ? `#/glue/crawlers/${enc(n.Name)}` : trigHref(n.Name);
  return (
    <div style={{ overflow: "auto" }}>
      <svg width={layout.width} height={layout.height} role="img" aria-label="Workflow graph">
        <defs><marker id="arr" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#8d99a8" /></marker></defs>
        {layout.edges.map((e: any, i: number) => { const a = layout.pos[e.SourceId], b = layout.pos[e.DestinationId]; if (!a || !b) return null;
          const x1 = a.x + layout.W, y1 = a.y + layout.H / 2, x2 = b.x - 4, y2 = b.y + layout.H / 2;
          return <path key={i} d={`M${x1},${y1} C${x1 + 35},${y1} ${x2 - 35},${y2} ${x2},${y2}`} stroke="#8d99a8" strokeWidth="1.5" fill="none" markerEnd="url(#arr)" />; })}
        {layout.nodes.map((n: any) => { const p = layout.pos[n.UniqueId]; const s = statusOf(n);
          return <a key={n.UniqueId} href={href(n)}>
            <rect x={p.x} y={p.y} width={layout.W} height={layout.H} rx="8" fill="transparent" stroke={color(s)} strokeWidth="2" />
            <text x={p.x + 12} y={p.y + 24} fontSize="13" fontWeight="bold" fill="currentColor">{icon[n.Type]} {n.Name.length > 20 ? n.Name.slice(0, 19) + "…" : n.Name}</text>
            <text x={p.x + 12} y={p.y + 46} fontSize="12" fill={color(s)}>{n.Type.toLowerCase()}{s ? ` · ${s.toLowerCase()}` : ""}</text>
          </a>; })}
      </svg>
    </div>
  );
}

export function WorkflowDetail() {
  const { name = "" } = useParams();
  const nav = useNavigate();
  const flash = useFlash();
  useCrumbs(crumbs({ text: "Workflows", href: "#/glue/workflows" }, { text: name }));
  const d = useAsync(async () => (await glue("GetWorkflow", { Name: name, IncludeGraph: true })).Workflow, [name]);
  const runs = useAsync(async () => (await glue("GetWorkflowRuns", { Name: name, IncludeGraph: true })).Runs || [], [name]);
  const [runSel, setRunSel] = useState<any[]>([]);
  const [edit, setEdit] = useState(false);
  const [props, setProps] = useState({ desc: "", props: "", max: "" });
  const [del, setDel] = useState(false);
  const running = (runs.data || []).some((r: any) => r.Status === "RUNNING");
  useEffect(() => { if (running) { const t = setTimeout(() => { runs.reload(); d.reload(); }, 2000); return () => clearTimeout(t); } }, [runs.data]); // eslint-disable-line react-hooks/exhaustive-deps
  if (d.error) return <ErrorAlert error={d.error} />;
  if (!d.data) return <Box textAlign="center" padding="xl"><Spinner size="large" /></Box>;
  const w = d.data;
  const shownRun = runSel[0] ? (runs.data || []).find((r: any) => r.WorkflowRunId === runSel[0].WorkflowRunId) : undefined;
  const start = async () => { try { const r = await glue("StartWorkflowRun", { Name: name }); flash.notify({ type: "success", content: `Started run ${r.RunId.slice(0, 20)}…` }); runs.reload(); d.reload(); } catch (e) { flash.error(e, "Run failed"); } };
  const st = w.LastRun?.Statistics;
  return (
    <ContentLayout header={<Header variant="h1" actions={<SpaceBetween direction="horizontal" size="xs">
      <Button iconName="refresh" ariaLabel="Refresh" onClick={() => { d.reload(); runs.reload(); }} />
      <Button onClick={() => nav(`/glue/triggers/create?workflow=${enc(name)}`)}>Add trigger</Button>
      <Button onClick={() => setDel(true)}>Delete</Button>
      <Button variant="primary" onClick={start}>Run workflow</Button>
    </SpaceBetween>}>{name}</Header>}>
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Last run</Header>}>
          <ColumnLayout columns={4} variant="text-grid">
            <V label="Status"><St s={w.LastRun?.Status} /></V><V label="Started">{fmt(w.LastRun?.StartedOn)}</V><V label="Completed">{fmt(w.LastRun?.CompletedOn)}</V>
            <V label="Actions">{st ? `${st.TotalActions} total · ${st.SucceededActions} succeeded · ${st.FailedActions} failed · ${st.RunningActions} running` : "-"}</V>
          </ColumnLayout>
        </Container>
        <Tabs tabs={[
          { id: "graph", label: "Graph", content: <Container footer={<Box variant="small" color="text-body-secondary">In the emulator a workflow run starts the start trigger's jobs and crawlers; conditional triggers further down the graph don't fire.</Box>} header={<Header variant="h2" description={shownRun ? `Showing run ${shownRun.WorkflowRunId.slice(0, 20)}… (choose one on the History tab).` : "Showing the workflow definition. Pick a run on the History tab to see its states."}>Workflow graph</Header>}>
            <Graph graph={shownRun?.Graph || w.Graph} /></Container> },
          { id: "history", label: "History", content: <Table variant="container" items={runs.data || []} loading={runs.loading} trackBy="WorkflowRunId" selectionType="single" selectedItems={runSel} onSelectionChange={e => setRunSel(e.detail.selectedItems)}
              header={<Header variant="h2" counter={`(${runs.data?.length || 0})`} actions={<Button disabled={!runSel.length || runSel[0].Status !== "RUNNING"} onClick={async () => { try { await glue("StopWorkflowRun", { Name: name, RunId: runSel[0].WorkflowRunId }); runs.reload(); } catch (e) { flash.error(e); } }}>Stop run</Button>}>Run history</Header>}
              empty={<Box color="text-body-secondary">No runs yet.</Box>}
              columnDefinitions={[
                { id: "id", header: "Run ID", cell: (r: any) => r.WorkflowRunId.slice(0, 24) + "…" }, { id: "s", header: "Run status", cell: (r: any) => <St s={r.Status} /> },
                { id: "st", header: "Start time", cell: (r: any) => fmt(r.StartedOn) }, { id: "e", header: "End time", cell: (r: any) => fmt(r.CompletedOn) },
                { id: "a", header: "Actions", cell: (r: any) => r.Statistics ? `${r.Statistics.SucceededActions}/${r.Statistics.TotalActions} succeeded, ${r.Statistics.FailedActions} failed` : "-" },
                { id: "err", header: "Error", cell: (r: any) => r.ErrorMessage || "-" },
              ]} /> },
          { id: "props", label: "Properties", content: <Container header={<Header variant="h2" actions={<Button onClick={() => { setProps({ desc: w.Description || "", props: Object.entries(w.DefaultRunProperties || {}).map(([k, v]) => `${k}=${v}`).join("\n"), max: w.MaxConcurrentRuns ? String(w.MaxConcurrentRuns) : "" }); setEdit(true); }}>Edit</Button>}>Properties</Header>}>
            <ColumnLayout columns={3} variant="text-grid">
              <V label="Description">{w.Description || "-"}</V><V label="Created">{fmt(w.CreatedOn)}</V><V label="Last modified">{fmt(w.LastModifiedOn)}</V>
              <V label="Default run properties">{Object.entries(w.DefaultRunProperties || {}).map(([k, v]) => `${k}=${v}`).join(", ") || "-"}</V><V label="Max concurrency">{w.MaxConcurrentRuns || "-"}</V>
            </ColumnLayout></Container> },
        ]} />
      </SpaceBetween>
      {edit && <ActionModal visible onDismiss={() => setEdit(false)} header="Edit workflow" ok="Save" onOk={async () => {
        const p = Object.fromEntries(props.props.split("\n").filter(Boolean).map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }));
        await glue("UpdateWorkflow", { Name: name, Description: props.desc, DefaultRunProperties: p, ...(props.max ? { MaxConcurrentRuns: Number(props.max) } : {}) }); d.reload();
      }}>
        <FormField label="Description"><Textarea value={props.desc} onChange={e => setProps({ ...props, desc: e.detail.value })} /></FormField>
        <FormField label="Default run properties" description="key=value per line"><Textarea value={props.props} onChange={e => setProps({ ...props, props: e.detail.value })} /></FormField>
        <FormField label="Max concurrency"><Input type="number" value={props.max} onChange={e => setProps({ ...props, max: e.detail.value })} /></FormField>
      </ActionModal>}
      {del && <ActionModal visible danger onDismiss={() => setDel(false)} header={`Delete ${name}?`} ok="Delete" onOk={async () => { await glue("DeleteWorkflow", { Name: name }); nav("/glue/workflows"); }}>
        <Box>The workflow and its triggers are deleted. Jobs and crawlers stay.</Box></ActionModal>}
    </ContentLayout>
  );
}
