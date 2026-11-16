"use strict";
// Extra services that pair well with the main ones.

navGroup("Compute", [{ path: "/lambda", label: "Lambda", keywords: "function serverless" }]);
navGroup("Analytics", [
  { path: "/athena", label: "Athena", keywords: "sql query" },
  { path: "/kinesis", label: "Kinesis Data Streams", keywords: "stream records" },
]);
navGroup("Integration", [
  { path: "/sqs", label: "SQS", keywords: "queue message" },
  { path: "/sns", label: "SNS", keywords: "topic notification pubsub" },
  { path: "/events", label: "EventBridge", keywords: "rule bus schedule event" },
  { path: "/stepfunctions", label: "Step Functions", keywords: "state machine workflow" },
]);
navGroup("Security & management", [
  { path: "/iam", label: "IAM", keywords: "user role policy" },
  { path: "/secrets", label: "Secrets Manager", keywords: "secret password" },
  { path: "/ssm", label: "Parameter Store", keywords: "ssm parameter config" },
  { path: "/logs", label: "CloudWatch Logs", keywords: "log group stream" },
  { path: "/cloudformation", label: "CloudFormation", keywords: "stack template iac" },
]);

// ---------------- Lambda ----------------
const LAMBDA_ROLE = () => ensureServiceRole("EmuConsoleLambdaRole", "lambda.amazonaws.com", "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole");
const LAMBDA_SAMPLES = {
  python: { file: "index.py", handler: "index.handler", code: `import json\n\ndef handler(event, context):\n    print("event:", json.dumps(event))\n    return {"statusCode": 200, "body": json.dumps({"hello": event.get("name", "world")})}\n` },
  nodejs: { file: "index.mjs", handler: "index.handler", code: `export const handler = async (event) => {\n  console.log("event:", JSON.stringify(event));\n  return { statusCode: 200, body: JSON.stringify({ hello: event.name ?? "world" }) };\n};\n` },
};
const LAMBDA_RUNTIMES = ["python3.13", "python3.12", "nodejs22.x", "nodejs20.x"];
const lambdaLang = rt => (rt.startsWith("node") ? "nodejs" : "python");

route("/lambda", async () => {
  const page = h("div", pageHeader("Lambda", "Functions you can write, invoke and inspect."));
  const panel = resourcePanel({
    title: "Functions",
    rowKey: "FunctionName",
    load: async () => API.all("lambda", "ListFunctions", {}, "Functions", "Marker", "NextMarker"),
    columns: [
      { label: "Name", render: f => h("a", { href: `#/lambda/f/${encodeURIComponent(f.FunctionName)}` }, f.FunctionName) },
      { label: "Runtime", key: "Runtime" }, { label: "Handler", key: "Handler" },
      { label: "Memory", class: "num", render: f => f.MemorySize + " MB" }, { label: "Timeout", class: "num", render: f => f.Timeout + " s" },
      { label: "State", render: f => badge(f.State || "Active") }, { label: "Modified", render: f => fmtDate(f.LastModified) },
    ],
    onRowClick: f => go(`/lambda/f/${encodeURIComponent(f.FunctionName)}`),
    create: {
      label: "Create function",
      open: () => formModal({
        title: "Create function", wide: true,
        fields: [
          { name: "name", label: "Function name", required: true },
          { name: "runtime", label: "Runtime", type: "select", required: true, default: "python3.13", options: LAMBDA_RUNTIMES },
          { name: "code", label: "Code (leave empty for a starter handler)", type: "code", rows: 10 },
          { name: "memory", label: "Memory (MB)", type: "number", default: 128 },
          { name: "timeout", label: "Timeout (s)", type: "number", default: 30 },
          { name: "env", label: "Environment variables (optional)", type: "textarea", rows: 3, placeholder: "KEY=value" },
        ],
        onSubmit: async v => {
          const s = LAMBDA_SAMPLES[lambdaLang(v.runtime)];
          const env = {};
          (v.env || "").split("\n").map(l => l.trim()).filter(Boolean).forEach(l => { const i = l.indexOf("="); env[l.slice(0, i)] = l.slice(i + 1); });
          await API.req("POST", "/api/lambda/code", { name: v.name, runtime: v.runtime, handler: s.handler, filename: s.file, code: v.code || s.code,
            memory: v.memory, timeout: v.timeout, env: Object.keys(env).length ? env : undefined, role: await LAMBDA_ROLE() });
          go(`/lambda/f/${encodeURIComponent(v.name)}`);
        },
      }),
    },
    actions: [{ label: "Delete", kind: "danger", icon: "trash", confirm: "Delete function",
      run: async rows => { for (const f of rows) await API.call("lambda", "DeleteFunction", { FunctionName: f.FunctionName }); } }],
  });
  page.appendChild(panel);
  return page;
});

route("/lambda/f/:name", async ({ name }) => {
  const f = await API.call("lambda", "GetFunction", { FunctionName: name });
  const cfg = f.Configuration;
  const lang = lambdaLang(cfg.Runtime || "python");
  const page = h("div", crumbs(["Lambda", "#/lambda"], name), pageHeader(name, `${cfg.Runtime} · ${cfg.Handler} · ${cfg.MemorySize} MB`, badge(cfg.State || "Active")));

  const test = () => {
    const payload = h("textarea", { class: "input mono", rows: 6, spellcheck: "false" }, JSON.stringify({ name: "emulator" }, null, 2));
    const out = h("div");
    const run = async () => {
      clear(out).appendChild(h("div", { class: "loading" }, "Invoking…"));
      try {
        JSON.parse(payload.value);
        const t0 = performance.now();
        const r = await API.call("lambda", "Invoke", { FunctionName: name, Payload: payload.value, LogType: "Tail" });
        const ms = Math.round(performance.now() - t0);
        let logs = "";
        try { logs = r.LogResult ? decodeURIComponent(escape(atob(r.LogResult))) : ""; } catch { logs = r.LogResult || ""; }
        let body = r.Payload;
        try { body = JSON.stringify(JSON.parse(r.Payload), null, 2); } catch { /* keep raw */ }
        clear(out).append(
          h("div", { class: "row", style: { margin: "6px 0 10px" } }, badge(r.FunctionError ? "Error: " + r.FunctionError : "Succeeded " + (r.StatusCode || ""), r.FunctionError ? "bad" : "ok"), h("span", { class: "muted" }, `${ms} ms round trip`)),
          h("div", { class: "muted" }, "Response"), codeBlock(body ?? ""),
          logs ? [h("div", { class: "muted", style: { marginTop: "10px" } }, "Log output"), codeBlock(logs)] : null);
      } catch (e) { clear(out).appendChild(errorBox(e)); }
    };
    return h("section", { class: "panel" }, h("div", { class: "panel-head" }, h("h2", "Test event")),
      h("div", { class: "querybox" }, payload, h("div", button("Invoke", run, { kind: "primary", icon: "play" })), out));
  };
  const code = () => {
    const ta = h("textarea", { class: "input mono", rows: 18, spellcheck: "false" }, LAMBDA_SAMPLES[lang].code);
    ta.addEventListener("keydown", e => { if (e.key === "Tab") { e.preventDefault(); ta.setRangeText("    ", ta.selectionStart, ta.selectionEnd, "end"); } });
    return h("section", { class: "panel" },
      h("div", { class: "panel-head" }, h("div", h("h2", "Code"), h("p", { class: "muted" }, `Deploying replaces the function's code with this single file (${LAMBDA_SAMPLES[lang].file}).`)),
        button("Deploy", async () => {
          try { await API.req("POST", "/api/lambda/code", { name, update: true, filename: cfg.Handler.split(".")[0] + (lang === "nodejs" ? ".mjs" : ".py"), code: ta.value }); toast("Deployed"); }
          catch (e) { toastErr(e); }
        }, { kind: "primary" })),
      h("div", { class: "panel-pad" }, ta));
  };
  const config = () => h("div", { class: "panel" }, kv([
    ["ARN", cfg.FunctionArn], ["Role", cfg.Role], ["Runtime", cfg.Runtime], ["Handler", cfg.Handler],
    ["Memory", cfg.MemorySize + " MB"], ["Timeout", cfg.Timeout + " s"], ["Code size", fmtBytes(cfg.CodeSize)],
    ["Environment", Object.entries(cfg.Environment?.Variables || {}).map(([k, v]) => `${k}=${v}`).join(", ")],
  ]), h("div", { class: "panel-pad" }, jsonView(f)));
  page.appendChild(tabs([{ label: "Test", render: test }, { label: "Code", render: code }, { label: "Configuration", render: config }]));
  return page;
});

// ---------------- SQS ----------------
route("/sqs", async () => {
  const page = h("div", pageHeader("SQS", "Message queues."));
  const panel = resourcePanel({
    title: "Queues",
    rowKey: "url",
    load: async () => {
      const urls = (await API.call("sqs", "ListQueues", { MaxResults: 1000 })).QueueUrls || [];
      return Promise.all(urls.map(async url => {
        const a = (await API.call("sqs", "GetQueueAttributes", { QueueUrl: url, AttributeNames: ["All"] })).Attributes || {};
        return { url, name: url.split("/").pop(), a };
      }));
    },
    columns: [
      { label: "Name", render: q2 => h("a", { href: `#/sqs/q/${encodeURIComponent(q2.url)}` }, q2.name) },
      { label: "Type", render: q2 => (q2.a.FifoQueue === "true" ? "FIFO" : "Standard") },
      { label: "Available", class: "num", render: q2 => q2.a.ApproximateNumberOfMessages },
      { label: "In flight", class: "num", render: q2 => q2.a.ApproximateNumberOfMessagesNotVisible },
      { label: "Visibility timeout", class: "num", render: q2 => q2.a.VisibilityTimeout + " s" },
      { label: "Created", render: q2 => fmtDate(Number(q2.a.CreatedTimestamp)) },
    ],
    onRowClick: q2 => go(`/sqs/q/${encodeURIComponent(q2.url)}`),
    create: {
      label: "Create queue",
      open: () => formModal({
        title: "Create queue",
        fields: [
          { name: "name", label: "Name", required: true },
          { name: "fifo", label: "FIFO queue", type: "checkbox" },
          { name: "dedup", label: "Content-based deduplication", type: "checkbox", showIf: v => v.fifo },
          { name: "vis", label: "Visibility timeout (s)", type: "number", default: 30 },
          { name: "dlq", label: "Dead-letter queue (optional)", type: "select", placeholder: "None", options: async () => ((await API.call("sqs", "ListQueues")).QueueUrls || []).map(u => ({ value: u, label: u.split("/").pop() })) },
          { name: "maxReceive", label: "Max receives before moving to the DLQ", type: "number", default: 3, showIf: v => !!v.dlq },
        ],
        onSubmit: async v => {
          const attrs = { VisibilityTimeout: String(v.vis ?? 30) };
          let name = v.name;
          if (v.fifo) { attrs.FifoQueue = "true"; if (!name.endsWith(".fifo")) name += ".fifo"; if (v.dedup) attrs.ContentBasedDeduplication = "true"; }
          if (v.dlq) {
            const arn = (await API.call("sqs", "GetQueueAttributes", { QueueUrl: v.dlq, AttributeNames: ["QueueArn"] })).Attributes.QueueArn;
            attrs.RedrivePolicy = JSON.stringify({ deadLetterTargetArn: arn, maxReceiveCount: v.maxReceive || 3 });
          }
          await API.call("sqs", "CreateQueue", { QueueName: name, Attributes: attrs });
          panel.refresh();
        },
      }),
    },
    actions: [
      { label: "Purge", confirm: "Purge all messages from", run: async rows => { for (const r of rows) await API.call("sqs", "PurgeQueue", { QueueUrl: r.url }); } },
      { label: "Delete", kind: "danger", icon: "trash", confirm: "Delete queue", run: async rows => { for (const r of rows) await API.call("sqs", "DeleteQueue", { QueueUrl: r.url }); } },
    ],
  });
  page.appendChild(panel);
  return page;
});

route("/sqs/q/:url", async ({ url }) => {
  const name = url.split("/").pop();
  const fifo = name.endsWith(".fifo");
  const page = h("div", crumbs(["SQS", "#/sqs"], name), pageHeader(name, url));
  const body = h("textarea", { class: "input mono", rows: 5, spellcheck: "false" }, JSON.stringify({ orderId: 1, status: "new" }, null, 2));
  const group = h("input", { class: "input", placeholder: "Message group ID", value: "default", style: { width: "220px" } });
  const send = h("section", { class: "panel" }, h("div", { class: "panel-head" }, h("h2", "Send message")),
    h("div", { class: "querybox" }, body, fifo ? group : null,
      h("div", button("Send", async () => {
        try {
          const p = { QueueUrl: url, MessageBody: body.value };
          if (fifo) { p.MessageGroupId = group.value || "default"; p.MessageDeduplicationId = uid() + Date.now(); }
          const r = await API.call("sqs", "SendMessage", p); toast(`Sent ${r.MessageId}`);
        } catch (e) { toastErr(e); }
      }, { kind: "primary" }))));
  const got = h("div");
  let received = [];
  const renderMsgs = () => clear(got).appendChild(dataTable({
    columns: [
      { label: "Message ID", class: "mono", render: m => m.MessageId.slice(0, 13) + "…" },
      { label: "Body", class: "mono wrap", key: "Body" },
      { label: "Receives", class: "num", render: m => m.Attributes?.ApproximateReceiveCount },
      { label: "Sent", render: m => fmtDate(Number(m.Attributes?.SentTimestamp)) },
      { label: "", render: m => h("a", { href: "#", onclick: async e => { e.preventDefault(); try { await API.call("sqs", "DeleteMessage", { QueueUrl: url, ReceiptHandle: m.ReceiptHandle }); received = received.filter(x => x !== m); renderMsgs(); toast("Deleted"); } catch (er) { toastErr(er); } } }, "Delete") },
    ],
    rows: received, rowKey: "MessageId", empty: "Click Poll to receive messages.",
  }));
  renderMsgs();
  const recv = h("section", { class: "panel" },
    h("div", { class: "panel-head" }, h("div", h("h2", "Receive messages"), h("p", { class: "muted" }, "Received messages stay hidden for the visibility timeout. Delete them once handled.")),
      button("Poll", async () => {
        try {
          const r = await API.call("sqs", "ReceiveMessage", { QueueUrl: url, MaxNumberOfMessages: 10, WaitTimeSeconds: 1, AttributeNames: ["All"], MessageAttributeNames: ["All"] });
          received = (r.Messages || []).concat(received); renderMsgs();
          if (!r.Messages?.length) toast("No messages available");
        } catch (e) { toastErr(e); }
      }, { kind: "primary", icon: "down" })),
    got);
  page.append(h("div", { class: "split" }, send, recv));
  return page;
});

// ---------------- SNS ----------------
route("/sns", async () => {
  const page = h("div", pageHeader("SNS", "Topics and subscriptions."));
  const topics = () => {
    const panel = resourcePanel({
      title: "Topics",
      rowKey: "TopicArn",
      load: async () => API.all("sns", "ListTopics", {}, "Topics"),
      columns: [{ label: "Name", render: t => arnName(t.TopicArn) }, { label: "ARN", class: "mono wrap", key: "TopicArn" }],
      create: {
        label: "Create topic",
        open: () => formModal({
          title: "Create topic",
          fields: [{ name: "name", label: "Name", required: true }, { name: "fifo", label: "FIFO topic", type: "checkbox" }],
          onSubmit: async v => {
            const p = { Name: v.fifo && !v.name.endsWith(".fifo") ? v.name + ".fifo" : v.name };
            if (v.fifo) p.Attributes = { FifoTopic: "true", ContentBasedDeduplication: "true" };
            await API.call("sns", "CreateTopic", p); panel.refresh();
          },
        }),
      },
      actions: [
        { label: "Publish", multi: false, open: rows => formModal({
          title: `Publish to ${arnName(rows[0].TopicArn)}`, submitLabel: "Publish",
          fields: [{ name: "subject", label: "Subject (optional)" }, { name: "msg", label: "Message", type: "textarea", rows: 6, required: true }],
          onSubmit: async v => {
            const p = { TopicArn: rows[0].TopicArn, Message: v.msg };
            if (v.subject) p.Subject = v.subject;
            if (rows[0].TopicArn.endsWith(".fifo")) p.MessageGroupId = "default";
            const r = await API.call("sns", "Publish", p); toast(`Published ${r.MessageId}`);
          },
        }) },
        { label: "Subscribe queue", multi: false, open: rows => formModal({
          title: `Subscribe an SQS queue to ${arnName(rows[0].TopicArn)}`, submitLabel: "Subscribe",
          fields: [
            { name: "queue", label: "Queue", type: "select", required: true, options: async () => ((await API.call("sqs", "ListQueues")).QueueUrls || []).map(u => ({ value: u, label: u.split("/").pop() })) },
            { name: "raw", label: "Raw message delivery", type: "checkbox" },
          ],
          onSubmit: async v => {
            const arn = (await API.call("sqs", "GetQueueAttributes", { QueueUrl: v.queue, AttributeNames: ["QueueArn"] })).Attributes.QueueArn;
            const p = { TopicArn: rows[0].TopicArn, Protocol: "sqs", Endpoint: arn, ReturnSubscriptionArn: true };
            if (v.raw) p.Attributes = { RawMessageDelivery: "true" };
            await API.call("sns", "Subscribe", p); toast("Subscribed");
          },
        }) },
        { label: "Delete", kind: "danger", icon: "trash", confirm: "Delete topic", run: async rows => { for (const t of rows) await API.call("sns", "DeleteTopic", { TopicArn: t.TopicArn }); } },
      ],
    });
    return panel;
  };
  const subs = () => resourcePanel({
    title: "Subscriptions",
    rowKey: "SubscriptionArn",
    load: async () => API.all("sns", "ListSubscriptions", {}, "Subscriptions"),
    columns: [{ label: "Topic", render: s => arnName(s.TopicArn) }, { label: "Protocol", key: "Protocol" }, { label: "Endpoint", class: "mono wrap", key: "Endpoint" }, { label: "Subscription", class: "mono wrap", render: s => arnName(s.SubscriptionArn) }],
    actions: [{ label: "Unsubscribe", kind: "danger", confirm: "Unsubscribe", run: async rows => { for (const s of rows) await API.call("sns", "Unsubscribe", { SubscriptionArn: s.SubscriptionArn }); } }],
  });
  page.appendChild(tabs([{ label: "Topics", render: topics }, { label: "Subscriptions", render: subs }]));
  return page;
});

// ---------------- Kinesis ----------------
route("/kinesis", async () => {
  const page = h("div", pageHeader("Kinesis Data Streams", "Real-time record streams."));
  const panel = resourcePanel({
    title: "Streams",
    rowKey: "StreamName",
    load: async () => (await API.call("kinesis", "ListStreams")).StreamSummaries || [],
    columns: [
      { label: "Name", render: s => h("a", { href: `#/kinesis/s/${encodeURIComponent(s.StreamName)}` }, s.StreamName) },
      { label: "Status", render: s => badge(s.StreamStatus) }, { label: "Mode", render: s => s.StreamModeDetails?.StreamMode },
      { label: "Created", render: s => fmtDate(s.StreamCreationTimestamp) },
    ],
    poll: s => s.StreamStatus !== "ACTIVE",
    onRowClick: s => go(`/kinesis/s/${encodeURIComponent(s.StreamName)}`),
    create: {
      label: "Create stream",
      open: () => formModal({
        title: "Create stream",
        fields: [
          { name: "name", label: "Name", required: true },
          { name: "mode", label: "Capacity mode", type: "select", required: true, default: "PROVISIONED", options: ["PROVISIONED", "ON_DEMAND"] },
          { name: "shards", label: "Shards", type: "number", default: 1, showIf: v => v.mode === "PROVISIONED" },
        ],
        onSubmit: async v => {
          const p = { StreamName: v.name, StreamModeDetails: { StreamMode: v.mode } };
          if (v.mode === "PROVISIONED") p.ShardCount = v.shards || 1;
          await API.call("kinesis", "CreateStream", p); panel.refresh();
        },
      }),
    },
    actions: [{ label: "Delete", kind: "danger", icon: "trash", confirm: "Delete stream", run: async rows => { for (const s of rows) await API.call("kinesis", "DeleteStream", { StreamName: s.StreamName, EnforceConsumerDeletion: true }); } }],
  });
  page.appendChild(panel);
  return page;
});

route("/kinesis/s/:name", async ({ name }) => {
  const page = h("div", crumbs(["Kinesis", "#/kinesis"], name), pageHeader(name, "Put and read records."));
  const data = h("textarea", { class: "input mono", rows: 5, spellcheck: "false" }, JSON.stringify({ event: "click", ts: Date.now() }));
  const pk = h("input", { class: "input", value: "key-1", style: { width: "200px" }, "aria-label": "Partition key" });
  const put = h("section", { class: "panel" }, h("div", { class: "panel-head" }, h("h2", "Put record")),
    h("div", { class: "querybox" }, data, h("div", { class: "row" }, h("span", { class: "muted" }, "Partition key"), pk,
      button("Put", async () => {
        try { const r = await API.call("kinesis", "PutRecord", { StreamName: name, Data: data.value, PartitionKey: pk.value || "key" }); toast(`Stored in ${r.ShardId}, seq ${String(r.SequenceNumber).slice(-8)}`); }
        catch (e) { toastErr(e); }
      }, { kind: "primary" }))));
  const out = h("div", emptyState("Read records from the start of every shard."));
  const read = h("section", { class: "panel" },
    h("div", { class: "panel-head" }, h("h2", "Records"), button("Read from start", async () => {
      clear(out).appendChild(h("div", { class: "loading" }, "Reading…"));
      try {
        const shards = (await API.call("kinesis", "ListShards", { StreamName: name })).Shards;
        const rows = [];
        for (const s of shards) {
          const it = (await API.call("kinesis", "GetShardIterator", { StreamName: name, ShardId: s.ShardId, ShardIteratorType: "TRIM_HORIZON" })).ShardIterator;
          const r = await API.call("kinesis", "GetRecords", { ShardIterator: it, Limit: 100 });
          r.Records.forEach(x => rows.push({ ...x, shard: s.ShardId }));
        }
        clear(out).appendChild(dataTable({
          columns: [{ label: "Shard", key: "shard" }, { label: "Partition key", key: "PartitionKey" }, { label: "Data", class: "mono wrap", render: x => typeof x.Data === "string" ? x.Data : JSON.stringify(x.Data) }, { label: "Arrived", render: x => fmtDate(x.ApproximateArrivalTimestamp) }],
          rows, rowKey: "SequenceNumber", empty: "No records yet.",
        }));
      } catch (e) { clear(out).appendChild(errorBox(e)); }
    }, { icon: "down" })), out);
  page.append(h("div", { class: "split" }, put, read));
  return page;
});

// ---------------- Athena ----------------
route("/athena", async () => {
  const page = h("div", pageHeader("Athena", "Run SQL against tables in the Glue Data Catalog."));
  const sql = h("textarea", { class: "input mono", rows: 7, spellcheck: "false" }, "SELECT 1 AS answer");
  const wg = h("select", { class: "input", style: { width: "auto" } });
  const dbSel = h("select", { class: "input", style: { width: "auto" } }, h("option", { value: "default" }, "default"));
  const outBucket = h("select", { class: "input", style: { width: "auto" } });
  API.call("athena", "ListWorkGroups").then(r => r.WorkGroups.forEach(w => wg.appendChild(h("option", { value: w.Name }, "Workgroup: " + w.Name)))).catch(() => {});
  API.all("glue", "GetDatabases", {}, "DatabaseList").then(l => l.forEach(d => d.Name !== "default" && dbSel.appendChild(h("option", { value: d.Name }, d.Name)))).catch(() => {});
  Pick.buckets().then(b => { if (!b.length) outBucket.appendChild(h("option", { value: "" }, "No buckets: create one for results")); b.forEach(x => outBucket.appendChild(h("option", { value: x }, "Results: s3://" + x + "/athena/"))); });
  const out = h("div");
  const run = async () => {
    clear(out).appendChild(h("div", { class: "loading" }, "Running…"));
    try {
      const p = { QueryString: sql.value, WorkGroup: wg.value || "primary", QueryExecutionContext: { Database: dbSel.value || "default" } };
      if (outBucket.value) p.ResultConfiguration = { OutputLocation: `s3://${outBucket.value}/athena/` };
      const { QueryExecutionId } = await API.call("athena", "StartQueryExecution", p);
      let st;
      for (let i = 0; i < 120; i++) {
        st = (await API.call("athena", "GetQueryExecution", { QueryExecutionId })).QueryExecution.Status;
        if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(st.State)) break;
        await sleep(500);
      }
      if (st.State !== "SUCCEEDED") throw { code: st.State, message: st.StateChangeReason || "Query did not succeed" };
      const r = await API.call("athena", "GetQueryResults", { QueryExecutionId });
      const rows = r.ResultSet.Rows.map(x => x.Data.map(d => d.VarCharValue));
      const cols = (r.ResultSet.ResultSetMetadata?.ColumnInfo || []).map(c => c.Name);
      const body = cols.length && rows.length && rows[0].join() === cols.join() ? rows.slice(1) : rows;
      clear(out).append(h("div", { class: "row", style: { padding: "10px 16px" } }, badge("SUCCEEDED"), h("span", { class: "muted mono" }, QueryExecutionId)),
        dataTable({ columns: cols.map((c, i) => ({ label: c, class: "mono", render: r2 => r2[i] })), rows: body, rowKey: r2 => r2.join("|"), empty: "Query returned no rows." }));
    } catch (e) { clear(out).appendChild(errorBox(e)); }
  };
  sql.addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") run(); });
  page.appendChild(h("section", { class: "panel" },
    h("div", { class: "panel-head" }, h("div", h("h2", "Query editor"), h("p", { class: "muted" }, "Ctrl+Enter runs the query."))),
    h("div", { class: "querybox" }, h("div", { class: "row" }, wg, dbSel, outBucket), sql, h("div", button("Run", run, { kind: "primary", icon: "play" }))), out));
  page.appendChild(resourcePanel({
    title: "Recent queries",
    rowKey: "QueryExecutionId",
    load: async () => {
      const ids = ((await API.call("athena", "ListQueryExecutions", { MaxResults: 20 })).QueryExecutionIds || []);
      if (!ids.length) return [];
      return (await API.call("athena", "BatchGetQueryExecution", { QueryExecutionIds: ids })).QueryExecutions;
    },
    columns: [{ label: "Query", class: "mono wrap", key: "Query" }, { label: "State", render: x => badge(x.Status?.State) }, { label: "Submitted", render: x => fmtDate(x.Status?.SubmissionDateTime) }],
    onRowClick: x => { sql.value = x.Query; sql.focus(); },
  }));
  return page;
});

// ---------------- Secrets Manager ----------------
route("/secrets", async () => {
  const page = h("div", pageHeader("Secrets Manager", "Store and read secrets."));
  const panel = resourcePanel({
    title: "Secrets",
    rowKey: "Name",
    load: async () => API.all("secretsmanager", "ListSecrets", {}, "SecretList"),
    columns: [{ label: "Name", key: "Name" }, { label: "Description", key: "Description" }, { label: "Last changed", render: s => fmtDate(s.LastChangedDate) }],
    onRowClick: async s => {
      try { const v = await API.call("secretsmanager", "GetSecretValue", { SecretId: s.ARN }); modal({ title: s.Name, body: codeBlock(v.SecretString ?? "(binary)", { wrap: true }) }); }
      catch (e) { toastErr(e); }
    },
    create: {
      label: "Store a secret",
      open: () => formModal({
        title: "Store a secret",
        fields: [
          { name: "name", label: "Name", required: true, placeholder: "prod/db/credentials" },
          { name: "value", label: "Value", type: "textarea", rows: 5, required: true, default: '{"username":"app","password":"test-only"}', help: "Use test values. This is a local emulator." },
          { name: "desc", label: "Description" },
        ],
        onSubmit: async v => { await API.call("secretsmanager", "CreateSecret", { Name: v.name, SecretString: v.value, Description: v.desc || undefined }); panel.refresh(); },
      }),
    },
    actions: [
      { label: "Update value", multi: false, open: (rows, refresh) => formModal({
        title: `New value for ${rows[0].Name}`, submitLabel: "Save",
        fields: [{ name: "value", label: "Value", type: "textarea", rows: 5, required: true }],
        onSubmit: async v => { await API.call("secretsmanager", "PutSecretValue", { SecretId: rows[0].ARN, SecretString: v.value }); toast("Saved"); refresh(); },
      }) },
      { label: "Delete", kind: "danger", icon: "trash", confirm: "Delete immediately (no recovery window)",
        run: async rows => { for (const s of rows) await API.call("secretsmanager", "DeleteSecret", { SecretId: s.ARN, ForceDeleteWithoutRecovery: true }); } },
    ],
  });
  page.appendChild(panel);
  return page;
});

// ---------------- Parameter Store ----------------
route("/ssm", async () => {
  const page = h("div", pageHeader("Parameter Store", "Configuration values in Systems Manager."));
  const panel = resourcePanel({
    title: "Parameters",
    rowKey: "Name",
    load: async () => API.all("ssm", "DescribeParameters", {}, "Parameters"),
    columns: [{ label: "Name", class: "mono", key: "Name" }, { label: "Type", key: "Type" }, { label: "Version", class: "num", key: "Version" }, { label: "Modified", render: p => fmtDate(p.LastModifiedDate) }],
    onRowClick: async p => {
      try { const r = await API.call("ssm", "GetParameter", { Name: p.Name, WithDecryption: true }); modal({ title: p.Name, body: codeBlock(r.Parameter.Value, { wrap: true }) }); }
      catch (e) { toastErr(e); }
    },
    create: {
      label: "Create parameter",
      open: () => formModal({
        title: "Create parameter",
        fields: [
          { name: "name", label: "Name", required: true, placeholder: "/app/dev/feature-flag" },
          { name: "type", label: "Type", type: "select", required: true, default: "String", options: ["String", "StringList", "SecureString"] },
          { name: "value", label: "Value", type: "textarea", rows: 3, required: true },
          { name: "overwrite", label: "Overwrite if it exists", type: "checkbox" },
        ],
        onSubmit: async v => { await API.call("ssm", "PutParameter", { Name: v.name, Type: v.type, Value: v.value, Overwrite: v.overwrite }); panel.refresh(); },
      }),
    },
    actions: [{ label: "Delete", kind: "danger", icon: "trash", confirm: "Delete parameter",
      run: async rows => { await API.call("ssm", "DeleteParameters", { Names: rows.map(p => p.Name) }); } }],
  });
  page.appendChild(panel);
  return page;
});

// ---------------- IAM ----------------
route("/iam", async () => {
  const page = h("div", pageHeader("IAM", "Users, roles and policies."));
  page.appendChild(h("div", { class: "note" }, "The emulator stores IAM resources but doesn't enforce their permissions. Don't use it to test security."));
  const users = () => {
    const panel = resourcePanel({
      title: "Users", rowKey: "UserName",
      load: async () => API.all("iam", "ListUsers", {}, "Users", "Marker"),
      columns: [{ label: "Name", key: "UserName" }, { label: "ARN", class: "mono wrap", key: "Arn" }, { label: "Created", render: u => fmtDate(u.CreateDate) }],
      onRowClick: u => showJson(u.UserName, u),
      create: { label: "Create user", open: () => formModal({ title: "Create user", fields: [{ name: "name", label: "User name", required: true }],
        onSubmit: async v => { await API.call("iam", "CreateUser", { UserName: v.name }); panel.refresh(); } }) },
      actions: [{ label: "Delete", kind: "danger", icon: "trash", confirm: "Delete user", run: async rows => { for (const u of rows) await API.call("iam", "DeleteUser", { UserName: u.UserName }); } }],
    });
    return panel;
  };
  const roles = () => {
    const panel = resourcePanel({
      title: "Roles", rowKey: "RoleName",
      load: async () => API.all("iam", "ListRoles", {}, "Roles", "Marker"),
      columns: [
        { label: "Name", key: "RoleName" },
        { label: "Trusted by", render: r => { try { const d = typeof r.AssumeRolePolicyDocument === "string" ? JSON.parse(decodeURIComponent(r.AssumeRolePolicyDocument)) : r.AssumeRolePolicyDocument; return (d.Statement || []).flatMap(s => [].concat(s.Principal?.Service || s.Principal?.AWS || [])).join(", "); } catch { return "—"; } } },
        { label: "Created", render: r => fmtDate(r.CreateDate) },
      ],
      onRowClick: r => showJson(r.RoleName, r),
      create: { label: "Create role", open: () => formModal({
        title: "Create role",
        fields: [
          { name: "name", label: "Role name", required: true },
          { name: "svc", label: "Trusted service", type: "select", required: true, default: "lambda.amazonaws.com",
            options: ["lambda.amazonaws.com", "ec2.amazonaws.com", "ecs-tasks.amazonaws.com", "glue.amazonaws.com", "states.amazonaws.com", "eks.amazonaws.com", "events.amazonaws.com", "firehose.amazonaws.com"] },
          { name: "policy", label: "Attach managed policy ARN (optional)", placeholder: "arn:aws:iam::aws:policy/ReadOnlyAccess" },
        ],
        onSubmit: async v => {
          const doc = { Version: "2012-10-17", Statement: [{ Effect: "Allow", Principal: { Service: v.svc }, Action: "sts:AssumeRole" }] };
          await API.call("iam", "CreateRole", { RoleName: v.name, AssumeRolePolicyDocument: JSON.stringify(doc) });
          if (v.policy) await API.call("iam", "AttachRolePolicy", { RoleName: v.name, PolicyArn: v.policy });
          panel.refresh();
        } }) },
      actions: [{ label: "Delete", kind: "danger", icon: "trash", confirm: "Delete role",
        run: async rows => {
          for (const r of rows) {
            const att = (await API.call("iam", "ListAttachedRolePolicies", { RoleName: r.RoleName })).AttachedPolicies || [];
            for (const p of att) await API.call("iam", "DetachRolePolicy", { RoleName: r.RoleName, PolicyArn: p.PolicyArn });
            const inl = (await API.call("iam", "ListRolePolicies", { RoleName: r.RoleName })).PolicyNames || [];
            for (const n of inl) await API.call("iam", "DeleteRolePolicy", { RoleName: r.RoleName, PolicyName: n });
            await API.call("iam", "DeleteRole", { RoleName: r.RoleName });
          }
        } }],
    });
    return panel;
  };
  const policies = () => resourcePanel({
    title: "Customer managed policies", rowKey: "Arn",
    load: async () => API.all("iam", "ListPolicies", { Scope: "Local" }, "Policies", "Marker"),
    columns: [{ label: "Name", key: "PolicyName" }, { label: "ARN", class: "mono wrap", key: "Arn" }, { label: "Attachments", class: "num", key: "AttachmentCount" }],
    onRowClick: async p => {
      try { const v = await API.call("iam", "GetPolicyVersion", { PolicyArn: p.Arn, VersionId: p.DefaultVersionId }); const d = v.PolicyVersion.Document; showJson(p.PolicyName, typeof d === "string" ? JSON.parse(decodeURIComponent(d)) : d); }
      catch (e) { toastErr(e); }
    },
    create: { label: "Create policy", open: () => formModal({
      title: "Create policy", wide: true,
      fields: [{ name: "name", label: "Name", required: true },
        { name: "doc", label: "Policy document", type: "json", rows: 12, required: true, default: { Version: "2012-10-17", Statement: [{ Effect: "Allow", Action: ["s3:GetObject"], Resource: "*" }] } }],
      onSubmit: async v => { await API.call("iam", "CreatePolicy", { PolicyName: v.name, PolicyDocument: JSON.stringify(v.doc) }); renderRoute(); } }) },
    actions: [{ label: "Delete", kind: "danger", icon: "trash", confirm: "Delete policy", run: async rows => { for (const p of rows) await API.call("iam", "DeletePolicy", { PolicyArn: p.Arn }); } }],
  });
  page.appendChild(tabs([{ label: "Users", render: users }, { label: "Roles", render: roles }, { label: "Policies", render: policies }]));
  return page;
});

// ---------------- CloudWatch Logs ----------------
route("/logs", async () => {
  const page = h("div", pageHeader("CloudWatch Logs", "Log groups, streams and events."));
  const panel = resourcePanel({
    title: "Log groups", rowKey: "logGroupName",
    load: async () => API.all("logs", "DescribeLogGroups", {}, "logGroups", "nextToken"),
    columns: [
      { label: "Name", render: g => h("a", { href: `#/logs/g/${encodeURIComponent(g.logGroupName)}` }, g.logGroupName) },
      { label: "Retention", render: g => (g.retentionInDays ? g.retentionInDays + " days" : "Never expire") },
      { label: "Stored", class: "num", render: g => fmtBytes(g.storedBytes) }, { label: "Created", render: g => fmtDate(g.creationTime) },
    ],
    onRowClick: g => go(`/logs/g/${encodeURIComponent(g.logGroupName)}`),
    create: { label: "Create log group", open: () => formModal({ title: "Create log group", fields: [{ name: "name", label: "Name", required: true, placeholder: "/app/dev" }],
      onSubmit: async v => { await API.call("logs", "CreateLogGroup", { logGroupName: v.name }); panel.refresh(); } }) },
    actions: [{ label: "Delete", kind: "danger", icon: "trash", confirm: "Delete log group", run: async rows => { for (const g of rows) await API.call("logs", "DeleteLogGroup", { logGroupName: g.logGroupName }); } }],
  });
  page.appendChild(panel);
  return page;
});

route("/logs/g/:group", async ({ group }) => {
  const page = h("div", crumbs(["CloudWatch Logs", "#/logs"], group), pageHeader(group, "Latest events across all streams."));
  const filter = h("input", { class: "input", placeholder: "Filter pattern (optional)", style: { width: "280px" } });
  const out = h("div");
  const load = async () => {
    clear(out).appendChild(h("div", { class: "loading" }, "Loading…"));
    try {
      const p = { logGroupName: group, limit: 200 };
      if (filter.value) p.filterPattern = filter.value;
      const r = await API.call("logs", "FilterLogEvents", p);
      clear(out).appendChild(dataTable({
        columns: [{ label: "Time", render: e => fmtDate(e.timestamp) }, { label: "Stream", class: "mono", key: "logStreamName" }, { label: "Message", class: "mono wrap", key: "message" }],
        rows: (r.events || []).reverse(), rowKey: "eventId", empty: "No log events.",
      }));
    } catch (e) { clear(out).appendChild(errorBox(e)); }
  };
  filter.addEventListener("keydown", e => { if (e.key === "Enter") load(); });
  page.appendChild(h("section", { class: "panel" }, h("div", { class: "panel-head" }, h("h2", "Events"), h("div", { class: "toolbar" }, filter, button("", load, { icon: "refresh", kind: "ghost", title: "Refresh" }))), out));
  load();
  return page;
});

// ---------------- Step Functions ----------------
const DEFAULT_ASL = { Comment: "A two-step example", StartAt: "Prepare", States: { Prepare: { Type: "Pass", Result: { greeting: "hello" }, ResultPath: "$.prep", Next: "Done" }, Done: { Type: "Succeed" } } };
route("/stepfunctions", async () => {
  const page = h("div", pageHeader("Step Functions", "State machines and executions."));
  const panel = resourcePanel({
    title: "State machines", rowKey: "stateMachineArn",
    load: async () => API.all("stepfunctions", "ListStateMachines", {}, "stateMachines", "nextToken"),
    columns: [
      { label: "Name", render: s => h("a", { href: `#/stepfunctions/m/${encodeURIComponent(s.stateMachineArn)}` }, s.name) },
      { label: "Type", key: "type" }, { label: "Created", render: s => fmtDate(s.creationDate) },
    ],
    onRowClick: s => go(`/stepfunctions/m/${encodeURIComponent(s.stateMachineArn)}`),
    create: { label: "Create state machine", open: () => formModal({
      title: "Create state machine", wide: true,
      fields: [
        { name: "name", label: "Name", required: true },
        { name: "type", label: "Type", type: "select", required: true, default: "STANDARD", options: ["STANDARD", "EXPRESS"] },
        { name: "def", label: "Definition (Amazon States Language)", type: "json", rows: 16, required: true, default: DEFAULT_ASL },
      ],
      onSubmit: async v => {
        const role = await ensureServiceRole("EmuConsoleStatesRole", "states.amazonaws.com");
        await API.call("stepfunctions", "CreateStateMachine", { name: v.name, type: v.type, definition: JSON.stringify(v.def), roleArn: role });
        panel.refresh();
      } }) },
    actions: [{ label: "Delete", kind: "danger", icon: "trash", confirm: "Delete state machine", run: async rows => { for (const s of rows) await API.call("stepfunctions", "DeleteStateMachine", { stateMachineArn: s.stateMachineArn }); } }],
  });
  page.appendChild(panel);
  return page;
});

route("/stepfunctions/m/:arn", async ({ arn }) => {
  const sm = await API.call("stepfunctions", "DescribeStateMachine", { stateMachineArn: arn });
  const page = h("div", crumbs(["Step Functions", "#/stepfunctions"], sm.name), pageHeader(sm.name, sm.type, badge(sm.status)));
  const execs = resourcePanel({
    title: "Executions", rowKey: "executionArn",
    load: async () => API.all("stepfunctions", "ListExecutions", { stateMachineArn: arn }, "executions", "nextToken"),
    columns: [{ label: "Name", class: "mono", key: "name" }, { label: "Status", render: e => badge(e.status) }, { label: "Started", render: e => fmtDate(e.startDate) }, { label: "Stopped", render: e => fmtDate(e.stopDate) }],
    poll: e => e.status === "RUNNING",
    onRowClick: async e => { try { showJson(e.name, await API.call("stepfunctions", "DescribeExecution", { executionArn: e.executionArn })); } catch (er) { toastErr(er); } },
    create: { label: "Start execution", open: () => formModal({
      title: "Start execution", submitLabel: "Start",
      fields: [{ name: "input", label: "Input", type: "json", rows: 8, default: { orderId: 42 } }],
      onSubmit: async v => { await API.call("stepfunctions", "StartExecution", { stateMachineArn: arn, input: JSON.stringify(v.input || {}) }); execs.refresh(); } }) },
    actions: [{ label: "Stop", icon: "stop", run: async rows => { for (const e of rows) await API.call("stepfunctions", "StopExecution", { executionArn: e.executionArn }); } }],
  });
  let def = sm.definition; try { def = JSON.parse(sm.definition); } catch { /* keep */ }
  page.append(execs, h("section", { class: "panel" }, h("div", { class: "panel-head" }, h("h2", "Definition")), h("div", { class: "panel-pad" }, jsonView(def))));
  return page;
});

// ---------------- EventBridge ----------------
route("/events", async () => {
  const page = h("div", pageHeader("EventBridge", "Event buses and rules."));
  const rules = () => {
    const panel = resourcePanel({
      title: "Rules (default bus)", rowKey: "Name",
      load: async () => API.all("events", "ListRules", {}, "Rules", "NextToken"),
      columns: [{ label: "Name", key: "Name" }, { label: "State", render: r => badge(r.State) }, { label: "Schedule", key: "ScheduleExpression" }, { label: "Pattern", class: "mono wrap", key: "EventPattern" }],
      onRowClick: async r => { try { showJson(r.Name, { rule: r, targets: (await API.call("events", "ListTargetsByRule", { Rule: r.Name })).Targets }); } catch (e) { toastErr(e); } },
      create: { label: "Create rule", open: () => formModal({
        title: "Create rule", wide: true,
        fields: [
          { name: "name", label: "Name", required: true },
          { name: "kind", label: "Trigger", type: "select", required: true, default: "pattern", options: [{ value: "pattern", label: "Event pattern" }, { value: "schedule", label: "Schedule" }] },
          { name: "pattern", label: "Event pattern", type: "json", rows: 8, showIf: v => v.kind === "pattern", default: { source: ["my.app"], "detail-type": ["OrderPlaced"] } },
          { name: "schedule", label: "Schedule expression", default: "rate(5 minutes)", showIf: v => v.kind === "schedule" },
          { name: "target", label: "Target queue (optional)", type: "select", placeholder: "None", options: async () => ((await API.call("sqs", "ListQueues")).QueueUrls || []).map(u => ({ value: u, label: "SQS: " + u.split("/").pop() })) },
        ],
        onSubmit: async v => {
          const p = { Name: v.name, State: "ENABLED" };
          if (v.kind === "pattern") p.EventPattern = JSON.stringify(v.pattern); else p.ScheduleExpression = v.schedule;
          await API.call("events", "PutRule", p);
          if (v.target) {
            const arn = (await API.call("sqs", "GetQueueAttributes", { QueueUrl: v.target, AttributeNames: ["QueueArn"] })).Attributes.QueueArn;
            await API.call("events", "PutTargets", { Rule: v.name, Targets: [{ Id: "t1", Arn: arn }] });
          }
          panel.refresh();
        } }) },
      actions: [
        { label: "Send test event", multi: false, open: rows => formModal({
          title: "Put event on the default bus", submitLabel: "Send",
          fields: [{ name: "source", label: "Source", required: true, default: "my.app" }, { name: "type", label: "Detail type", required: true, default: "OrderPlaced" }, { name: "detail", label: "Detail", type: "json", rows: 6, default: { orderId: 1 } }],
          onSubmit: async v => { const r = await API.call("events", "PutEvents", { Entries: [{ Source: v.source, DetailType: v.type, Detail: JSON.stringify(v.detail || {}) }] }); toast(r.FailedEntryCount ? "Event failed" : "Event sent", r.FailedEntryCount ? "error" : "ok"); },
        }) },
        { label: "Delete", kind: "danger", icon: "trash", confirm: "Delete rule",
          run: async rows => {
            for (const r of rows) {
              const t = (await API.call("events", "ListTargetsByRule", { Rule: r.Name })).Targets || [];
              if (t.length) await API.call("events", "RemoveTargets", { Rule: r.Name, Ids: t.map(x => x.Id) });
              await API.call("events", "DeleteRule", { Name: r.Name });
            }
          } },
      ],
    });
    return panel;
  };
  const buses = () => resourcePanel({
    title: "Event buses", rowKey: "Name",
    load: async () => (await API.call("events", "ListEventBuses")).EventBuses,
    columns: [{ label: "Name", key: "Name" }, { label: "ARN", class: "mono wrap", key: "Arn" }],
    create: { label: "Create bus", open: () => formModal({ title: "Create event bus", fields: [{ name: "name", label: "Name", required: true }],
      onSubmit: async v => { await API.call("events", "CreateEventBus", { Name: v.name }); renderRoute(); } }) },
    actions: [{ label: "Delete", kind: "danger", icon: "trash", confirm: "Delete bus", run: async rows => { for (const b of rows) if (b.Name !== "default") await API.call("events", "DeleteEventBus", { Name: b.Name }); } }],
  });
  page.appendChild(tabs([{ label: "Rules", render: rules }, { label: "Buses", render: buses }]));
  return page;
});

// ---------------- CloudFormation ----------------
const SAMPLE_CFN = `AWSTemplateFormatVersion: "2010-09-09"
Description: Example stack
Resources:
  DataBucket:
    Type: AWS::S3::Bucket
  JobsQueue:
    Type: AWS::SQS::Queue
Outputs:
  BucketName:
    Value: !Ref DataBucket
`;
route("/cloudformation", async () => {
  const page = h("div", pageHeader("CloudFormation", "Stacks from templates."));
  const panel = resourcePanel({
    title: "Stacks", rowKey: "StackName",
    load: async () => (await API.all("cloudformation", "ListStacks", {}, "StackSummaries")).filter(s => s.StackStatus !== "DELETE_COMPLETE"),
    columns: [{ label: "Name", key: "StackName" }, { label: "Status", render: s => badge(s.StackStatus) }, { label: "Reason", key: "StackStatusReason" }, { label: "Created", render: s => fmtDate(s.CreationTime) }],
    poll: s => /IN_PROGRESS$/.test(s.StackStatus),
    onRowClick: async s => {
      try {
        const [d, res, ev] = await Promise.all([
          API.call("cloudformation", "DescribeStacks", { StackName: s.StackName }),
          API.call("cloudformation", "ListStackResources", { StackName: s.StackName }),
          API.call("cloudformation", "DescribeStackEvents", { StackName: s.StackName }),
        ]);
        modal({ title: s.StackName, wide: true, body: h("div",
          h("h3", "Resources"), dataTable({ columns: [{ label: "Logical ID", key: "LogicalResourceId" }, { label: "Type", key: "ResourceType" }, { label: "Physical ID", class: "mono wrap", key: "PhysicalResourceId" }, { label: "Status", render: r => badge(r.ResourceStatus) }], rows: res.StackResourceSummaries, rowKey: "LogicalResourceId" }),
          h("h3", { style: { marginTop: "16px" } }, "Outputs"), dataTable({ columns: [{ label: "Key", key: "OutputKey" }, { label: "Value", class: "mono wrap", key: "OutputValue" }], rows: d.Stacks[0].Outputs || [], rowKey: "OutputKey", empty: "No outputs." }),
          h("h3", { style: { marginTop: "16px" } }, "Events"), dataTable({ columns: [{ label: "Time", render: e => fmtDate(e.Timestamp) }, { label: "Resource", key: "LogicalResourceId" }, { label: "Status", render: e => badge(e.ResourceStatus) }, { label: "Reason", class: "wrap", key: "ResourceStatusReason" }], rows: ev.StackEvents.slice(0, 50), rowKey: "EventId" })) });
      } catch (e) { toastErr(e); }
    },
    create: { label: "Create stack", open: () => formModal({
      title: "Create stack", wide: true,
      fields: [{ name: "name", label: "Stack name", required: true }, { name: "tpl", label: "Template (YAML or JSON)", type: "code", rows: 16, required: true, default: SAMPLE_CFN }],
      onSubmit: async v => { await API.call("cloudformation", "CreateStack", { StackName: v.name, TemplateBody: v.tpl, Capabilities: ["CAPABILITY_IAM", "CAPABILITY_NAMED_IAM", "CAPABILITY_AUTO_EXPAND"] }); panel.refresh(); } }) },
    actions: [{ label: "Delete", kind: "danger", icon: "trash", confirm: "Delete stack and its resources", run: async rows => { for (const s of rows) await API.call("cloudformation", "DeleteStack", { StackName: s.StackName }); } }],
  });
  page.appendChild(panel);
  return page;
});
