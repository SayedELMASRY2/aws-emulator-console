"use strict";

navGroup("Analytics", [{ path: "/glue", label: "Glue", keywords: "etl catalog crawler job" }]);

const GLUE_ROLE = () => ensureServiceRole("EmuConsoleGlueRole", "glue.amazonaws.com", "arn:aws:iam::aws:policy/service-role/AWSGlueServiceRole");

route("/glue", async () => {
  const page = h("div", pageHeader("AWS Glue", "Data Catalog, crawlers and ETL jobs."));

  const databases = () => resourcePanel({
    title: "Databases",
    rowKey: "Name",
    load: async () => API.all("glue", "GetDatabases", {}, "DatabaseList"),
    columns: [
      { label: "Name", render: d => h("a", { href: `#/glue/db/${encodeURIComponent(d.Name)}` }, d.Name) },
      { label: "Description", key: "Description" },
      { label: "Location", key: "LocationUri" },
      { label: "Created", render: d => fmtDate(d.CreateTime) },
    ],
    onRowClick: d => go(`/glue/db/${encodeURIComponent(d.Name)}`),
    create: {
      label: "Create database",
      open: () => formModal({
        title: "Create database",
        fields: [
          { name: "name", label: "Name", required: true, help: "Lowercase letters, numbers and underscores." },
          { name: "desc", label: "Description" },
          { name: "loc", label: "Location (optional)", placeholder: "s3://my-bucket/warehouse/" },
        ],
        onSubmit: async v => {
          const input = { Name: v.name };
          if (v.desc) input.Description = v.desc;
          if (v.loc) input.LocationUri = v.loc;
          await API.call("glue", "CreateDatabase", { DatabaseInput: input });
          renderRoute();
        },
      }),
    },
    actions: [{ label: "Delete", kind: "danger", icon: "trash", confirm: "Delete database",
      run: async rows => { for (const d of rows) await API.call("glue", "DeleteDatabase", { Name: d.Name }); } }],
  });

  const crawlers = () => resourcePanel({
    title: "Crawlers",
    rowKey: "Name",
    load: async () => API.all("glue", "GetCrawlers", {}, "Crawlers"),
    columns: [
      { label: "Name", key: "Name" },
      { label: "State", render: c => badge(c.State) },
      { label: "Database", key: "DatabaseName" },
      { label: "S3 targets", render: c => (c.Targets?.S3Targets || []).map(t => t.Path).join(", ") },
      { label: "Last run", render: c => c.LastCrawl ? h("span", badge(c.LastCrawl.Status), " ", fmtDate(c.LastCrawl.StartTime)) : "—" },
    ],
    poll: c => c.State && c.State !== "READY",
    onRowClick: c => showJson(c.Name, c),
    create: {
      label: "Create crawler",
      open: () => formModal({
        title: "Create crawler",
        fields: [
          { name: "name", label: "Name", required: true },
          { name: "path", label: "S3 path to crawl", required: true, placeholder: "s3://my-bucket/data/" },
          { name: "db", label: "Target database", type: "select", required: true, options: async () => (await API.all("glue", "GetDatabases", {}, "DatabaseList")).map(d => d.Name) },
          { name: "prefix", label: "Table prefix (optional)" },
          { name: "schedule", label: "Schedule (optional)", placeholder: "cron(0 * * * ? *)" },
        ],
        onSubmit: async v => {
          const p = { Name: v.name, Role: await GLUE_ROLE(), DatabaseName: v.db, Targets: { S3Targets: [{ Path: v.path }] } };
          if (v.prefix) p.TablePrefix = v.prefix;
          if (v.schedule) p.Schedule = v.schedule;
          await API.call("glue", "CreateCrawler", p);
          renderRoute();
        },
      }),
    },
    actions: [
      { label: "Run", icon: "play", run: async rows => { for (const c of rows) await API.call("glue", "StartCrawler", { Name: c.Name }); }, done: "Crawler started" },
      { label: "Stop", icon: "stop", run: async rows => { for (const c of rows) await API.call("glue", "StopCrawler", { Name: c.Name }); } },
      { label: "Delete", kind: "danger", icon: "trash", confirm: "Delete crawler", run: async rows => { for (const c of rows) await API.call("glue", "DeleteCrawler", { Name: c.Name }); } },
    ],
  });

  const jobs = () => resourcePanel({
    title: "ETL jobs",
    rowKey: "Name",
    load: async () => API.all("glue", "GetJobs", {}, "Jobs"),
    columns: [
      { label: "Name", render: j => h("a", { href: `#/glue/job/${encodeURIComponent(j.Name)}` }, j.Name) },
      { label: "Type", render: j => j.Command?.Name },
      { label: "Glue version", key: "GlueVersion" },
      { label: "Script", render: j => j.Command?.ScriptLocation },
      { label: "Workers", render: j => j.NumberOfWorkers ? `${j.NumberOfWorkers} × ${j.WorkerType}` : "—" },
      { label: "Modified", render: j => fmtDate(j.LastModifiedOn) },
    ],
    onRowClick: j => go(`/glue/job/${encodeURIComponent(j.Name)}`),
    create: { label: "Create job", open: () => glueJobForm() },
    actions: [
      { label: "Run", icon: "play", run: async rows => { for (const j of rows) await API.call("glue", "StartJobRun", { JobName: j.Name }); }, done: "Job run started" },
      { label: "Delete", kind: "danger", icon: "trash", confirm: "Delete job", run: async rows => { for (const j of rows) await API.call("glue", "DeleteJob", { JobName: j.Name }); } },
    ],
  });

  const connections = () => resourcePanel({
    title: "Connections",
    rowKey: "Name",
    load: async () => API.all("glue", "GetConnections", {}, "ConnectionList"),
    columns: [
      { label: "Name", key: "Name" }, { label: "Type", key: "ConnectionType" },
      { label: "JDBC URL", render: c => c.ConnectionProperties?.JDBC_CONNECTION_URL },
      { label: "Created", render: c => fmtDate(c.CreationTime) },
    ],
    onRowClick: c => showJson(c.Name, c),
    create: {
      label: "Create connection",
      open: () => formModal({
        title: "Create JDBC connection",
        fields: [
          { name: "name", label: "Name", required: true },
          { name: "url", label: "JDBC URL", required: true, placeholder: "jdbc:postgresql://host:5432/db" },
          { name: "user", label: "Username", required: true },
          { name: "pass", label: "Password", type: "password", required: true, help: "A test value for the emulator only." },
        ],
        onSubmit: async v => {
          await API.call("glue", "CreateConnection", { ConnectionInput: { Name: v.name, ConnectionType: "JDBC",
            ConnectionProperties: { JDBC_CONNECTION_URL: v.url, USERNAME: v.user, PASSWORD: v.pass } } });
          renderRoute();
        },
      }),
    },
    actions: [{ label: "Delete", kind: "danger", icon: "trash", confirm: "Delete connection", run: async rows => { for (const c of rows) await API.call("glue", "DeleteConnection", { ConnectionName: c.Name }); } }],
  });

  page.appendChild(tabs([
    { label: "Databases", render: databases }, { label: "Crawlers", render: crawlers },
    { label: "ETL jobs", render: jobs }, { label: "Connections", render: connections },
  ]));
  return page;
});

const SAMPLE_GLUE_SCRIPT = `import sys
from awsglue.utils import getResolvedOptions
from pyspark.context import SparkContext
from awsglue.context import GlueContext
from awsglue.job import Job

args = getResolvedOptions(sys.argv, ["JOB_NAME"])
sc = SparkContext()
glue = GlueContext(sc)
job = Job(glue)
job.init(args["JOB_NAME"], args)

# your ETL here

job.commit()
`;

function glueJobForm(existing) {
  return formModal({
    title: existing ? `Edit job ${existing.Name}` : "Create ETL job", wide: true, submitLabel: existing ? "Save" : "Create",
    fields: [
      { name: "name", label: "Name", required: true, default: existing?.Name },
      { name: "type", label: "Type", type: "select", required: true, default: existing?.Command?.Name || "glueetl",
        options: [{ value: "glueetl", label: "Spark (glueetl)" }, { value: "pythonshell", label: "Python shell" }, { value: "gluestreaming", label: "Spark streaming" }] },
      { name: "version", label: "Glue version", type: "select", required: true, default: existing?.GlueVersion || "5.0", options: ["5.0", "4.0", "3.0"] },
      { name: "bucket", label: "Bucket for the script", type: "select", required: true, options: () => Pick.buckets(),
        help: "The script is uploaded to s3://<bucket>/scripts/<job>.py" },
      { name: "script", label: "Script", type: "code", rows: 14, default: SAMPLE_GLUE_SCRIPT },
      { name: "workers", label: "Number of workers", type: "number", default: existing?.NumberOfWorkers || 2, showIf: v => v.type !== "pythonshell" },
      { name: "workerType", label: "Worker type", type: "select", required: true, default: existing?.WorkerType || "G.1X", options: ["G.1X", "G.2X", "G.4X", "G.025X"], showIf: v => v.type !== "pythonshell" },
      { name: "args", label: "Default arguments (JSON, optional)", type: "json", rows: 3, default: existing?.DefaultArguments || { "--job-language": "python" } },
    ],
    onSubmit: async v => {
      const key = `scripts/${v.name}.py`;
      await API.call("s3", "PutObject", { Bucket: v.bucket, Key: key, Body: v.script, ContentType: "text/x-python" });
      const spec = {
        Role: await GLUE_ROLE(),
        Command: { Name: v.type, ScriptLocation: `s3://${v.bucket}/${key}`, PythonVersion: "3" },
        GlueVersion: v.type === "pythonshell" ? "3.0" : v.version,
        DefaultArguments: v.args || {},
      };
      if (v.type === "pythonshell") spec.MaxCapacity = 0.0625;
      else { spec.NumberOfWorkers = v.workers || 2; spec.WorkerType = v.workerType; }
      if (existing) await API.call("glue", "UpdateJob", { JobName: v.name, JobUpdate: spec });
      else await API.call("glue", "CreateJob", { Name: v.name, ...spec });
      toast(existing ? "Job saved" : "Job created");
      renderRoute();
    },
  });
}

route("/glue/job/:job", async ({ job }) => {
  const j = (await API.call("glue", "GetJob", { JobName: job })).Job;
  const page = h("div", crumbs(["Glue", "#/glue"], "Jobs", job),
    pageHeader(job, `${j.Command?.Name} · Glue ${j.GlueVersion || ""}`,
      button("Edit", () => glueJobForm(j)),
      button("Run job", async () => { try { await API.call("glue", "StartJobRun", { JobName: job }); toast("Run started"); runs.refresh(); } catch (e) { toastErr(e); } }, { kind: "primary", icon: "play" })));
  const runs = resourcePanel({
    title: "Runs",
    rowKey: "Id",
    load: async () => (await API.call("glue", "GetJobRuns", { JobName: job })).JobRuns || [],
    columns: [
      { label: "Run ID", class: "mono", render: r => r.Id.slice(0, 18) + "…" },
      { label: "State", render: r => badge(r.JobRunState) },
      { label: "Started", render: r => fmtDate(r.StartedOn) },
      { label: "Duration", render: r => (r.ExecutionTime != null ? r.ExecutionTime + " s" : "—") },
      { label: "Error", class: "wrap", key: "ErrorMessage" },
    ],
    poll: r => ["STARTING", "RUNNING", "STOPPING", "WAITING"].includes(r.JobRunState),
    onRowClick: r => showJson(r.Id, r),
    empty: "No runs yet.",
    actions: [{ label: "Stop", icon: "stop", run: async rows => { await API.call("glue", "BatchStopJobRun", { JobName: job, JobRunIds: rows.map(r => r.Id) }); } }],
  });
  page.append(runs, h("section", { class: "panel" }, h("div", { class: "panel-head" }, h("h2", "Definition")), h("div", { class: "panel-pad" }, jsonView(j))));
  return page;
});

route("/glue/db/:db", async ({ db }) => {
  const page = h("div", crumbs(["Glue", "#/glue"], "Databases", db), pageHeader(db, "Tables in this catalog database."));
  const panel = resourcePanel({
    title: "Tables",
    rowKey: "Name",
    load: async () => API.all("glue", "GetTables", { DatabaseName: db }, "TableList"),
    columns: [
      { label: "Name", key: "Name" },
      { label: "Columns", render: t => (t.StorageDescriptor?.Columns || []).map(c => `${c.Name}:${c.Type}`).join(", ") },
      { label: "Partitions", render: t => (t.PartitionKeys || []).map(c => c.Name).join(", ") || "—" },
      { label: "Location", key: "StorageDescriptor.Location" },
      { label: "Format", render: t => t.Parameters?.classification || "—" },
    ],
    onRowClick: t => showJson(`${db}.${t.Name}`, t),
    create: {
      label: "Create table",
      open: () => formModal({
        title: "Create table", wide: true,
        fields: [
          { name: "name", label: "Table name", required: true },
          { name: "location", label: "S3 location", required: true, placeholder: "s3://my-bucket/data/orders/" },
          { name: "format", label: "Format", type: "select", required: true, default: "parquet", options: ["parquet", "csv", "json", "orc", "avro"] },
          { name: "columns", label: "Columns", type: "textarea", rows: 5, required: true, default: "id int\nname string\ncreated_at timestamp", help: "One per line: name type" },
          { name: "partitions", label: "Partition keys (optional)", type: "textarea", rows: 2, placeholder: "dt string" },
        ],
        onSubmit: async v => {
          const parse = s => s.split("\n").map(l => l.trim()).filter(Boolean).map(l => { const [Name, ...t] = l.split(/\s+/); return { Name, Type: t.join(" ") || "string" }; });
          const formats = {
            parquet: ["org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat", "org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat", "org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe"],
            orc: ["org.apache.hadoop.hive.ql.io.orc.OrcInputFormat", "org.apache.hadoop.hive.ql.io.orc.OrcOutputFormat", "org.apache.hadoop.hive.ql.io.orc.OrcSerde"],
            csv: ["org.apache.hadoop.mapred.TextInputFormat", "org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat", "org.apache.hadoop.hive.serde2.lazy.LazySimpleSerDe"],
            json: ["org.apache.hadoop.mapred.TextInputFormat", "org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat", "org.openx.data.jsonserde.JsonSerDe"],
            avro: ["org.apache.hadoop.hive.ql.io.avro.AvroContainerInputFormat", "org.apache.hadoop.hive.ql.io.avro.AvroContainerOutputFormat", "org.apache.hadoop.hive.serde2.avro.AvroSerDe"],
          }[v.format];
          const serde = { SerializationLibrary: formats[2] };
          if (v.format === "csv") serde.Parameters = { "field.delim": "," };
          await API.call("glue", "CreateTable", { DatabaseName: db, TableInput: {
            Name: v.name, TableType: "EXTERNAL_TABLE", Parameters: { classification: v.format },
            PartitionKeys: parse(v.partitions || ""),
            StorageDescriptor: { Columns: parse(v.columns), Location: v.location, InputFormat: formats[0], OutputFormat: formats[1], SerdeInfo: serde },
          } });
          panel.refresh();
        },
      }),
    },
    actions: [{ label: "Delete", kind: "danger", icon: "trash", confirm: "Delete table",
      run: async rows => { await API.call("glue", "BatchDeleteTable", { DatabaseName: db, TablesToDelete: rows.map(t => t.Name) }); } }],
  });
  page.appendChild(panel);
  return page;
});
