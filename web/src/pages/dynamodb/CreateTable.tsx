import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Form from "@cloudscape-design/components/form";
import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Button from "@cloudscape-design/components/button";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Tiles from "@cloudscape-design/components/tiles";
import Table from "@cloudscape-design/components/table";
import Box from "@cloudscape-design/components/box";
import Checkbox from "@cloudscape-design/components/checkbox";
import Textarea from "@cloudscape-design/components/textarea";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import ButtonDropdown from "@cloudscape-design/components/button-dropdown";
import { useCrumbs } from "../../App";
import { api } from "../../api";
import { ErrorAlert, useFlash } from "../../common";
import { Tags } from "../s3/fields";
import { toTagSet, type KV } from "../s3/lib";
import { ddb, tableHref, typeLabel } from "./lib";
import { KeyInput, CapacityFields, CAP_DEFAULT, capacityParams, EncryptionFields, sseSpec, IndexModal, indexToApi, indexAttrDefs, type Key, type Capacity, type Enc, type IndexDef } from "./fields";

export async function applyAutoScaling(table: string, c: Capacity, index?: string) {
  if (c.mode !== "PROVISIONED") return;
  const resource = index ? `table/${table}/index/${index}` : `table/${table}`;
  const dimPrefix = index ? "dynamodb:index" : "dynamodb:table";
  for (const [side, s] of [["Read", c.read], ["Write", c.write]] as const) {
    if (!s.auto) continue;
    const dim = `${dimPrefix}:${side}CapacityUnits`;
    await api.call("application-autoscaling", "RegisterScalableTarget", { ServiceNamespace: "dynamodb", ResourceId: resource, ScalableDimension: dim, MinCapacity: Number(s.min), MaxCapacity: Number(s.max) });
    await api.call("application-autoscaling", "PutScalingPolicy", {
      PolicyName: `${table}-${side}-scaling-policy`, ServiceNamespace: "dynamodb", ResourceId: resource, ScalableDimension: dim, PolicyType: "TargetTrackingScaling",
      TargetTrackingScalingPolicyConfiguration: { TargetValue: Number(s.target), PredefinedMetricSpecification: { PredefinedMetricType: `DynamoDB${side}CapacityUtilization` } },
    });
  }
}

export default function CreateTable() {
  const nav = useNavigate();
  const flash = useFlash();
  useCrumbs([{ text: "DynamoDB", href: "#/dynamodb/dashboard" }, { text: "Tables", href: "#/dynamodb/tables" }, { text: "Create table", href: "#" }]);
  const [name, setName] = useState("");
  const [pk, setPk] = useState<Key>({ name: "", type: "S" });
  const [sk, setSk] = useState<Key>({ name: "", type: "S" });
  const [mode, setMode] = useState<"default" | "custom">("default");
  const [klass, setKlass] = useState("STANDARD");
  const [cap, setCap] = useState<Capacity>(CAP_DEFAULT);
  const [warm, setWarm] = useState({ on: false, read: "12000", write: "4000" });
  const [indexes, setIndexes] = useState<IndexDef[]>([]);
  const [idxModal, setIdxModal] = useState<"" | "GSI" | "LSI">("");
  const [enc, setEnc] = useState<Enc>({ kind: "owned", key: "" });
  const [protect, setProtect] = useState(false);
  const [policy, setPolicy] = useState("");
  const [tags, setTags] = useState<KV[]>([]);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);

  const nameErr = tried && (!/^[a-zA-Z0-9_.-]{3,255}$/.test(name) ? "Table name must be 3 to 255 characters: letters, numbers, underscores (_), hyphens (-) and periods (.)." : undefined);
  const pkErr = tried && !pk.name ? "Partition key is required." : undefined;
  const policyErr = policy.trim() ? (() => { try { JSON.parse(policy); return undefined; } catch (e: any) { return "Invalid JSON: " + e.message; } })() : undefined;

  const submit = async () => {
    setTried(true);
    if (nameErr || !/^[a-zA-Z0-9_.-]{3,255}$/.test(name) || !pk.name || policyErr) return;
    setBusy(true); setErr(null);
    try {
      const keys = [pk, ...(sk.name ? [sk] : [])];
      const attrs = new Map<string, string>();
      keys.forEach(k => attrs.set(k.name, k.type));
      indexes.forEach(i => indexAttrDefs(i).forEach(a => attrs.set(a.AttributeName, a.AttributeType)));
      const custom = mode === "custom";
      const capP = custom ? capacityParams(cap) : { BillingMode: "PAY_PER_REQUEST" };
      const p: any = {
        TableName: name,
        AttributeDefinitions: [...attrs].map(([AttributeName, AttributeType]) => ({ AttributeName, AttributeType })),
        KeySchema: [{ AttributeName: pk.name, KeyType: "HASH" }, ...(sk.name ? [{ AttributeName: sk.name, KeyType: "RANGE" }] : [])],
        ...capP,
      };
      const gsis = indexes.filter(i => i.kind === "GSI").map(i => indexToApi(i, capP));
      const lsis = indexes.filter(i => i.kind === "LSI").map(i => indexToApi(i));
      if (gsis.length) p.GlobalSecondaryIndexes = gsis;
      if (lsis.length) p.LocalSecondaryIndexes = lsis;
      if (custom) {
        p.TableClass = klass;
        p.SSESpecification = sseSpec(enc);
        p.DeletionProtectionEnabled = protect;
        if (warm.on) p.WarmThroughput = { ReadUnitsPerSecond: Number(warm.read), WriteUnitsPerSecond: Number(warm.write) };
        if (policy.trim()) p.ResourcePolicy = policy;
      }
      const ts = toTagSet(tags);
      if (ts.length) p.Tags = ts;
      await ddb("CreateTable", p);
      if (custom && cap.mode === "PROVISIONED") {
        for (let i = 0; i < 20; i++) { const t = (await ddb("DescribeTable", { TableName: name })).Table; if (t.TableStatus === "ACTIVE") break; await new Promise(r => setTimeout(r, 500)); }
        await applyAutoScaling(name, cap).catch(e => flash.error(e, "Table created, but auto scaling couldn't be set up"));
      }
      flash.notify({ type: "success", content: <>The {name} table was created successfully. <a href={tableHref(name)}>View table</a></> });
      nav("/dynamodb/tables");
    } catch (e) { setErr(e); window.scrollTo(0, 0); } finally { setBusy(false); }
  };

  const defaults = [
    ["Table class", "DynamoDB Standard", "Yes"], ["Capacity mode", "On-demand", "Yes"], ["Maximum read capacity units", "-", "Yes"],
    ["Maximum write capacity units", "-", "Yes"], ["Local secondary indexes", indexes.filter(i => i.kind === "LSI").length ? "Yes" : "-", "No"],
    ["Global secondary indexes", indexes.filter(i => i.kind === "GSI").length ? "Yes" : "-", "Yes"], ["Encryption key management", "Owned by Amazon DynamoDB", "Yes"],
    ["Deletion protection", "Off", "Yes"], ["Resource-based policy", "Not active", "Yes"],
  ];

  return (
    <ContentLayout header={<Header variant="h1" description="DynamoDB is a schemaless database that requires only a table name and a primary key when you create the table.">Create table</Header>}>
      <form onSubmit={e => { e.preventDefault(); submit(); }}>
        <Form errorText={err ? <ErrorAlert error={err} /> : undefined}
          actions={<SpaceBetween direction="horizontal" size="xs"><Button formAction="none" variant="link" onClick={() => nav(-1)}>Cancel</Button><Button variant="primary" loading={busy}>Create table</Button></SpaceBetween>}>
          <SpaceBetween size="l">
            <Container header={<Header variant="h2" description="DynamoDB is a schemaless database that requires only a table name and a primary key when you create the table.">Table details</Header>}>
              <SpaceBetween size="l">
                <FormField label="Table name" description="This will be used to identify your table." errorText={nameErr || undefined}
                  constraintText="Between 3 and 255 characters, containing only letters, numbers, underscores (_), hyphens (-), and periods (.).">
                  <Input value={name} onChange={e => setName(e.detail.value)} placeholder="Enter the table name" />
                </FormField>
                <KeyInput label="Partition key" value={pk} onChange={setPk} error={pkErr || undefined}
                  description="The partition key is part of the table's primary key. It is a hash value that is used to retrieve items from your table and allocate data across hosts for scalability and availability." />
                <KeyInput label="Sort key" optional value={sk} onChange={setSk}
                  description="You can use a sort key as the second part of a table's primary key. The sort key allows you to sort or search among all items sharing the same partition key." />
              </SpaceBetween>
            </Container>

            <Container header={<Header variant="h2" description="These are the default settings for your new table. You can change some of these settings after creating the table.">Table settings</Header>}>
              <Tiles value={mode} onChange={e => setMode(e.detail.value as any)} items={[
                { value: "default", label: "Default settings", description: "The fastest way to create your table. You can modify most of these settings after your table has been created. To modify these settings now, choose 'Customize settings'." },
                { value: "custom", label: "Customize settings", description: "Use these advanced features to make DynamoDB work better for your needs." },
              ]} />
            </Container>

            {mode === "default" && (
              <Table header={<Header variant="h2">Default table settings</Header>} items={defaults}
                columnDefinitions={[{ id: "s", header: "Setting", cell: r => r[0] }, { id: "v", header: "Value", cell: r => r[1] }, { id: "e", header: "Editable after creation", cell: r => r[2] }]} />
            )}

            {mode === "custom" && <>
              <Container header={<Header variant="h2" description="Choose a table class to optimize for costs based on your workload requirements and data access patterns.">Table class</Header>}>
                <Tiles value={klass} onChange={e => setKlass(e.detail.value)} items={[
                  { value: "STANDARD", label: "DynamoDB Standard", description: "The default general-purpose table class. Recommended for the vast majority of tables that store frequently accessed data, with throughput (reads and writes) as the dominant table cost." },
                  { value: "STANDARD_INFREQUENT_ACCESS", label: "DynamoDB Standard-IA", description: "Recommended for tables that store data that is infrequently accessed, with storage as the dominant table cost." },
                ]} />
              </Container>
              <Container header={<Header variant="h2" description="Capacity mode and auto scaling settings for reads and writes.">Read/write capacity settings</Header>}>
                <CapacityFields value={cap} onChange={setCap} />
              </Container>
              <Container header={<Header variant="h2" description="Pre-warm your table to handle peak traffic at launch.">Warm throughput</Header>}>
                <SpaceBetween size="m">
                  <Checkbox checked={warm.on} onChange={e => setWarm({ ...warm, on: e.detail.checked })}>Increase warm throughput</Checkbox>
                  {warm.on && <ColumnLayout columns={2}>
                    <FormField label="Read units per second"><Input type="number" value={warm.read} onChange={e => setWarm({ ...warm, read: e.detail.value })} /></FormField>
                    <FormField label="Write units per second"><Input type="number" value={warm.write} onChange={e => setWarm({ ...warm, write: e.detail.value })} /></FormField>
                  </ColumnLayout>}
                </SpaceBetween>
              </Container>
            </>}

            <Table
              header={<Header counter={`(${indexes.length})`} description="Secondary indexes let you query the data in the table using an alternate key. Local indexes can only be created along with the table."
                actions={<SpaceBetween direction="horizontal" size="xs">
                  <Button formAction="none" disabled={!indexes.length} onClick={() => setIndexes([])}>Delete all</Button>
                  <ButtonDropdown onItemClick={e => setIdxModal(e.detail.id as any)} items={[{ id: "LSI", text: "Create local index", disabled: !sk.name && !pk.name }, { id: "GSI", text: "Create global index" }]}>Create index</ButtonDropdown>
                </SpaceBetween>}>Secondary indexes</Header>}
              items={indexes}
              empty={<Box textAlign="center" color="inherit"><b>No secondary indexes</b><Box variant="p" color="inherit">You haven't added any secondary indexes.</Box></Box>}
              columnDefinitions={[
                { id: "n", header: "Name", cell: i => i.name },
                { id: "t", header: "Type", cell: i => i.kind },
                { id: "pk", header: "Partition key", cell: i => `${i.pk.name} (${typeLabel(i.pk.type)})` },
                { id: "sk", header: "Sort key", cell: i => i.sk.name ? `${i.sk.name} (${typeLabel(i.sk.type)})` : "-" },
                { id: "p", header: "Projected attributes", cell: i => i.projection === "INCLUDE" ? `Include: ${i.attrs.join(", ")}` : i.projection === "ALL" ? "All" : "Keys only" },
                { id: "x", header: "", cell: i => <Button formAction="none" variant="inline-link" onClick={() => setIndexes(indexes.filter(x => x !== i))}>Remove</Button> },
              ]}
            />

            {mode === "custom" && <>
              <Container header={<Header variant="h2" description="All user data stored in Amazon DynamoDB is fully encrypted at rest. When creating a new table, you can choose one of the following AWS KMS keys to encrypt your table.">Encryption at rest</Header>}>
                <EncryptionFields value={enc} onChange={setEnc} />
              </Container>
              <Container header={<Header variant="h2">Deletion protection</Header>}>
                <Checkbox checked={protect} onChange={e => setProtect(e.detail.checked)} description="Protects the table from being deleted unintentionally. While this setting is on, you can't delete the table.">Turn on deletion protection</Checkbox>
              </Container>
              <Container header={<Header variant="h2" description="Resource-based policies control who can access this table. The emulator stores the policy but doesn't evaluate it.">Resource-based policy - <i>optional</i></Header>}>
                <FormField errorText={policyErr}><Textarea rows={8} value={policy} onChange={e => setPolicy(e.detail.value)} placeholder='{"Version": "2012-10-17", "Statement": []}' /></FormField>
              </Container>
            </>}

            <Container header={<Header variant="h2" description="Tags are pairs of keys and optional values, that you can assign to AWS resources.">Tags - <i>optional</i></Header>}>
              <Tags tags={tags} onChange={setTags} />
            </Container>
          </SpaceBetween>
        </Form>
      </form>
      <IndexModal visible={!!idxModal} kind={(idxModal || "GSI") as any} tablePk={pk} onDismiss={() => setIdxModal("")} onAdd={d => { setIndexes([...indexes, d]); setIdxModal(""); }} />
    </ContentLayout>
  );
}
