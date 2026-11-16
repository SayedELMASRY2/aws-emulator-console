// Edit pages for one or more objects: storage class, encryption, metadata, tags, legal hold, retention, ACL.
import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import Form from "@cloudscape-design/components/form";
import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Button from "@cloudscape-design/components/button";
import FormField from "@cloudscape-design/components/form-field";
import RadioGroup from "@cloudscape-design/components/radio-group";
import Checkbox from "@cloudscape-design/components/checkbox";
import DatePicker from "@cloudscape-design/components/date-picker";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Table from "@cloudscape-design/components/table";
import Spinner from "@cloudscape-design/components/spinner";
import ContentLayout from "@cloudscape-design/components/content-layout";
import { useCrumbs } from "../../App";
import { ErrorAlert, errText, useAsync, useFlash } from "../../common";
import { s3, getOr, bucketHref, objectHref, toTagSet, fromTagSet, type KV } from "./lib";
import { StorageClassPicker, EncryptionFields, ENC_DEFAULT, Tags, MetadataEditor, metaToParams, metaFromHead, type Enc, type Meta } from "./fields";

const TITLES: Record<string, string> = {
  "storage-class": "Edit storage class", encryption: "Edit server-side encryption", metadata: "Edit metadata", tags: "Edit tags",
  "legal-hold": "Edit Object Lock legal hold", retention: "Edit Object Lock retention", acl: "Edit access control list (ACL)",
};

export default function EditObjectSetting() {
  const { bucket = "", setting = "" } = useParams();
  const [sp] = useSearchParams();
  const keys: string[] = sp.get("keys") ? JSON.parse(sp.get("keys")!) : [sp.get("key") || ""];
  const versionId = sp.get("versionId") || undefined;
  const backPrefix = sp.get("back");
  const single = keys.length === 1;
  const nav = useNavigate();
  const flash = useFlash();
  const title = TITLES[setting] || setting;
  useCrumbs([{ text: "Amazon S3", href: "#/s3/buckets" }, { text: "Buckets", href: "#/s3/buckets" }, { text: bucket, href: bucketHref(bucket) },
    ...(single ? [{ text: keys[0].split("/").pop() || keys[0], href: objectHref(bucket, keys[0], versionId) }] : []), { text: title, href: "#" }]);

  const V = versionId ? { VersionId: versionId } : {};
  const init = useAsync(async () => {
    const head = await s3("HeadObject", { Bucket: bucket, Key: keys[0], ...V });
    const tags = await getOr("GetObjectTagging", { Bucket: bucket, Key: keys[0], ...V }, { TagSet: [] });
    const hold = setting === "legal-hold" ? await getOr("GetObjectLegalHold", { Bucket: bucket, Key: keys[0], ...V }, null) : null;
    const ret = setting === "retention" ? await getOr("GetObjectRetention", { Bucket: bucket, Key: keys[0], ...V }, null) : null;
    const acl = setting === "acl" ? await s3("GetObjectAcl", { Bucket: bucket, Key: keys[0], ...V }) : null;
    return { head, tags: tags.TagSet || [], hold: hold?.LegalHold?.Status === "ON", ret: ret?.Retention, acl };
  }, [bucket, setting, sp.toString()]);

  const [cls, setCls] = useState("STANDARD");
  const [encMode, setEncMode] = useState("default");
  const [enc, setEnc] = useState<Enc>(ENC_DEFAULT);
  const [meta, setMeta] = useState<Meta[]>([]);
  const [tags, setTags] = useState<KV[]>([]);
  const [hold, setHold] = useState(false);
  const [retOn, setRetOn] = useState(false);
  const [retMode, setRetMode] = useState("GOVERNANCE");
  const [retDate, setRetDate] = useState("");
  const [bypass, setBypass] = useState(false);
  const [pubRead, setPubRead] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);

  useEffect(() => {
    const d = init.data; if (!d) return;
    setCls(d.head.StorageClass || "STANDARD");
    if (d.head.ServerSideEncryption) { setEnc({ type: d.head.ServerSideEncryption, kmsKey: d.head.SSEKMSKeyId || "", bucketKey: !!d.head.BucketKeyEnabled }); }
    setMeta(metaFromHead(d.head));
    setTags(single ? fromTagSet(d.tags) : []);
    setHold(d.hold);
    if (d.ret) { setRetOn(true); setRetMode(d.ret.Mode); setRetDate(String(d.ret.RetainUntilDate).slice(0, 10)); }
    if (d.acl) setPubRead((d.acl.Grants || []).some((g: any) => g.Grantee?.URI?.endsWith("AllUsers") && g.Permission === "READ"));
  }, [init.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const back = () => {
    if (single && backPrefix == null) nav(objectHref(bucket, keys[0], versionId).slice(1));
    else nav(bucketHref(bucket, "objects", backPrefix || "").slice(1));
  };

  // Copying an object onto itself rewrites it with new properties (what the console does too).
  const copyInPlace = async (key: string, extra: Record<string, unknown>) => {
    await s3("CopyObject", { Bucket: bucket, Key: key, CopySource: { Bucket: bucket, Key: key }, TaggingDirective: "COPY", ...extra });
  };

  const save = async () => {
    setBusy(true); setErr(null);
    const failures: string[] = [];
    for (const key of keys) {
      try {
        if (setting === "storage-class") await copyInPlace(key, { StorageClass: cls, MetadataDirective: "COPY" });
        else if (setting === "encryption") {
          const e: any = encMode === "default" ? {} : { ServerSideEncryption: enc.type, ...(enc.type !== "AES256" && enc.kmsKey ? { SSEKMSKeyId: enc.kmsKey } : {}), ...(enc.type === "aws:kms" ? { BucketKeyEnabled: enc.bucketKey } : {}) };
          const head = await s3("HeadObject", { Bucket: bucket, Key: key });
          await copyInPlace(key, { ...e, StorageClass: head.StorageClass || "STANDARD", MetadataDirective: "COPY" });
        } else if (setting === "metadata") {
          const head = await s3("HeadObject", { Bucket: bucket, Key: key });
          const p = metaToParams(meta);
          await copyInPlace(key, { MetadataDirective: "REPLACE", Metadata: {}, StorageClass: head.StorageClass || "STANDARD", ...p, ContentType: p.ContentType || head.ContentType });
        } else if (setting === "tags") {
          const ts = toTagSet(tags);
          if (ts.length) await s3("PutObjectTagging", { Bucket: bucket, Key: key, ...V, Tagging: { TagSet: ts } });
          else await s3("DeleteObjectTagging", { Bucket: bucket, Key: key, ...V });
        } else if (setting === "legal-hold") {
          await s3("PutObjectLegalHold", { Bucket: bucket, Key: key, ...V, LegalHold: { Status: hold ? "ON" : "OFF" } });
        } else if (setting === "retention") {
          await s3("PutObjectRetention", { Bucket: bucket, Key: key, ...V, BypassGovernanceRetention: bypass || undefined, Retention: retOn ? { Mode: retMode, RetainUntilDate: new Date(retDate + "T00:00:00Z").toISOString() } : {} });
        } else if (setting === "acl") {
          await s3("PutObjectAcl", { Bucket: bucket, Key: key, ...V, ACL: pubRead ? "public-read" : "private" });
        }
      } catch (e) { failures.push(`${key}: ${errText(e)}`); }
    }
    setBusy(false);
    if (failures.length) { setErr(new Error(failures.join("\n"))); return; }
    flash.notify({ type: "success", content: `Successfully edited ${title.replace(/^Edit /, "")} for ${keys.length} object${keys.length === 1 ? "" : "s"}.` });
    back();
  };

  const objectsTable = (
    <Table variant="embedded" header={<Header variant="h3" counter={`(${keys.length})`}>Specified objects</Header>} items={keys.map(k => ({ k }))}
      columnDefinitions={[{ id: "k", header: "Name", cell: x => x.k }]} />
  );
  const rewriteNote = <Alert type="info">This action creates a copy of the object with updated settings and a new last-modified date.{versionId ? "" : " In versioned buckets a new version is created."}</Alert>;

  let body: React.ReactNode = null;
  if (setting === "storage-class") body = <Container header={<Header variant="h2" description="Amazon S3 offers a range of storage classes designed for different use cases.">Storage class</Header>}><SpaceBetween size="m">{rewriteNote}<StorageClassPicker value={cls} onChange={setCls} /></SpaceBetween></Container>;
  if (setting === "encryption") body = (
    <Container header={<Header variant="h2" description="Server-side encryption protects data at rest.">Server-side encryption</Header>}>
      <SpaceBetween size="m">{rewriteNote}
        <RadioGroup value={encMode} onChange={e => setEncMode(e.detail.value)} items={[
          { value: "default", label: "Do not specify an encryption key", description: "The bucket settings for default encryption are used." },
          { value: "specify", label: "Specify an encryption key" },
        ]} />
        {encMode === "specify" && <EncryptionFields value={enc} onChange={setEnc} />}
      </SpaceBetween>
    </Container>
  );
  if (setting === "metadata") body = (
    <Container header={<Header variant="h2" description="Metadata is optional information provided as a name-value (key-value) pair.">Metadata</Header>}>
      <SpaceBetween size="m">{rewriteNote}{!single && <Alert type="warning">The metadata below replaces the existing metadata on every specified object.</Alert>}<MetadataEditor items={meta} onChange={setMeta} /></SpaceBetween>
    </Container>
  );
  if (setting === "tags") body = (
    <Container header={<Header variant="h2" description="You can use object tags to analyze, manage, and specify permissions for objects.">Tags</Header>}>
      <SpaceBetween size="m">{!single && <Alert type="warning">The tags below replace all existing tags on every specified object.</Alert>}<Tags tags={tags} onChange={setTags} limit={10} /></SpaceBetween>
    </Container>
  );
  if (setting === "legal-hold") body = (
    <Container header={<Header variant="h2" description="Place a legal hold on an object version to prevent it from being overwritten or deleted. A legal hold has no expiration date.">Object Lock legal hold</Header>}>
      <RadioGroup value={hold ? "on" : "off"} onChange={e => setHold(e.detail.value === "on")} items={[{ value: "off", label: "Disable" }, { value: "on", label: "Enable" }]} />
    </Container>
  );
  if (setting === "retention") body = (
    <Container header={<Header variant="h2" description="Protect this object version from being overwritten or deleted until a date.">Object Lock retention</Header>}>
      <SpaceBetween size="l">
        <RadioGroup value={retOn ? "on" : "off"} onChange={e => setRetOn(e.detail.value === "on")} items={[{ value: "off", label: "Disable" }, { value: "on", label: "Enable" }]} />
        {retOn && <>
          <FormField label="Retention mode">
            <RadioGroup value={retMode} onChange={e => setRetMode(e.detail.value)} items={[
              { value: "GOVERNANCE", label: "Governance mode", description: "Users with specific IAM permissions can overwrite or delete protected object versions during the retention period." },
              { value: "COMPLIANCE", label: "Compliance mode", description: "No users can overwrite or delete protected object versions during the retention period." },
            ]} />
          </FormField>
          <FormField label="Retain until date"><DatePicker value={retDate} onChange={e => setRetDate(e.detail.value)} placeholder="YYYY/MM/DD" isDateEnabled={d => d > new Date()} /></FormField>
        </>}
        <Checkbox checked={bypass} onChange={e => setBypass(e.detail.checked)}>Bypass governance retention (needed to shorten or remove Governance mode retention)</Checkbox>
      </SpaceBetween>
    </Container>
  );
  if (setting === "acl") body = (
    <Container header={<Header variant="h2" description="Grant basic read/write permissions to other AWS accounts.">Access control list (ACL)</Header>}>
      <SpaceBetween size="m">
        <Checkbox checked={pubRead} onChange={e => setPubRead(e.detail.checked)} description="Anyone in the world will be able to read this object.">Everyone (public access): Read</Checkbox>
        {pubRead && <Alert type="warning">Granting public read access makes this object public.</Alert>}
      </SpaceBetween>
    </Container>
  );

  return (
    <ContentLayout header={<Header variant="h1">{title}</Header>}>
      {init.loading && !init.data ? <Box textAlign="center" padding="xl"><Spinner size="large" /></Box> : init.error ? <ErrorAlert error={init.error} /> : (
        <form onSubmit={e => { e.preventDefault(); save(); }}>
          <Form errorText={err ? <ErrorAlert error={err} /> : undefined}
            actions={<SpaceBetween direction="horizontal" size="xs"><Button formAction="none" variant="link" onClick={back}>Cancel</Button><Button variant="primary" loading={busy}>Save changes</Button></SpaceBetween>}>
            <SpaceBetween size="l">{!single && objectsTable}{body || <Alert type="error">Unknown setting.</Alert>}</SpaceBetween>
          </Form>
        </form>
      )}
    </ContentLayout>
  );
}
