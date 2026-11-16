// Form sections reused by Create bucket, Edit pages and Upload.
import Checkbox from "@cloudscape-design/components/checkbox";
import FormField from "@cloudscape-design/components/form-field";
import RadioGroup from "@cloudscape-design/components/radio-group";
import Tiles from "@cloudscape-design/components/tiles";
import Select from "@cloudscape-design/components/select";
import Input from "@cloudscape-design/components/input";
import SpaceBetween from "@cloudscape-design/components/space-between";
import TagEditor from "@cloudscape-design/components/tag-editor";
import AttributeEditor from "@cloudscape-design/components/attribute-editor";
import Box from "@cloudscape-design/components/box";
import Alert from "@cloudscape-design/components/alert";
import Table from "@cloudscape-design/components/table";
import type { KV } from "./lib";
import { STORAGE_CLASSES } from "./lib";

// ---------------- Block Public Access ----------------
export type BPA = { BlockPublicAcls: boolean; IgnorePublicAcls: boolean; BlockPublicPolicy: boolean; RestrictPublicBuckets: boolean };
export const BPA_ALL: BPA = { BlockPublicAcls: true, IgnorePublicAcls: true, BlockPublicPolicy: true, RestrictPublicBuckets: true };
export const BPA_NONE: BPA = { BlockPublicAcls: false, IgnorePublicAcls: false, BlockPublicPolicy: false, RestrictPublicBuckets: false };
const BPA_ITEMS: { k: keyof BPA; label: string; desc: string }[] = [
  { k: "BlockPublicAcls", label: "Block public access to buckets and objects granted through new access control lists (ACLs)", desc: "S3 will block public access permissions applied to newly added buckets or objects, and prevent the creation of new public access ACLs for existing buckets and objects. This setting doesn't change any existing permissions that allow public access to S3 resources using ACLs." },
  { k: "IgnorePublicAcls", label: "Block public access to buckets and objects granted through any access control lists (ACLs)", desc: "S3 will ignore all ACLs that grant public access to buckets and objects." },
  { k: "BlockPublicPolicy", label: "Block public access to buckets and objects granted through new public bucket or access point policies", desc: "S3 will block new bucket and access point policies that grant public access to buckets and objects. This setting doesn't change any existing policies that allow public access to S3 resources." },
  { k: "RestrictPublicBuckets", label: "Block public and cross-account access to buckets and objects through any public bucket or access point policies", desc: "S3 will ignore public and cross-account access for buckets or access points with policies that grant public access to buckets and objects." },
];
export function BlockPublicAccessFields({ value, onChange }: { value: BPA; onChange: (v: BPA) => void }) {
  const all = Object.values(value).every(Boolean);
  const some = Object.values(value).some(Boolean);
  return (
    <SpaceBetween size="s">
      <Checkbox checked={all} indeterminate={some && !all} onChange={e => onChange(e.detail.checked ? BPA_ALL : BPA_NONE)}
        description="Turning this setting on is the same as turning on all four settings below. Each of the following settings are independent of one another.">
        <b>Block <i>all</i> public access</b>
      </Checkbox>
      <div style={{ paddingLeft: 24 }}>
        <SpaceBetween size="s">
          {BPA_ITEMS.map(i => (
            <Checkbox key={i.k} checked={value[i.k]} onChange={e => onChange({ ...value, [i.k]: e.detail.checked })} description={i.desc}>{i.label}</Checkbox>
          ))}
        </SpaceBetween>
      </div>
      {!all && (
        <Alert type="warning" header="Turning off block all public access might result in this bucket and the objects within becoming public">
          AWS recommends that you turn on block all public access, unless public access is required for specific and verified use cases such as static website hosting.
        </Alert>
      )}
    </SpaceBetween>
  );
}

// ---------------- Default encryption ----------------
export type Enc = { type: "AES256" | "aws:kms" | "aws:kms:dsse"; kmsKey: string; bucketKey: boolean };
export const ENC_DEFAULT: Enc = { type: "AES256", kmsKey: "", bucketKey: true };
export function encToConfig(e: Enc) {
  const by: any = { SSEAlgorithm: e.type };
  if (e.type !== "AES256" && e.kmsKey) by.KMSMasterKeyID = e.kmsKey;
  return { Rules: [{ ApplyServerSideEncryptionByDefault: by, BucketKeyEnabled: e.type === "aws:kms" ? e.bucketKey : undefined }] };
}
export function encFromConfig(c: any): Enc {
  const r = c?.ServerSideEncryptionConfiguration?.Rules?.[0];
  if (!r) return ENC_DEFAULT;
  return { type: r.ApplyServerSideEncryptionByDefault?.SSEAlgorithm || "AES256", kmsKey: r.ApplyServerSideEncryptionByDefault?.KMSMasterKeyID || "", bucketKey: !!r.BucketKeyEnabled };
}
export const encLabel = (t?: string) =>
  t === "aws:kms" ? "Server-side encryption with AWS Key Management Service keys (SSE-KMS)"
    : t === "aws:kms:dsse" ? "Dual-layer server-side encryption with AWS Key Management Service keys (DSSE-KMS)"
      : "Server-side encryption with Amazon S3 managed keys (SSE-S3)";

export function EncryptionFields({ value, onChange }: { value: Enc; onChange: (v: Enc) => void }) {
  return (
    <SpaceBetween size="l">
      <FormField label="Encryption type" info={<Box variant="small">Server-side encryption is automatically applied to new objects stored in this bucket.</Box>}>
        <RadioGroup value={value.type} onChange={e => onChange({ ...value, type: e.detail.value as Enc["type"] })} items={[
          { value: "AES256", label: "Server-side encryption with Amazon S3 managed keys (SSE-S3)" },
          { value: "aws:kms", label: "Server-side encryption with AWS Key Management Service keys (SSE-KMS)" },
          { value: "aws:kms:dsse", label: "Dual-layer server-side encryption with AWS Key Management Service keys (DSSE-KMS)", description: "Secure your objects with two separate layers of encryption." },
        ]} />
      </FormField>
      {value.type !== "AES256" && (
        <FormField label="AWS KMS key" description="Enter an AWS KMS key ARN or alias. Leave empty to use the AWS managed key (aws/s3).">
          <Input value={value.kmsKey} placeholder="arn:aws:kms:us-east-1:000000000000:key/… or alias/aws/s3" onChange={e => onChange({ ...value, kmsKey: e.detail.value })} />
        </FormField>
      )}
      {value.type === "aws:kms" && (
        <FormField label="Bucket Key" description="Using an S3 Bucket Key for SSE-KMS reduces encryption costs by lowering calls to AWS KMS.">
          <RadioGroup value={value.bucketKey ? "on" : "off"} onChange={e => onChange({ ...value, bucketKey: e.detail.value === "on" })}
            items={[{ value: "off", label: "Disable" }, { value: "on", label: "Enable" }]} />
        </FormField>
      )}
    </SpaceBetween>
  );
}

// ---------------- Tags ----------------
export function Tags({ tags, onChange, limit = 50 }: { tags: KV[]; onChange: (t: KV[]) => void; limit?: number }) {
  return (
    <TagEditor
      tags={tags.map(t => ({ ...t, existing: !!t.existing, markedForRemoval: !!t.markedForRemoval }))}
      onChange={e => onChange(e.detail.tags as KV[])}
      tagLimit={limit}
      i18nStrings={{
        keyPlaceholder: "Enter key", valuePlaceholder: "Enter value - optional", addButton: "Add tag", removeButton: "Remove",
        undoButton: "Undo", undoPrompt: "This tag will be removed upon saving changes", loading: "Loading tags",
        keyHeader: "Key", valueHeader: "Value - optional", optional: "optional", keySuggestion: "Custom tag key", valueSuggestion: "Custom tag value",
        emptyTags: "No tags associated with the resource.", tooManyKeysSuggestion: "You have more keys than can be displayed",
        tooManyValuesSuggestion: "You have more values than can be displayed", keysSuggestionLoading: "Loading tag keys",
        keysSuggestionError: "Tag keys could not be retrieved", valuesSuggestionLoading: "Loading tag values",
        valuesSuggestionError: "Tag values could not be retrieved", emptyKeyError: "You must specify a tag key",
        maxKeyCharLengthError: "The maximum number of characters you can use in a tag key is 128.",
        maxValueCharLengthError: "The maximum number of characters you can use in a tag value is 256.",
        duplicateKeyError: "You must specify a unique tag key.",
        invalidKeyError: "Invalid key.", invalidValueError: "Invalid value.",
        awsPrefixError: "Cannot start with aws:",
        tagLimit: (available, limit) => available === limit ? `You can add up to ${limit} tags.` : `You can add up to ${available} more tag${available === 1 ? "" : "s"}.`,
        tagLimitReached: l => `You have reached the limit of ${l} tags.`, tagLimitExceeded: l => `You have exceeded the limit of ${l} tags.`,
        enteredKeyLabel: k => `Use "${k}"`, enteredValueLabel: v => `Use "${v}"`,
      }}
    />
  );
}

// ---------------- Metadata ----------------
export type Meta = { type: "system" | "user"; key: string; value: string };
export const SYSTEM_META = ["Content-Type", "Cache-Control", "Content-Disposition", "Content-Encoding", "Content-Language", "Expires", "x-amz-website-redirect-location"];
export function MetadataEditor({ items, onChange }: { items: Meta[]; onChange: (m: Meta[]) => void }) {
  return (
    <AttributeEditor
      items={items}
      addButtonText="Add metadata"
      removeButtonText="Remove"
      empty="No metadata."
      onAddButtonClick={() => onChange([...items, { type: "system", key: "Content-Type", value: "" }])}
      onRemoveButtonClick={e => onChange(items.filter((_, i) => i !== e.detail.itemIndex))}
      definition={[
        { label: "Type", control: (it, i) => (
          <Select selectedOption={{ value: it.type, label: it.type === "system" ? "System defined" : "User defined" }}
            options={[{ value: "system", label: "System defined" }, { value: "user", label: "User defined" }]}
            onChange={e => onChange(items.map((x, j) => j === i ? { ...x, type: e.detail.selectedOption.value as Meta["type"], key: e.detail.selectedOption.value === "system" ? "Content-Type" : "x-amz-meta-" } : x))} />
        ) },
        { label: "Key", control: (it, i) => it.type === "system"
          ? <Select selectedOption={{ value: it.key, label: it.key }} options={SYSTEM_META.map(k => ({ value: k, label: k }))}
              onChange={e => onChange(items.map((x, j) => j === i ? { ...x, key: e.detail.selectedOption.value! } : x))} />
          : <Input value={it.key} onChange={e => onChange(items.map((x, j) => j === i ? { ...x, key: e.detail.value } : x))} placeholder="x-amz-meta-" /> },
        { label: "Value", control: (it, i) => <Input value={it.value} onChange={e => onChange(items.map((x, j) => j === i ? { ...x, value: e.detail.value } : x))} /> },
      ]}
    />
  );
}
const SYS_PARAM: Record<string, string> = {
  "Content-Type": "ContentType", "Cache-Control": "CacheControl", "Content-Disposition": "ContentDisposition",
  "Content-Encoding": "ContentEncoding", "Content-Language": "ContentLanguage", "Expires": "Expires", "x-amz-website-redirect-location": "WebsiteRedirectLocation",
};
/** Metadata rows -> PutObject/CopyObject params. */
export function metaToParams(items: Meta[]) {
  const p: Record<string, any> = {};
  const user: Record<string, string> = {};
  for (const m of items) {
    if (!m.key) continue;
    if (m.type === "system") p[SYS_PARAM[m.key]] = m.value;
    else user[m.key.replace(/^x-amz-meta-/i, "")] = m.value;
  }
  if (Object.keys(user).length) p.Metadata = user;
  return p;
}
/** HeadObject -> metadata rows. */
export function metaFromHead(h: any): Meta[] {
  const rows: Meta[] = [];
  for (const [k, param] of Object.entries(SYS_PARAM)) if (h[param]) rows.push({ type: "system", key: k, value: String(h[param]) });
  for (const [k, v] of Object.entries(h.Metadata || {})) rows.push({ type: "user", key: `x-amz-meta-${k}`, value: String(v) });
  return rows;
}

// ---------------- Storage class ----------------
export function StorageClassPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <SpaceBetween size="m">
      <Tiles value={value} onChange={e => onChange(e.detail.value)} columns={4}
        items={STORAGE_CLASSES.filter(s => s.value !== "REDUCED_REDUNDANCY").map(s => ({ value: s.value, label: s.label, description: s.desc }))} />
      <Table
        variant="embedded"
        items={STORAGE_CLASSES.filter(s => s.value !== "REDUCED_REDUNDANCY")}
        columnDefinitions={[
          { id: "c", header: "Storage class", cell: s => s.label },
          { id: "az", header: "Availability Zones", cell: s => s.az },
          { id: "min", header: "Min storage duration", cell: s => s.min },
          { id: "size", header: "Min billable object size", cell: s => s.minSize },
        ]}
      />
    </SpaceBetween>
  );
}
