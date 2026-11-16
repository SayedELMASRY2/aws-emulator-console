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
import Multiselect from "@cloudscape-design/components/multiselect";
import Tiles from "@cloudscape-design/components/tiles";
import Checkbox from "@cloudscape-design/components/checkbox";
import Button from "@cloudscape-design/components/button";
import ButtonDropdown from "@cloudscape-design/components/button-dropdown";
import ExpandableSection from "@cloudscape-design/components/expandable-section";
import Box from "@cloudscape-design/components/box";
import Link from "@cloudscape-design/components/link";
import Spinner from "@cloudscape-design/components/spinner";
import Alert from "@cloudscape-design/components/alert";
import Modal from "@cloudscape-design/components/modal";
import { useCrumbs } from "../../App";
import { ErrorAlert, useAsync, useFlash, ValueWithLabel, EmulatorNote } from "../../common";
import { ResourcePage, ActionModal, forEachReport } from "../ec2/ResourcePage";
import { glue, glueAll, crumbs, enc, fmt, dur, St, ASSETS, ensureAssets, readS3Text, writeS3Text, useGlueRoles, createGlueRole, roleName, JOB_TYPE } from "./lib";
import { SCHEDULES, schedLabel } from "./Crawlers";

const V = ValueWithLabel;
const opt = (v: string, l?: string, d?: string) => ({ value: v, label: l || v, description: d });
const editHref = (n: string, tab?: string) => `#/glue/jobs/edit/${enc(n)}${tab ? `?tab=${tab}` : ""}`;

const SPARK_TEMPLATE = `import sys
from awsglue.transforms import *
from awsglue.utils import getResolvedOptions
from pyspark.context import SparkContext
from awsglue.context import GlueContext
from awsglue.job import Job

args = getResolvedOptions(sys.argv, ["JOB_NAME"])
sc = SparkContext()
glueContext = GlueContext(sc)
spark = glueContext.spark_session
job = Job(glueContext)
job.init(args["JOB_NAME"], args)

# Read a Data Catalog table (for example one a crawler created):
# dyf = glueContext.create_dynamic_frame.from_catalog(database="my_db", table_name="my_table")
# Write it to S3 as CSV or JSON (the emulator can't write Parquet):
# glueContext.write_dynamic_frame.from_options(frame=dyf, connection_type="s3",
#     connection_options={"path": "s3://my-bucket/output/"}, format="csv")

job.commit()
`;
const PYSHELL_TEMPLATE = `import sys
import boto3

print("Arguments:", sys.argv)
s3 = boto3.client("s3")
# Example: list buckets the job's IAM role can see
for b in s3.list_buckets().get("Buckets", []):
    print(b["Name"])
`;

export function Jobs() {
  useCrumbs(crumbs({ text: "ETL jobs" }));
  const nav = useNavigate();
  const flash = useFlash();
  const [m, setM] = useState<{ id: string; rows: any[]; r: () => void } | null>(null);
  const [cloneName, setCloneName] = useState("");
  return (
    <SpaceBetween size="l">
      <Box padding={{ horizontal: "l", top: "l" }}>
        <Container header={<Header variant="h2" description="Choose how to author a new ETL job.">Create job</Header>}>
          <ColumnLayout columns={3}>
            <Box><Box variant="h4">Visual ETL</Box><Box color="text-body-secondary" variant="p">Author in a visual interface focused on data flow.</Box><Button disabled>Visual ETL (n/a)</Button></Box>
            <Box><Box variant="h4">Notebook</Box><Box color="text-body-secondary" variant="p">Author using an interactive code notebook.</Box><Button disabled>Notebook (n/a)</Button></Box>
            <Box><Box variant="h4">Script editor</Box><Box color="text-body-secondary" variant="p">Author code with a script editor. Jobs run for real in the emulator.</Box>
              <SpaceBetween direction="horizontal" size="xs"><Button variant="primary" href="#/glue/jobs/create?engine=spark">Spark</Button><Button href="#/glue/jobs/create?engine=pythonshell">Python shell</Button></SpaceBetween></Box>
          </ColumnLayout>
        </Container>
      </Box>
      <ResourcePage<any> title="Your jobs" load={() => glueAll("GetJobs", "Jobs")} trackBy="Name"
        primaryActions={[{ id: "run", text: "Run job", run: async (s, r) => { await forEachReport(s, j => j.Name, j => glue("StartJobRun", { JobName: j.Name }), flash, `Started ${s.map(j => j.Name).join(", ")}.`); r(); } }]}
        actions={[
          { id: "edit", text: "Edit job", disabled: s => s.length !== 1, run: s => nav(editHref(s[0].Name).slice(1)) },
          { id: "clone", text: "Clone job", disabled: s => s.length !== 1, run: (s, r) => { setCloneName(`${s[0].Name}-copy`); setM({ id: "clone", rows: s, r }); } },
          { id: "delete", text: "Delete job(s)", run: (s, r) => setM({ id: "delete", rows: s, r }) },
        ]}
        columns={[
          { id: "n", header: "Job name", cell: j => <Link href={editHref(j.Name)}>{j.Name}</Link>, sortingField: "Name" },
          { id: "t", header: "Type", cell: j => JOB_TYPE(j) },
          { id: "c", header: "Created by", cell: () => "Script editor" },
          { id: "m", header: "Last modified", cell: j => fmt(j.LastModifiedOn) },
          { id: "v", header: "AWS Glue version", cell: j => j.GlueVersion || "-" },
          { id: "r", header: "IAM role", cell: j => roleName(j.Role) },
        ]} />
      {m?.id === "delete" && <ActionModal visible danger onDismiss={() => setM(null)} header="Delete jobs" ok="Delete" onOk={async () => {
        for (const j of m.rows) await glue("DeleteJob", { JobName: j.Name });
        flash.notify({ type: "success", content: `Deleted ${m.rows.map(j => j.Name).join(", ")}.` }); m.r();
      }}><Box>Delete {m.rows.map(j => j.Name).join(", ")}? Job runs and the job definition are removed; the script in S3 stays.</Box></ActionModal>}
      {m?.id === "clone" && <ActionModal visible onDismiss={() => setM(null)} header={`Clone ${m.rows[0].Name}`} ok="Clone" disabled={!cloneName} onOk={async () => {
        const j = m.rows[0];
        const { Name, CreatedOn, LastModifiedOn, AllocatedCapacity, ...rest } = j; void Name; void CreatedOn; void LastModifiedOn; void AllocatedCapacity;
        if (rest.WorkerType) delete rest.MaxCapacity;
        await glue("CreateJob", { ...rest, Name: cloneName });
        flash.notify({ type: "success", content: `Created ${cloneName}.` }); m.r();
      }}><FormField label="New job name"><Input value={cloneName} onChange={e => setCloneName(e.detail.value)} /></FormField></ActionModal>}
    </SpaceBetween>
  );
}

type JobForm = {
  name: string; desc: string; engine: string; role: any; glueVersion: string; worker: string; workers: string; dpu: string; bookmark: string; retries: string; timeout: string;
  script: string; tempDir: string; params: { k: string; v: string }[]; conns: any[]; sec: any; maxConc: string; metrics: boolean; logs: boolean; sparkUi: boolean; flex: boolean;
};

function Runs({ job, onSelectRun }: { job: string; onSelectRun?: (id: string) => void }) {
  const flash = useFlash();
  const d = useAsync(async () => glueAll("GetJobRuns", "JobRuns", { JobName: job }), [job]);
  const [sel, setSel] = useState<any[]>([]);
  const busy = (d.data || []).some((r: any) => /RUNNING|STARTING|STOPPING|WAITING/.test(r.JobRunState));
  useEffect(() => { if (busy) { const t = setTimeout(() => d.reload(), 2000); return () => clearTimeout(t); } }, [d.data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (d.data) setSel(s => d.data!.filter((r: any) => s.some(x => x.Id === r.Id)).slice(0, 1)); }, [d.data]);
  const r = sel[0] || d.data?.[0];
  void onSelectRun;
  return (
    <SpaceBetween size="l">
      <Table variant="container" items={d.data || []} loading={d.loading && !d.data} trackBy="Id" selectionType="single" selectedItems={r ? [r] : []} onSelectionChange={e => setSel(e.detail.selectedItems)}
        header={<Header variant="h2" counter={`(${d.data?.length || 0})`} actions={<SpaceBetween direction="horizontal" size="xs">
          <Button iconName="refresh" ariaLabel="Refresh" onClick={() => d.reload()} />
          <Button disabled={!r || !/RUNNING|STARTING|WAITING/.test(r.JobRunState)} onClick={async () => { try { await glue("BatchStopJobRun", { JobName: job, JobRunIds: [r.Id] }); d.reload(); } catch (e) { flash.error(e); } }}>Stop job run</Button>
        </SpaceBetween>}>Job runs</Header>}
        empty={<Box color="text-body-secondary">No runs yet. Choose Run to start the job.</Box>}
        columnDefinitions={[
          { id: "s", header: "Run status", cell: (x: any) => <St s={x.JobRunState} /> },
          { id: "id", header: "Run ID", cell: (x: any) => <Box variant="code" fontSize="body-s">{x.Id.slice(0, 22)}…</Box> },
          { id: "t", header: "Start time", cell: (x: any) => fmt(x.StartedOn) },
          { id: "e", header: "End time", cell: (x: any) => fmt(x.CompletedOn) },
          { id: "d", header: "Duration", cell: (x: any) => dur(x.ExecutionTime) },
          { id: "a", header: "Retry attempt", cell: (x: any) => x.Attempt ?? 0 },
          { id: "c", header: "Capacity (DPUs)", cell: (x: any) => x.MaxCapacity ?? x.AllocatedCapacity ?? "-" },
          { id: "trig", header: "Triggered by", cell: (x: any) => x.TriggerName || "Manual" },
        ]} />
      {r && <Container header={<Header variant="h2">Run details</Header>}>
        <SpaceBetween size="l">
          {r.ErrorMessage && <Alert type="error" header="Error">{r.ErrorMessage}</Alert>}
          <ColumnLayout columns={4} variant="text-grid">
            <V label="Run ID">{r.Id}</V><V label="Run status"><St s={r.JobRunState} /></V><V label="Start time">{fmt(r.StartedOn)}</V><V label="End time">{fmt(r.CompletedOn)}</V>
            <V label="Execution time">{dur(r.ExecutionTime)}</V><V label="Timeout">{r.Timeout} minutes</V><V label="Glue version">{r.GlueVersion || "-"}</V><V label="Worker type">{r.WorkerType ? `${r.WorkerType} × ${r.NumberOfWorkers}` : `${r.MaxCapacity ?? "-"} DPU`}</V>
            <V label="Log group">{r.LogGroupName || "-"}</V><V label="Trigger">{r.TriggerName || "-"}</V><V label="Previous run">{r.PreviousRunId || "-"}</V><V label="Execution class">{r.ExecutionClass || "STANDARD"}</V>
          </ColumnLayout>
          <Table variant="embedded" header={<Header variant="h3">Run parameters</Header>} items={Object.entries(r.Arguments || {}).map(([k, v]) => ({ k, v }))} empty={<Box color="text-body-secondary">None</Box>}
            columnDefinitions={[{ id: "k", header: "Key", cell: (x: any) => x.k }, { id: "v", header: "Value", cell: (x: any) => String(x.v) }]} />
          <Box variant="small" color="text-body-secondary">The emulator doesn't send job output to CloudWatch Logs; check the error message above or the data your script writes to S3.</Box>
        </SpaceBetween>
      </Container>}
    </SpaceBetween>
  );
}

function Schedules({ job }: { job: string }) {
  const flash = useFlash();
  const d = useAsync(async () => (await glueAll("GetTriggers", "Triggers", { DependentJobName: job })).filter((t: any) => t.Type === "SCHEDULED"), [job]);
  const [create, setCreate] = useState(false);
  const [f, setF] = useState({ name: `${job}-schedule`, freq: "daily", cron: "", start: true });
  const [sel, setSel] = useState<any[]>([]);
  const act = async (op: string) => { try { for (const t of sel) await glue(op, { Name: t.Name }); d.reload(); } catch (e) { flash.error(e); } };
  return (
    <>
      <Table variant="container" items={d.data || []} loading={d.loading} trackBy="Name" selectionType="multi" selectedItems={sel} onSelectionChange={e => setSel(e.detail.selectedItems)}
        header={<Header variant="h2" counter={`(${d.data?.length || 0})`} actions={<SpaceBetween direction="horizontal" size="xs">
          <Button disabled={!sel.length} onClick={() => act("StartTrigger")}>Resume</Button><Button disabled={!sel.length} onClick={() => act("StopTrigger")}>Pause</Button>
          <Button disabled={!sel.length} onClick={() => act("DeleteTrigger")}>Delete</Button><Button variant="primary" onClick={() => setCreate(true)}>Create schedule</Button>
        </SpaceBetween>}>Schedules</Header>}
        empty={<Box color="text-body-secondary">No schedules for this job.</Box>}
        columnDefinitions={[{ id: "n", header: "Name", cell: (t: any) => <Link href={`#/glue/triggers/${enc(t.Name)}`}>{t.Name}</Link> }, { id: "s", header: "Status", cell: (t: any) => <St s={t.State} /> },
          { id: "f", header: "Frequency", cell: (t: any) => schedLabel(t.Schedule) }, { id: "c", header: "Cron expression", cell: (t: any) => t.Schedule }]} />
      {create && <ActionModal visible onDismiss={() => setCreate(false)} header="Create job schedule" ok="Create schedule" disabled={!f.name || (f.freq === "custom" && !f.cron)} onOk={async () => {
        await glue("CreateTrigger", { Name: f.name, Type: "SCHEDULED", Schedule: f.freq === "custom" ? f.cron : SCHEDULES[f.freq], Actions: [{ JobName: job }], StartOnCreation: f.start });
        flash.notify({ type: "success", content: `Created schedule ${f.name}.` }); d.reload();
      }}>
        <FormField label="Name"><Input value={f.name} onChange={e => setF({ ...f, name: e.detail.value })} /></FormField>
        <FormField label="Frequency"><Select selectedOption={opt(f.freq, f.freq === "custom" ? "Custom" : schedLabel(SCHEDULES[f.freq]))} options={[...Object.keys(SCHEDULES).filter(k => k !== "ondemand").map(k => opt(k, schedLabel(SCHEDULES[k]), SCHEDULES[k])), opt("custom", "Custom")]} onChange={e => setF({ ...f, freq: e.detail.selectedOption.value! })} /></FormField>
        {f.freq === "custom" && <FormField label="Cron expression"><Input value={f.cron} onChange={e => setF({ ...f, cron: e.detail.value })} placeholder="cron(15 12 * * ? *)" /></FormField>}
        <Checkbox checked={f.start} onChange={e => setF({ ...f, start: e.detail.checked })}>Start the schedule after it's created</Checkbox>
        <Box variant="small" color="text-body-secondary">The emulator stores the schedule; it doesn't fire runs on the cron clock.</Box>
      </ActionModal>}
    </>
  );
}

export function JobEditor() {
  const { name: editName } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const flash = useFlash();
  const isNew = !editName;
  useCrumbs(crumbs({ text: "ETL jobs", href: "#/glue/jobs" }, { text: editName || "Untitled job" }));
  const roles = useGlueRoles();
  const conns = useAsync(async () => (await glueAll("GetConnections", "ConnectionList")).map((c: any) => opt(c.Name)), []);
  const secs = useAsync(async () => (await glueAll("GetSecurityConfigurations", "SecurityConfigurations")).map((c: any) => opt(c.Name)), []);
  const existing = useAsync(async () => {
    if (!editName) return null;
    const j = (await glue("GetJob", { JobName: editName })).Job;
    const script = await readS3Text(j.Command?.ScriptLocation).catch(e => `# Couldn't load the script: ${e.message}\n`);
    return { j, script };
  }, [editName]);
  const engine0 = sp.get("engine") === "pythonshell" ? "pythonshell" : "glueetl";
  const [f, setF] = useState<JobForm>({
    name: "", desc: "", engine: engine0, role: null, glueVersion: engine0 === "pythonshell" ? "3.0" : "4.0", worker: "G.1X", workers: "2", dpu: "0.0625", bookmark: "job-bookmark-disable",
    retries: "0", timeout: engine0 === "pythonshell" ? "2880" : "480", script: engine0 === "pythonshell" ? PYSHELL_TEMPLATE : SPARK_TEMPLATE, tempDir: `s3://${ASSETS}/temporary/`,
    params: [], conns: [], sec: null, maxConc: "1", metrics: true, logs: true, sparkUi: false, flex: false,
  });
  const [scriptPath, setScriptPath] = useState("");
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState(sp.get("tab") || "script");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [del, setDel] = useState(false);
  const [newRole, setNewRole] = useState<string | null>(null);
  const [runArgs, setRunArgs] = useState<{ k: string; v: string }[] | null>(null);
  useEffect(() => {
    if (!existing.data) return;
    const { j, script } = existing.data;
    const args = j.DefaultArguments || {};
    setF({
      name: j.Name, desc: j.Description || "", engine: j.Command?.Name || "glueetl", role: opt(j.Role, roleName(j.Role)), glueVersion: j.GlueVersion || "4.0",
      worker: j.WorkerType || "G.1X", workers: String(j.NumberOfWorkers || 2), dpu: String(j.MaxCapacity ?? "0.0625"), bookmark: args["--job-bookmark-option"] || "job-bookmark-disable",
      retries: String(j.MaxRetries ?? 0), timeout: String(j.Timeout ?? 480), script, tempDir: args["--TempDir"] || "", conns: (j.Connections?.Connections || []).map((c: string) => opt(c)),
      params: Object.entries(args).filter(([k]) => !["--job-bookmark-option", "--TempDir", "--job-language", "--enable-metrics", "--enable-continuous-cloudwatch-log", "--enable-spark-ui"].includes(k)).map(([k, v]) => ({ k, v: String(v) })),
      sec: j.SecurityConfiguration ? opt(j.SecurityConfiguration) : null, maxConc: String(j.ExecutionProperty?.MaxConcurrentRuns ?? 1),
      metrics: args["--enable-metrics"] !== undefined, logs: args["--enable-continuous-cloudwatch-log"] === "true", sparkUi: args["--enable-spark-ui"] === "true", flex: j.ExecutionClass === "FLEX",
    });
    setScriptPath(j.Command?.ScriptLocation || "");
    setDirty(false);
  }, [existing.data]);
  useEffect(() => { if (isNew && !f.role && roles.data?.length && roles.data[0].description === "Trusts AWS Glue") setF(x => ({ ...x, role: roles.data![0] })); }, [roles.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = <K extends keyof JobForm>(k: K) => (v: JobForm[K]) => { setF(x => ({ ...x, [k]: v })); setDirty(true); };
  const spark = f.engine !== "pythonshell";

  const save = async (nextTab?: string): Promise<string | null> => {
    setErr(null);
    if (!f.name) { setErr(new Error("Enter a job name on the Job details tab.")); setTab("details"); return null; }
    if (!f.role) { setErr(new Error("Choose an IAM role on the Job details tab.")); setTab("details"); return null; }
    setBusy("save");
    try {
      await ensureAssets();
      const loc = scriptPath || `s3://${ASSETS}/scripts/${f.name}.py`;
      await writeS3Text(loc, f.script);
      const DefaultArguments: Record<string, string> = {
        "--job-language": "python", ...(spark ? { "--job-bookmark-option": f.bookmark } : {}), ...(f.tempDir ? { "--TempDir": f.tempDir } : {}),
        ...(f.metrics ? { "--enable-metrics": "true" } : {}), ...(f.logs ? { "--enable-continuous-cloudwatch-log": "true" } : {}), ...(f.sparkUi && spark ? { "--enable-spark-ui": "true" } : {}),
        ...Object.fromEntries(f.params.filter(p => p.k).map(p => [p.k.startsWith("--") ? p.k : `--${p.k}`, p.v])),
      };
      const def: any = {
        Role: f.role.value, Description: f.desc, Command: { Name: f.engine, ScriptLocation: loc, PythonVersion: spark ? "3" : "3.9" }, DefaultArguments,
        GlueVersion: f.glueVersion, MaxRetries: Number(f.retries), Timeout: Number(f.timeout), ExecutionProperty: { MaxConcurrentRuns: Number(f.maxConc) },
        ...(spark ? { WorkerType: f.worker, NumberOfWorkers: Number(f.workers), ...(f.flex ? { ExecutionClass: "FLEX" } : {}) } : { MaxCapacity: Number(f.dpu) }),
        ...(f.conns.length ? { Connections: { Connections: f.conns.map(c => c.value) } } : {}), ...(f.sec ? { SecurityConfiguration: f.sec.value } : {}),
      };
      if (isNew) await glue("CreateJob", { Name: f.name, ...def });
      else await glue("UpdateJob", { JobName: editName, JobUpdate: def });
      setScriptPath(loc); setDirty(false);
      flash.notify({ type: "success", content: `Successfully saved job ${f.name}.` });
      if (isNew) nav(editHref(f.name, nextTab || tab).slice(1), { replace: true });
      return f.name;
    } catch (e) { setErr(e); return null; } finally { setBusy(null); }
  };
  const run = async (args?: { k: string; v: string }[]) => {
    const n = dirty || isNew ? await save("runs") : f.name;
    if (!n) return;
    setBusy("run");
    try {
      const Arguments = Object.fromEntries((args || []).filter(p => p.k).map(p => [p.k.startsWith("--") ? p.k : `--${p.k}`, p.v]));
      const r = await glue("StartJobRun", { JobName: n, ...(Object.keys(Arguments).length ? { Arguments } : {}) });
      flash.notify({ type: "success", content: `Successfully started job ${n}. Run ID ${r.JobRunId.slice(0, 24)}…`, action: <Button href={editHref(n, "runs")}>View run details</Button> });
      setTab("runs");
    } catch (e) { flash.error(e, "Run failed"); } finally { setBusy(null); }
  };
  if (editName && existing.loading) return <Box textAlign="center" padding="xl"><Spinner size="large" /></Box>;
  if (existing.error) return <ErrorAlert error={existing.error} />;
  const lines = f.script.split("\n").length;
  const details = <SpaceBetween size="l">
    <Container header={<Header variant="h2">Basic properties</Header>}>
      <SpaceBetween size="l">
        <FormField label="Name"><Input value={f.name} disabled={!isNew} onChange={e => set("name")(e.detail.value)} placeholder="Untitled job" /></FormField>
        <FormField label="Description - optional"><Textarea value={f.desc} onChange={e => set("desc")(e.detail.value)} /></FormField>
        <FormField label="IAM Role" description="The role the job runs as. The emulator enforces IAM, so the role needs access to the data the script reads and writes."
          secondaryControl={<Button onClick={() => setNewRole("AWSGlueServiceRole-jobs")}>Create role</Button>}>
          <Select selectedOption={f.role} options={roles.data || []} onChange={e => set("role")(e.detail.selectedOption)} placeholder="Choose an IAM role" filteringType="auto" statusType={roles.loading ? "loading" : "finished"} />
        </FormField>
        <FormField label="Type"><Tiles columns={3} value={f.engine} onChange={e => { const v = e.detail.value; setF(x => ({ ...x, engine: v, glueVersion: v === "pythonshell" ? "3.0" : "4.0", timeout: v === "pythonshell" ? "2880" : "480" })); setDirty(true); }} items={[
          { value: "glueetl", label: "Spark", description: "Distributed processing with PySpark" }, { value: "gluestreaming", label: "Spark Streaming", description: "Streaming ETL" }, { value: "pythonshell", label: "Python Shell", description: "Plain Python, small jobs" },
        ]} /></FormField>
        <ColumnLayout columns={3}>
          <FormField label="Glue version"><Select selectedOption={opt(f.glueVersion, spark ? `Glue ${f.glueVersion}` : f.glueVersion === "3.0" ? "Glue 3.0 - Python 3.9" : `Glue ${f.glueVersion}`)} options={spark ? ["5.0", "4.0", "3.0", "2.0"].map(v => opt(v, `Glue ${v}`)) : [opt("3.0", "Glue 3.0 - Python 3.9"), opt("1.0", "Glue 1.0 - Python 3.6")]} onChange={e => set("glueVersion")(e.detail.selectedOption.value!)} /></FormField>
          <FormField label="Language"><Select selectedOption={opt("python", "Python 3")} options={[opt("python", "Python 3"), { value: "scala", label: "Scala", disabled: true }]} /></FormField>
          {spark ? <FormField label="Worker type"><Select selectedOption={opt(f.worker)} options={[opt("G.025X", "G.025X", "2 vCPU, 4 GB"), opt("G.1X", "G.1X", "4 vCPU, 16 GB"), opt("G.2X", "G.2X", "8 vCPU, 32 GB"), opt("G.4X", "G.4X", "16 vCPU, 64 GB"), opt("G.8X", "G.8X", "32 vCPU, 128 GB")]} onChange={e => set("worker")(e.detail.selectedOption.value!)} /></FormField>
            : <FormField label="Data processing units"><Select selectedOption={opt(f.dpu, f.dpu === "1" ? "1 DPU" : "1/16 DPU")} options={[opt("0.0625", "1/16 DPU"), opt("1", "1 DPU")]} onChange={e => set("dpu")(e.detail.selectedOption.value!)} /></FormField>}
        </ColumnLayout>
        {spark && <ColumnLayout columns={3}>
          <FormField label="Requested number of workers"><Input type="number" value={f.workers} onChange={e => set("workers")(e.detail.value)} /></FormField>
          <FormField label="Job bookmark"><Select selectedOption={opt(f.bookmark, { "job-bookmark-enable": "Enable", "job-bookmark-disable": "Disable", "job-bookmark-pause": "Pause" }[f.bookmark])} options={[opt("job-bookmark-enable", "Enable"), opt("job-bookmark-disable", "Disable"), opt("job-bookmark-pause", "Pause")]} onChange={e => set("bookmark")(e.detail.selectedOption.value!)} /></FormField>
          <FormField label="Flex execution"><Checkbox checked={f.flex} onChange={e => set("flex")(e.detail.checked)}>Use flex execution</Checkbox></FormField>
        </ColumnLayout>}
        <ColumnLayout columns={3}>
          <FormField label="Number of retries"><Input type="number" value={f.retries} onChange={e => set("retries")(e.detail.value)} /></FormField>
          <FormField label="Job timeout (minutes)"><Input type="number" value={f.timeout} onChange={e => set("timeout")(e.detail.value)} /></FormField>
          <FormField label="Maximum concurrency"><Input type="number" value={f.maxConc} onChange={e => set("maxConc")(e.detail.value)} /></FormField>
        </ColumnLayout>
      </SpaceBetween>
    </Container>
    <Container><ExpandableSection headerText="Advanced properties" defaultExpanded={!isNew}>
      <SpaceBetween size="l">
        <FormField label="Script path"><Box>{scriptPath || `s3://${ASSETS}/scripts/${f.name || "<job name>"}.py`}</Box></FormField>
        <FormField label="Temporary path"><Input value={f.tempDir} onChange={e => set("tempDir")(e.detail.value)} /></FormField>
        <SpaceBetween size="xs">
          <Checkbox checked={f.metrics} onChange={e => set("metrics")(e.detail.checked)}>Job metrics</Checkbox>
          <Checkbox checked={f.logs} onChange={e => set("logs")(e.detail.checked)}>Continuous logging</Checkbox>
          {spark && <Checkbox checked={f.sparkUi} onChange={e => set("sparkUi")(e.detail.checked)}>Spark UI</Checkbox>}
        </SpaceBetween>
        <FormField label="Connections"><Multiselect selectedOptions={f.conns} options={conns.data || []} onChange={e => set("conns")(e.detail.selectedOptions as any)} placeholder="Choose connections" empty="No connections" /></FormField>
        <FormField label="Security configuration"><Select selectedOption={f.sec} options={secs.data || []} onChange={e => set("sec")(e.detail.selectedOption)} placeholder="Choose a security configuration" empty="No security configurations" /></FormField>
        <Table variant="embedded" items={f.params.map((p, i) => ({ ...p, i }))} header={<Header variant="h3" description="Default arguments passed to every run, read with getResolvedOptions." actions={<Button onClick={() => set("params")([...f.params, { k: "--", v: "" }])}>Add new parameter</Button>}>Job parameters</Header>}
          empty={<Box color="text-body-secondary">No parameters</Box>}
          columnDefinitions={[{ id: "k", header: "Key", cell: (p: any) => <Input value={p.k} onChange={e => set("params")(f.params.map((x, j) => j === p.i ? { ...x, k: e.detail.value } : x))} placeholder="--key" /> },
            { id: "v", header: "Value", cell: (p: any) => <Input value={p.v} onChange={e => set("params")(f.params.map((x, j) => j === p.i ? { ...x, v: e.detail.value } : x))} /> },
            { id: "x", header: "", width: 90, cell: (p: any) => <Button variant="inline-link" onClick={() => set("params")(f.params.filter((_, j) => j !== p.i))}>Remove</Button> }]} />
      </SpaceBetween>
    </ExpandableSection></Container>
  </SpaceBetween>;
  return (
    <ContentLayout header={<Header variant="h1" description={dirty ? "Unsaved changes" : undefined} actions={<SpaceBetween direction="horizontal" size="xs">
      <ButtonDropdown disabled={isNew} items={[{ id: "args", text: "Run with parameters" }, { id: "download", text: "Download script" }, { id: "delete", text: "Delete job" }]} onItemClick={e => {
        if (e.detail.id === "delete") setDel(true);
        if (e.detail.id === "args") setRunArgs([{ k: "--", v: "" }]);
        if (e.detail.id === "download") { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([f.script], { type: "text/x-python" })); a.download = `${f.name}.py`; a.click(); }
      }}>Actions</ButtonDropdown>
      <Button loading={busy === "save"} onClick={() => save()}>Save</Button>
      <Button variant="primary" loading={busy === "run"} onClick={() => run()}>Run</Button>
    </SpaceBetween>}>{f.name || "Untitled job"}</Header>}>
      <SpaceBetween size="l">
        <ErrorAlert error={err} />
        <Tabs activeTabId={tab} onChange={e => setTab(e.detail.activeTabId)} tabs={[
          { id: "script", label: "Script", content: <Container header={<Header variant="h2" description={`${spark ? "PySpark" : "Python"} · ${lines} lines`} actions={<Button onClick={() => set("script")(spark ? SPARK_TEMPLATE : PYSHELL_TEMPLATE)}>Reset to template</Button>}>Script</Header>}>
              <div onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); save(); } }} className="code-editor">
                <Textarea rows={Math.max(24, Math.min(lines + 2, 48))} value={f.script} onChange={e => set("script")(e.detail.value)} spellcheck={false} />
              </div>
            </Container> },
          { id: "details", label: "Job details", content: details },
          { id: "runs", label: "Runs", content: isNew ? <Container><Box color="text-body-secondary">Save the job to see its runs.</Box></Container> : <Runs job={editName!} /> },
          { id: "dq", label: "Data quality", content: <Container><EmulatorNote>Add data quality rules from a table's Data quality tab in the Data Catalog.</EmulatorNote></Container> },
          { id: "sched", label: "Schedules", content: isNew ? <Container><Box color="text-body-secondary">Save the job to add schedules.</Box></Container> : <Schedules job={editName!} /> },
          { id: "vc", label: "Version Control", content: <Container><EmulatorNote>Git integration isn't available in the emulator.</EmulatorNote></Container> },
        ]} />
      </SpaceBetween>
      {del && <ActionModal visible danger onDismiss={() => setDel(false)} header={`Delete ${f.name}?`} ok="Delete" onOk={async () => { await glue("DeleteJob", { JobName: f.name }); flash.notify({ type: "success", content: `Deleted ${f.name}.` }); nav("/glue/jobs"); }}>
        <Box>The job and its run history are deleted. The script at {scriptPath} stays in S3.</Box></ActionModal>}
      {newRole !== null && <ActionModal visible onDismiss={() => setNewRole(null)} header="Create IAM role for AWS Glue" ok="Create role" disabled={!newRole} onOk={async () => {
        const a = await createGlueRole(newRole); await roles.reload(); set("role")(opt(a, newRole)); flash.notify({ type: "success", content: `Created role ${newRole}.` });
      }}>
        <FormField label="Role name" description="The role trusts glue.amazonaws.com and gets AWSGlueServiceRole and AmazonS3FullAccess."><Input value={newRole} onChange={e => setNewRole(e.detail.value)} /></FormField>
      </ActionModal>}
      {runArgs && <ActionModal visible onDismiss={() => setRunArgs(null)} header="Run with parameters" ok="Run job" size="medium" onOk={async () => { await run(runArgs); }}>
        <Table variant="embedded" items={runArgs.map((p, i) => ({ ...p, i }))} header={<Header variant="h3" actions={<Button onClick={() => setRunArgs([...runArgs, { k: "--", v: "" }])}>Add parameter</Button>}>Parameters for this run</Header>}
          columnDefinitions={[{ id: "k", header: "Key", cell: (p: any) => <Input value={p.k} onChange={e => setRunArgs(runArgs.map((x, j) => j === p.i ? { ...x, k: e.detail.value } : x))} /> },
            { id: "v", header: "Value", cell: (p: any) => <Input value={p.v} onChange={e => setRunArgs(runArgs.map((x, j) => j === p.i ? { ...x, v: e.detail.value } : x))} /> }]} />
      </ActionModal>}
    </ContentLayout>
  );
}

export function JobRunMonitoring() {
  useCrumbs(crumbs({ text: "Job run monitoring" }));
  const d = useAsync(async () => {
    const jobs = await glueAll("GetJobs", "Jobs");
    const runs = (await Promise.all(jobs.map((j: any) => glueAll("GetJobRuns", "JobRuns", { JobName: j.Name }).then(r => r.map((x: any) => ({ ...x, type: JOB_TYPE(j) }))).catch(() => [])))).flat();
    return runs.sort((a: any, b: any) => String(b.StartedOn).localeCompare(String(a.StartedOn)));
  }, []);
  const [detail, setDetail] = useState<any>(null);
  const runs = d.data || [];
  const count = (re: RegExp) => runs.filter((r: any) => re.test(r.JobRunState)).length;
  const dpuHours = runs.reduce((s: number, r: any) => s + ((r.MaxCapacity ?? r.AllocatedCapacity ?? 0) * (r.ExecutionTime || 0)) / 3600, 0);
  return (
    <SpaceBetween size="l">
      <Box padding={{ horizontal: "l", top: "l" }}>
        <Container header={<Header variant="h2" actions={<Button iconName="refresh" ariaLabel="Refresh" onClick={() => d.reload()} />}>Job runs summary</Header>}>
          <ColumnLayout columns={6} variant="text-grid">
            {([["Total runs", runs.length], ["Running", count(/RUNNING|STARTING|WAITING/)], ["Canceled", count(/STOPPED|STOPPING/)], ["Success", count(/SUCCEEDED/)], ["Failed", count(/FAILED|ERROR|TIMEOUT/)], ["DPU hours", dpuHours.toFixed(3)]] as [string, any][])
              .map(([l, v]) => <div key={l}><Box variant="awsui-key-label">{l}</Box><Box fontSize="display-l" fontWeight="bold">{v}</Box></div>)}
          </ColumnLayout>
        </Container>
      </Box>
      <ResourcePage<any> title="Job runs" load={async () => runs} deps={[d.data]} trackBy="Id" multi={false}
        primaryActions={[{ id: "view", text: "View run details", disabled: s => s.length !== 1, run: s => setDetail(s[0]) }]}
        columns={[
          { id: "j", header: "Job name", cell: r => <Link href={editHref(r.JobName, "runs")}>{r.JobName}</Link>, sortingField: "JobName" },
          { id: "t", header: "Type", cell: r => r.type },
          { id: "s", header: "Run status", cell: r => <St s={r.JobRunState} /> },
          { id: "st", header: "Start time", cell: r => fmt(r.StartedOn) },
          { id: "e", header: "End time", cell: r => fmt(r.CompletedOn) },
          { id: "d", header: "Run time", cell: r => dur(r.ExecutionTime) },
          { id: "c", header: "Capacity", cell: r => r.MaxCapacity ?? "-" },
          { id: "w", header: "Worker type", cell: r => r.WorkerType || "-" },
          { id: "g", header: "Glue version", cell: r => r.GlueVersion || "-" },
          { id: "err", header: "Error", cell: r => r.ErrorMessage || "-" },
        ]} />
      <Modal visible={!!detail} onDismiss={() => setDetail(null)} size="large" header={`Run of ${detail?.JobName}`}>
        {detail && <SpaceBetween size="m">
          {detail.ErrorMessage && <Alert type="error">{detail.ErrorMessage}</Alert>}
          <ColumnLayout columns={3} variant="text-grid">
            <V label="Run ID">{detail.Id}</V><V label="Status"><St s={detail.JobRunState} /></V><V label="Duration">{dur(detail.ExecutionTime)}</V>
            <V label="Start">{fmt(detail.StartedOn)}</V><V label="End">{fmt(detail.CompletedOn)}</V><V label="Arguments">{Object.entries(detail.Arguments || {}).map(([k, v]) => `${k}=${v}`).join(" ") || "-"}</V>
          </ColumnLayout>
        </SpaceBetween>}
      </Modal>
    </SpaceBetween>
  );
}
