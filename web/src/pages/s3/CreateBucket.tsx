import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Form from "@cloudscape-design/components/form";
import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Button from "@cloudscape-design/components/button";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Tiles from "@cloudscape-design/components/tiles";
import RadioGroup from "@cloudscape-design/components/radio-group";
import Select from "@cloudscape-design/components/select";
import Checkbox from "@cloudscape-design/components/checkbox";
import ExpandableSection from "@cloudscape-design/components/expandable-section";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import ContentLayout from "@cloudscape-design/components/content-layout";
import { useCrumbs } from "../../App";
import { ErrorAlert, useAsync, useFlash } from "../../common";
import { isNotConfigured } from "../../api";
import { s3, getOr, bucketHref, toTagSet, fromTagSet, type KV } from "./lib";
import { BlockPublicAccessFields, BPA_ALL, EncryptionFields, ENC_DEFAULT, encToConfig, encFromConfig, Tags, type BPA, type Enc } from "./fields";

export function bucketNameError(n: string): string | undefined {
  if (!n) return undefined;
  if (n.length < 3 || n.length > 63) return "Bucket name must be between 3 and 63 characters long.";
  if (!/^[a-z0-9.-]+$/.test(n)) return "Bucket name can contain only lowercase letters, numbers, dots (.), and hyphens (-).";
  if (!/^[a-z0-9]/.test(n) || !/[a-z0-9]$/.test(n)) return "Bucket name must begin and end with a letter or number.";
  if (n.includes("..")) return "Bucket name must not contain two adjacent periods.";
  if (/^\d+\.\d+\.\d+\.\d+$/.test(n)) return "Bucket name must not be formatted as an IP address.";
  if (/^(xn--|sthree-|amzn-s3-demo-)/.test(n)) return "Bucket name must not start with a reserved prefix (xn--, sthree-, amzn-s3-demo-).";
  if (/(-s3alias|--ol-s3|\.mrap|--x-s3|--table-s3)$/.test(n)) return "Bucket name must not end with a reserved suffix.";
  return undefined;
}

const AZS = [
  { value: "use1-az4", label: "use1-az4 (us-east-1a)" }, { value: "use1-az5", label: "use1-az5 (us-east-1b)" }, { value: "use1-az6", label: "use1-az6 (us-east-1c)" },
];

export default function CreateBucket() {
  const nav = useNavigate();
  const flash = useFlash();
  const [sp] = useSearchParams();
  useCrumbs([{ text: "Amazon S3", href: "#/s3/buckets" }, { text: "Buckets", href: "#/s3/buckets" }, { text: "Create bucket", href: "#" }]);

  const [type, setType] = useState(sp.get("type") === "directory" ? "directory" : "general");
  const [name, setName] = useState("");
  const [az, setAz] = useState(AZS[0]);
  const [acls, setAcls] = useState<"disabled" | "enabled">("disabled");
  const [ownership, setOwnership] = useState<"BucketOwnerPreferred" | "ObjectWriter">("BucketOwnerPreferred");
  const [bpa, setBpa] = useState<BPA>(BPA_ALL);
  const [ack, setAck] = useState(false);
  const [versioning, setVersioning] = useState(false);
  const [tags, setTags] = useState<KV[]>([]);
  const [enc, setEnc] = useState<Enc>(ENC_DEFAULT);
  const [lock, setLock] = useState(false);
  const [lockAck, setLockAck] = useState(false);
  const [copyFrom, setCopyFrom] = useState<{ value: string; label: string } | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const buckets = useAsync(async () => ((await s3("ListBuckets")).Buckets || []).map((b: any) => ({ value: b.Name, label: b.Name })), []);

  const fullName = type === "directory" ? `${name}--${az.value}--x-s3` : name;
  const nameErr = submitted && !name ? "Bucket name is required." : bucketNameError(name);
  const bpaOff = !Object.values(bpa).every(Boolean);

  const copySettings = async (src: string) => {
    try {
      const [v, own, pab, t, e, lk] = await Promise.all([
        getOr("GetBucketVersioning", { Bucket: src }, {}),
        getOr("GetBucketOwnershipControls", { Bucket: src }, null),
        getOr("GetPublicAccessBlock", { Bucket: src }, null),
        getOr("GetBucketTagging", { Bucket: src }, { TagSet: [] }),
        getOr("GetBucketEncryption", { Bucket: src }, null),
        getOr("GetObjectLockConfiguration", { Bucket: src }, null),
      ]);
      setVersioning(v.Status === "Enabled");
      const o = own?.OwnershipControls?.Rules?.[0]?.ObjectOwnership;
      if (o === "BucketOwnerEnforced" || !o) setAcls("disabled"); else { setAcls("enabled"); setOwnership(o); }
      if (pab?.PublicAccessBlockConfiguration) setBpa(pab.PublicAccessBlockConfiguration);
      setTags(fromTagSet(t.TagSet).map(x => ({ ...x, existing: false })));
      if (e) setEnc(encFromConfig(e));
      setLock(lk?.ObjectLockConfiguration?.ObjectLockEnabled === "Enabled");
      flash.notify({ type: "info", content: `Copied settings from "${src}". Bucket policy, lifecycle and other configurations aren't copied.` });
    } catch (e) { flash.error(e, "Couldn't copy settings"); }
  };

  const submit = async () => {
    setSubmitted(true);
    if (!name || bucketNameError(name)) return;
    if (bpaOff && !ack) return;
    if (lock && !lockAck) return;
    setBusy(true); setErr(null);
    try {
      if (type === "directory") {
        await s3("CreateBucket", { Bucket: fullName, CreateBucketConfiguration: { Location: { Type: "AvailabilityZone", Name: az.value }, Bucket: { DataRedundancy: "SingleAvailabilityZone", Type: "Directory" } } });
      } else {
        await s3("CreateBucket", { Bucket: name, ObjectOwnership: acls === "disabled" ? "BucketOwnerEnforced" : ownership, ObjectLockEnabledForBucket: lock || undefined });
        await s3("PutPublicAccessBlock", { Bucket: name, PublicAccessBlockConfiguration: bpa });
        if (versioning || lock) await s3("PutBucketVersioning", { Bucket: name, VersioningConfiguration: { Status: "Enabled" } });
        const ts = toTagSet(tags);
        if (ts.length) await s3("PutBucketTagging", { Bucket: name, Tagging: { TagSet: ts } });
        await s3("PutBucketEncryption", { Bucket: name, ServerSideEncryptionConfiguration: encToConfig(enc) });
      }
      flash.notify({ type: "success", content: <>Successfully created bucket "{fullName}". To upload files and folders, or to configure additional bucket settings, choose <a href={bucketHref(fullName)}>View details</a>.</> });
      nav(type === "directory" ? "/s3/directory-buckets" : "/s3/buckets");
    } catch (e) {
      setErr(e);
      if (!isNotConfigured(e)) window.scrollTo(0, 0);
    } finally { setBusy(false); }
  };

  return (
    <ContentLayout header={<Header variant="h1" description="Buckets are containers for data stored in S3.">Create bucket</Header>}>
      <form onSubmit={e => { e.preventDefault(); submit(); }}>
        <Form
          errorText={err ? <ErrorAlert error={err} /> : undefined}
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button formAction="none" variant="link" onClick={() => nav(-1)}>Cancel</Button>
              <Button variant="primary" loading={busy}>Create bucket</Button>
            </SpaceBetween>
          }
        >
          <SpaceBetween size="l">
            <Container header={<Header variant="h2">General configuration</Header>}>
              <SpaceBetween size="l">
                <FormField label="AWS Region"><Box>US East (N. Virginia) us-east-1</Box></FormField>
                <FormField label="Bucket type">
                  <Tiles value={type} onChange={e => setType(e.detail.value)} items={[
                    { value: "general", label: "General purpose", description: "Recommended for most use cases and access patterns. General purpose buckets are the original S3 bucket type. They allow a mix of storage classes that redundantly store objects across multiple Availability Zones." },
                    { value: "directory", label: "Directory", description: "Recommended for low-latency use cases. These buckets use only the S3 Express One Zone storage class, which provides faster processing of data within a single Availability Zone." },
                  ]} />
                </FormField>
                {type === "directory" && (
                  <FormField label="Availability Zone" description="Choose the Availability Zone for your bucket. Only compute resources in the same zone get the lowest latency.">
                    <Select selectedOption={az} options={AZS} onChange={e => setAz(e.detail.selectedOption as any)} />
                  </FormField>
                )}
                <FormField label="Bucket name" errorText={nameErr}
                  constraintText={type === "directory"
                    ? <>Full name: <b>{fullName}</b>. Bucket names must be unique within the Availability Zone.</>
                    : "Bucket names must be 3 to 63 characters and unique within the global namespace. Bucket names must also begin and end with a letter or number. Valid characters are a-z, 0-9, periods (.), and hyphens (-)."}>
                  <Input value={name} onChange={e => setName(e.detail.value.trim())} placeholder="myawsbucket" ariaRequired />
                </FormField>
                {type === "general" && (
                  <FormField label={<>Copy settings from existing bucket - <i>optional</i></>} description="Only the bucket settings in the following configuration are copied.">
                    <Select selectedOption={copyFrom} placeholder="Choose bucket" options={buckets.data || []} statusType={buckets.loading ? "loading" : "finished"}
                      empty="No buckets" onChange={e => { setCopyFrom(e.detail.selectedOption as any); copySettings(e.detail.selectedOption.value!); }} />
                  </FormField>
                )}
              </SpaceBetween>
            </Container>

            {type === "general" && <>
              <Container header={<Header variant="h2" description="Control ownership of objects written to this bucket from other AWS accounts and the use of access control lists (ACLs). Object ownership determines who can specify access to objects.">Object Ownership</Header>}>
                <SpaceBetween size="l">
                  <Tiles value={acls} onChange={e => setAcls(e.detail.value as any)} items={[
                    { value: "disabled", label: "ACLs disabled (recommended)", description: "All objects in this bucket are owned by this account. Access to this bucket and its objects is specified using only policies." },
                    { value: "enabled", label: "ACLs enabled", description: "Objects in this bucket can be owned by other AWS accounts. Access to this bucket and its objects can be specified using ACLs." },
                  ]} />
                  {acls === "enabled" && (
                    <>
                      <Alert type="warning">We recommend disabling ACLs, unless you need to control access for each object individually or to have the object writer own the data they upload.</Alert>
                      <FormField label="Object Ownership">
                        <RadioGroup value={ownership} onChange={e => setOwnership(e.detail.value as any)} items={[
                          { value: "BucketOwnerPreferred", label: "Bucket owner preferred", description: "If new objects written to this bucket specify the bucket-owner-full-control canned ACL, they are owned by the bucket owner. Otherwise, they are owned by the object writer." },
                          { value: "ObjectWriter", label: "Object writer", description: "The object writer remains the object owner." },
                        ]} />
                      </FormField>
                    </>
                  )}
                </SpaceBetween>
              </Container>

              <Container header={<Header variant="h2" description="Public access is granted to buckets and objects through access control lists (ACLs), bucket policies, access point policies, or all. In order to ensure that public access to this bucket and its objects is blocked, turn on Block all public access. These settings apply only to this bucket and its access points.">Block Public Access settings for this bucket</Header>}>
                <SpaceBetween size="m">
                  <BlockPublicAccessFields value={bpa} onChange={setBpa} />
                  {bpaOff && (
                    <FormField errorText={submitted && !ack ? "You must acknowledge the current settings." : undefined}>
                      <Checkbox checked={ack} onChange={e => setAck(e.detail.checked)}>
                        I acknowledge that the current settings might result in this bucket and the objects within becoming public.
                      </Checkbox>
                    </FormField>
                  )}
                </SpaceBetween>
              </Container>

              <Container header={<Header variant="h2" description="Versioning is a means of keeping multiple variants of an object in the same bucket. You can use versioning to preserve, retrieve, and restore every version of every object stored in your Amazon S3 bucket. With versioning, you can easily recover from both unintended user actions and application failures.">Bucket Versioning</Header>}>
                <FormField label="Bucket Versioning">
                  <RadioGroup value={versioning || lock ? "on" : "off"} onChange={e => setVersioning(e.detail.value === "on")}
                    items={[{ value: "off", label: "Disable", disabled: lock }, { value: "on", label: "Enable" }]} />
                </FormField>
              </Container>

              <Container header={<Header variant="h2" description="You can use bucket tags to track storage costs and organize buckets.">Tags - <i>optional</i> ({toTagSet(tags).length})</Header>}>
                <Tags tags={tags} onChange={setTags} />
              </Container>

              <Container header={<Header variant="h2" description="Server-side encryption is automatically applied to new objects stored in this bucket.">Default encryption</Header>}>
                <EncryptionFields value={enc} onChange={setEnc} />
              </Container>

              <ExpandableSection variant="container" headerText="Advanced settings">
                <SpaceBetween size="m">
                  <FormField label="Object Lock" description="Store objects using a write-once-read-many (WORM) model to help you prevent objects from being deleted or overwritten for a fixed amount of time or indefinitely. Object Lock works only in versioned buckets.">
                    <RadioGroup value={lock ? "on" : "off"} onChange={e => setLock(e.detail.value === "on")} items={[
                      { value: "off", label: "Disable" },
                      { value: "on", label: "Enable", description: "Permanently allows objects in this bucket to be locked. Additional Object Lock configuration is required in bucket details after bucket creation to protect objects in this bucket from being deleted or overwritten." },
                    ]} />
                  </FormField>
                  {lock && (
                    <>
                      <Alert type="warning">Enabling Object Lock also enables Bucket Versioning, and Object Lock can't be disabled after the bucket is created.</Alert>
                      <FormField errorText={submitted && !lockAck ? "You must acknowledge the Object Lock settings." : undefined}>
                        <Checkbox checked={lockAck} onChange={e => setLockAck(e.detail.checked)}>I acknowledge that enabling Object Lock will permanently allow objects in this bucket to be locked.</Checkbox>
                      </FormField>
                    </>
                  )}
                </SpaceBetween>
              </ExpandableSection>
            </>}
            <Box color="text-body-secondary" variant="small">After creating the bucket, you can upload files and folders to the bucket, and configure additional bucket settings.</Box>
          </SpaceBetween>
        </Form>
      </form>
    </ContentLayout>
  );
}
