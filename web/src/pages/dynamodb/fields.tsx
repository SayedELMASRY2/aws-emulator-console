// Shared DynamoDB form pieces: key inputs, capacity, encryption, index modal.
import { useState } from "react";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Select from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Tiles from "@cloudscape-design/components/tiles";
import RadioGroup from "@cloudscape-design/components/radio-group";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Modal from "@cloudscape-design/components/modal";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import TokenGroup from "@cloudscape-design/components/token-group";
import Header from "@cloudscape-design/components/header";
import { ATTR_TYPES } from "./lib";

export type Key = { name: string; type: string };
export function KeyInput({ label, value, onChange, optional, error, description }: { label: string; value: Key; onChange: (k: Key) => void; optional?: boolean; error?: string; description?: string }) {
  return (
    <FormField label={optional ? <>{label} - <i>optional</i></> : label} description={description} errorText={error}
      constraintText="1 to 255 characters and case sensitive.">
      <SpaceBetween direction="horizontal" size="xs">
        <div style={{ minWidth: 280 }}><Input value={value.name} placeholder="Enter the name" onChange={e => onChange({ ...value, name: e.detail.value })} /></div>
        <Select selectedOption={ATTR_TYPES.find(a => a.value === value.type)!} options={ATTR_TYPES} onChange={e => onChange({ ...value, type: e.detail.selectedOption.value! })} />
      </SpaceBetween>
    </FormField>
  );
}

// ---------------- Capacity ----------------
export type Side = { auto: boolean; units: string; min: string; max: string; target: string };
export type Capacity = { mode: "PAY_PER_REQUEST" | "PROVISIONED"; read: Side; write: Side; maxRead: string; maxWrite: string };
export const CAP_DEFAULT: Capacity = {
  mode: "PAY_PER_REQUEST", maxRead: "", maxWrite: "",
  read: { auto: true, units: "5", min: "1", max: "10", target: "70" },
  write: { auto: true, units: "5", min: "1", max: "10", target: "70" },
};
function SideFields({ label, v, onChange }: { label: string; v: Side; onChange: (s: Side) => void }) {
  return (
    <SpaceBetween size="m">
      <Box variant="h3">{label} capacity</Box>
      <FormField label="Auto scaling" description="Dynamically adjusts provisioned throughput capacity on your behalf in response to actual traffic patterns.">
        <RadioGroup value={v.auto ? "on" : "off"} onChange={e => onChange({ ...v, auto: e.detail.value === "on" })} items={[{ value: "on", label: "On" }, { value: "off", label: "Off" }]} />
      </FormField>
      {v.auto ? (
        <ColumnLayout columns={3}>
          <FormField label="Minimum capacity units"><Input type="number" value={v.min} onChange={e => onChange({ ...v, min: e.detail.value })} /></FormField>
          <FormField label="Maximum capacity units"><Input type="number" value={v.max} onChange={e => onChange({ ...v, max: e.detail.value })} /></FormField>
          <FormField label="Target utilization (%)"><Input type="number" value={v.target} onChange={e => onChange({ ...v, target: e.detail.value })} /></FormField>
        </ColumnLayout>
      ) : (
        <FormField label="Provisioned capacity units"><Input type="number" value={v.units} onChange={e => onChange({ ...v, units: e.detail.value })} /></FormField>
      )}
    </SpaceBetween>
  );
}
export function CapacityFields({ value, onChange }: { value: Capacity; onChange: (c: Capacity) => void }) {
  return (
    <SpaceBetween size="l">
      <FormField label="Capacity mode">
        <Tiles value={value.mode} onChange={e => onChange({ ...value, mode: e.detail.value as Capacity["mode"] })} items={[
          { value: "PAY_PER_REQUEST", label: "On-demand", description: "Simplify billing by paying for the actual reads and writes your application performs." },
          { value: "PROVISIONED", label: "Provisioned", description: "Manage and optimize your costs by allocating read/write capacity in advance." },
        ]} />
      </FormField>
      {value.mode === "PROVISIONED" ? (
        <ColumnLayout columns={2} borders="vertical">
          <SideFields label="Read" v={value.read} onChange={read => onChange({ ...value, read })} />
          <SideFields label="Write" v={value.write} onChange={write => onChange({ ...value, write })} />
        </ColumnLayout>
      ) : (
        <SpaceBetween size="s">
          <Box variant="h3">Maximum table throughput - <i>optional</i></Box>
          <ColumnLayout columns={2}>
            <FormField label="Maximum read request units" description="Leave empty for no maximum."><Input type="number" value={value.maxRead} onChange={e => onChange({ ...value, maxRead: e.detail.value })} /></FormField>
            <FormField label="Maximum write request units" description="Leave empty for no maximum."><Input type="number" value={value.maxWrite} onChange={e => onChange({ ...value, maxWrite: e.detail.value })} /></FormField>
          </ColumnLayout>
        </SpaceBetween>
      )}
    </SpaceBetween>
  );
}
/** Params for CreateTable / UpdateTable from the capacity form. */
export function capacityParams(c: Capacity) {
  if (c.mode === "PAY_PER_REQUEST") {
    const p: any = { BillingMode: "PAY_PER_REQUEST" };
    if (c.maxRead || c.maxWrite) p.OnDemandThroughput = { ...(c.maxRead ? { MaxReadRequestUnits: Number(c.maxRead) } : {}), ...(c.maxWrite ? { MaxWriteRequestUnits: Number(c.maxWrite) } : {}) };
    return p;
  }
  const units = (s: Side) => Number(s.auto ? s.min : s.units);
  return { BillingMode: "PROVISIONED", ProvisionedThroughput: { ReadCapacityUnits: units(c.read), WriteCapacityUnits: units(c.write) } };
}

// ---------------- Encryption ----------------
export type Enc = { kind: "owned" | "managed" | "cmk"; key: string };
export function EncryptionFields({ value, onChange }: { value: Enc; onChange: (e: Enc) => void }) {
  return (
    <SpaceBetween size="m">
      <Tiles value={value.kind} onChange={e => onChange({ ...value, kind: e.detail.value as Enc["kind"] })} items={[
        { value: "owned", label: "Owned by Amazon DynamoDB", description: "The AWS KMS key is owned and managed by DynamoDB. You are not charged an additional fee for using this key." },
        { value: "managed", label: "AWS managed key", description: "Key alias: aws/dynamodb. The key is stored in your account and is managed by AWS KMS." },
        { value: "cmk", label: "Stored in your account, and owned and managed by you", description: "Key alias or ARN of a customer managed key." },
      ]} />
      {value.kind === "cmk" && <FormField label="AWS KMS key ARN or alias"><Input value={value.key} onChange={e => onChange({ ...value, key: e.detail.value })} placeholder="arn:aws:kms:us-east-1:000000000000:key/…" /></FormField>}
    </SpaceBetween>
  );
}
export const sseSpec = (e: Enc) => e.kind === "owned" ? { Enabled: false } : { Enabled: true, SSEType: "KMS", ...(e.kind === "cmk" && e.key ? { KMSMasterKeyId: e.key } : {}) };

// ---------------- Secondary index modal ----------------
export type IndexDef = { kind: "GSI" | "LSI"; name: string; pk: Key; sk: Key; projection: "ALL" | "KEYS_ONLY" | "INCLUDE"; attrs: string[] };
export function IndexModal({ visible, kind, tablePk, onDismiss, onAdd }: { visible: boolean; kind: "GSI" | "LSI"; tablePk: Key; onDismiss: () => void; onAdd: (d: IndexDef) => void }) {
  const [pk, setPk] = useState<Key>({ name: "", type: "S" });
  const [sk, setSk] = useState<Key>({ name: "", type: "S" });
  const [name, setName] = useState("");
  const [proj, setProj] = useState<IndexDef["projection"]>("ALL");
  const [attr, setAttr] = useState("");
  const [attrs, setAttrs] = useState<string[]>([]);
  const [tried, setTried] = useState(false);
  const p = kind === "LSI" ? tablePk : pk;
  const errName = tried && (name.length < 3 ? "Index name must be 3 to 255 characters." : undefined);
  const add = () => {
    setTried(true);
    if (name.length < 3 || !p.name || (kind === "LSI" && !sk.name)) return;
    onAdd({ kind, name, pk: p, sk, projection: proj, attrs });
    setPk({ name: "", type: "S" }); setSk({ name: "", type: "S" }); setName(""); setProj("ALL"); setAttrs([]); setTried(false);
  };
  return (
    <Modal visible={visible} onDismiss={onDismiss} size="large" header={kind === "GSI" ? "Create global index" : "Create local index"}
      footer={<Box float="right"><SpaceBetween direction="horizontal" size="xs"><Button variant="link" onClick={onDismiss}>Cancel</Button><Button variant="primary" onClick={add}>Create index</Button></SpaceBetween></Box>}>
      <SpaceBetween size="l">
        {kind === "GSI"
          ? <KeyInput label="Partition key" value={pk} onChange={setPk} error={tried && !pk.name ? "Partition key is required." : undefined} />
          : <FormField label="Partition key" description="Local indexes use the table's partition key."><Box>{tablePk.name || "(set the table partition key first)"}</Box></FormField>}
        <KeyInput label="Sort key" optional={kind === "GSI"} value={sk} onChange={setSk} error={tried && kind === "LSI" && !sk.name ? "Local indexes need a sort key." : undefined} />
        <FormField label="Index name" errorText={errName}><Input value={name} onChange={e => setName(e.detail.value)} placeholder={`${pk.name || "attr"}-index`} /></FormField>
        <FormField label="Attribute projections" description="Choose the attributes to project into the index.">
          <RadioGroup value={proj} onChange={e => setProj(e.detail.value as any)} items={[
            { value: "ALL", label: "All", description: "All of the table attributes are projected into the index." },
            { value: "KEYS_ONLY", label: "Only keys", description: "Only the index and primary keys are projected into the index." },
            { value: "INCLUDE", label: "Include", description: "Only the specified attributes are projected into the index." },
          ]} />
        </FormField>
        {proj === "INCLUDE" && (
          <FormField label="Projected attributes">
            <SpaceBetween size="xs">
              <SpaceBetween direction="horizontal" size="xs">
                <Input value={attr} onChange={e => setAttr(e.detail.value)} placeholder="Attribute name" />
                <Button formAction="none" onClick={() => { if (attr && !attrs.includes(attr)) setAttrs([...attrs, attr]); setAttr(""); }}>Add attribute</Button>
              </SpaceBetween>
              <TokenGroup items={attrs.map(a => ({ label: a, dismissLabel: `Remove ${a}` }))} onDismiss={e => setAttrs(attrs.filter((_, i) => i !== e.detail.itemIndex))} />
            </SpaceBetween>
          </FormField>
        )}
      </SpaceBetween>
    </Modal>
  );
}
export function indexToApi(d: IndexDef, cap?: any) {
  const ks = [{ AttributeName: d.pk.name, KeyType: "HASH" }, ...(d.sk.name ? [{ AttributeName: d.sk.name, KeyType: "RANGE" }] : [])];
  const projection: any = { ProjectionType: d.projection };
  if (d.projection === "INCLUDE") projection.NonKeyAttributes = d.attrs;
  const out: any = { IndexName: d.name, KeySchema: ks, Projection: projection };
  if (d.kind === "GSI" && cap?.ProvisionedThroughput) out.ProvisionedThroughput = cap.ProvisionedThroughput;
  return out;
}
export const indexAttrDefs = (d: IndexDef) => [d.pk, ...(d.sk.name ? [d.sk] : [])].map(k => ({ AttributeName: k.name, AttributeType: k.type }));

export function SectionHeader({ children, description, counter, actions }: any) {
  return <Header variant="h2" description={description} counter={counter} actions={actions}>{children}</Header>;
}

