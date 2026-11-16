import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Form from "@cloudscape-design/components/form";
import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Button from "@cloudscape-design/components/button";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import RadioGroup from "@cloudscape-design/components/radio-group";
import TokenGroup from "@cloudscape-design/components/token-group";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Box from "@cloudscape-design/components/box";
import { useCrumbs } from "../../App";
import { ErrorAlert, useAsync, useFlash } from "../../common";
import { ddb, tableHref, isOnDemand } from "./lib";
import { KeyInput, type Key } from "./fields";

export default function CreateIndex() {
  const { table = "" } = useParams();
  const nav = useNavigate();
  const flash = useFlash();
  useCrumbs([{ text: "DynamoDB", href: "#/dynamodb/dashboard" }, { text: "Tables", href: "#/dynamodb/tables" }, { text: table, href: tableHref(table, "indexes") }, { text: "Create global secondary index", href: "#" }]);
  const t = useAsync(async () => (await ddb("DescribeTable", { TableName: table })).Table, [table]);
  const [pk, setPk] = useState<Key>({ name: "", type: "S" });
  const [sk, setSk] = useState<Key>({ name: "", type: "S" });
  const [name, setName] = useState("");
  const [proj, setProj] = useState("ALL");
  const [attr, setAttr] = useState("");
  const [attrs, setAttrs] = useState<string[]>([]);
  const [rcu, setRcu] = useState("5");
  const [wcu, setWcu] = useState("5");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [tried, setTried] = useState(false);
  const save = async () => {
    setTried(true);
    if (!pk.name || name.length < 3) return;
    setBusy(true); setErr(null);
    try {
      const defs = [pk, ...(sk.name ? [sk] : [])].map(k => ({ AttributeName: k.name, AttributeType: k.type }));
      const gsi: any = { IndexName: name, KeySchema: [{ AttributeName: pk.name, KeyType: "HASH" }, ...(sk.name ? [{ AttributeName: sk.name, KeyType: "RANGE" }] : [])], Projection: { ProjectionType: proj, ...(proj === "INCLUDE" ? { NonKeyAttributes: attrs } : {}) } };
      if (!isOnDemand(t.data)) gsi.ProvisionedThroughput = { ReadCapacityUnits: Number(rcu), WriteCapacityUnits: Number(wcu) };
      await ddb("UpdateTable", { TableName: table, AttributeDefinitions: defs, GlobalSecondaryIndexUpdates: [{ Create: gsi }] });
      flash.notify({ type: "success", content: `Creating the ${name} index. It can be queried once its status is Active.` });
      nav(tableHref(table, "indexes").slice(1));
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <ContentLayout header={<Header variant="h1" description="A global secondary index lets you query a table using an alternate partition key and sort key.">Create global secondary index</Header>}>
      <form onSubmit={e => { e.preventDefault(); save(); }}>
        <Form errorText={err ? <ErrorAlert error={err} /> : undefined}
          actions={<SpaceBetween direction="horizontal" size="xs"><Button formAction="none" variant="link" onClick={() => nav(-1)}>Cancel</Button><Button variant="primary" loading={busy}>Create index</Button></SpaceBetween>}>
          <SpaceBetween size="l">
            <Container header={<Header variant="h2">Index details</Header>}>
              <SpaceBetween size="l">
                <KeyInput label="Partition key" value={pk} onChange={p => { setPk(p); if (!name) setName(""); }} error={tried && !pk.name ? "Partition key is required." : undefined} />
                <KeyInput label="Sort key" optional value={sk} onChange={setSk} />
                <FormField label="Index name" errorText={tried && name.length < 3 ? "Index name must be 3 to 255 characters." : undefined}>
                  <Input value={name} onChange={e => setName(e.detail.value)} placeholder={`${pk.name || "attribute"}${sk.name ? "-" + sk.name : ""}-index`} />
                </FormField>
              </SpaceBetween>
            </Container>
            {t.data && !isOnDemand(t.data) && (
              <Container header={<Header variant="h2" description="The table uses provisioned capacity, so the index needs its own read and write capacity.">Index capacity</Header>}>
                <ColumnLayout columns={2}>
                  <FormField label="Read capacity units"><Input type="number" value={rcu} onChange={e => setRcu(e.detail.value)} /></FormField>
                  <FormField label="Write capacity units"><Input type="number" value={wcu} onChange={e => setWcu(e.detail.value)} /></FormField>
                </ColumnLayout>
              </Container>
            )}
            <Container header={<Header variant="h2" description="Choose the attributes to project into the index.">Attribute projections</Header>}>
              <SpaceBetween size="m">
                <RadioGroup value={proj} onChange={e => setProj(e.detail.value)} items={[
                  { value: "ALL", label: "All", description: "All of the table attributes are projected into the index." },
                  { value: "KEYS_ONLY", label: "Only keys", description: "Only the index and primary keys are projected into the index." },
                  { value: "INCLUDE", label: "Include", description: "Only the specified attributes are projected into the index." },
                ]} />
                {proj === "INCLUDE" && <>
                  <SpaceBetween direction="horizontal" size="xs">
                    <Input value={attr} onChange={e => setAttr(e.detail.value)} placeholder="Attribute name" />
                    <Button formAction="none" onClick={() => { if (attr && !attrs.includes(attr)) setAttrs([...attrs, attr]); setAttr(""); }}>Add attribute</Button>
                  </SpaceBetween>
                  <TokenGroup items={attrs.map(a => ({ label: a }))} onDismiss={e => setAttrs(attrs.filter((_, i) => i !== e.detail.itemIndex))} />
                </>}
              </SpaceBetween>
            </Container>
            <Box variant="small" color="text-body-secondary">Local secondary indexes can only be added when the table is created.</Box>
          </SpaceBetween>
        </Form>
      </form>
    </ContentLayout>
  );
}
