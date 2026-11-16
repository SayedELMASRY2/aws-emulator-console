// "Launch an instance" page; also "Create launch template" (mode="template").
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Grid from "@cloudscape-design/components/grid";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Select from "@cloudscape-design/components/select";
import Multiselect from "@cloudscape-design/components/multiselect";
import Tiles from "@cloudscape-design/components/tiles";
import RadioGroup from "@cloudscape-design/components/radio-group";
import Checkbox from "@cloudscape-design/components/checkbox";
import Textarea from "@cloudscape-design/components/textarea";
import Button from "@cloudscape-design/components/button";
import Box from "@cloudscape-design/components/box";
import Alert from "@cloudscape-design/components/alert";
import ExpandableSection from "@cloudscape-design/components/expandable-section";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import SegmentedControl from "@cloudscape-design/components/segmented-control";
import Toggle from "@cloudscape-design/components/toggle";
import Link from "@cloudscape-design/components/link";
import Spinner from "@cloudscape-design/components/spinner";
import { useCrumbs } from "../../App";
import { ErrorAlert, useAsync, useFlash, ValueWithLabel } from "../../common";
import { Tags } from "../s3/fields";
import { toTagSet, type KV } from "../s3/lib";
import { ec2, nameOf, useVpcs, useSubnets, useSgs, useKeyPairs, useProfiles, VOLUME_TYPES, instHref, allInstanceTypes } from "./lib";
import { ActionModal } from "./ResourcePage";
import { INSTANCE_TYPES } from "./InstanceActions";

type Vol = { device: string; size: string; type: string; iops: string; throughput: string; encrypted: boolean; del: boolean; root?: boolean; snapshot?: string };
const QUICK = [
  { id: "al", label: "Amazon Linux", re: /al2023|amzn2|amazon/i },
  { id: "ubuntu", label: "Ubuntu", re: /ubuntu/i },
  { id: "windows", label: "Windows", re: /windows/i },
  { id: "rhel", label: "Red Hat", re: /rhel|red ?hat/i },
  { id: "suse", label: "SUSE Linux", re: /suse|sles/i },
  { id: "debian", label: "Debian", re: /debian/i },
  { id: "macos", label: "macOS", re: /mac/i },
];
const SG_RULES = [{ id: "ssh", label: "Allow SSH traffic from", port: 22 }, { id: "https", label: "Allow HTTPS traffic from the internet", port: 443 }, { id: "http", label: "Allow HTTP traffic from the internet", port: 80 }];

export default function LaunchWizard({ mode }: { mode: "instance" | "template" }) {
  const isT = mode === "template";
  const nav = useNavigate();
  const flash = useFlash();
  const [sp] = useSearchParams();
  useCrumbs([{ text: "EC2", href: "#/ec2/dashboard" }, isT ? { text: "Launch templates", href: "#/ec2/launch-templates" } : { text: "Instances", href: "#/ec2/instances" }, { text: isT ? "Create launch template" : "Launch an instance", href: "#" }]);

  const [name, setName] = useState("");
  const [tags, setTags] = useState<KV[]>([]);
  const [tName, setTName] = useState("");
  const [tDesc, setTDesc] = useState("");
  const [quick, setQuick] = useState("al");
  const [amiOpt, setAmiOpt] = useState<any>(null);
  const [itype, setItype] = useState<any>({ value: "t3.micro", label: "t3.micro" });
  const [key, setKey] = useState<any>(null);
  const [newKey, setNewKey] = useState(false);
  const [vpc, setVpc] = useState<any>(null);
  const [subnet, setSubnet] = useState<any>(null);
  const [publicIp, setPublicIp] = useState(true);
  const [fwMode, setFwMode] = useState("create");
  const [sgName, setSgName] = useState(`launch-wizard-${Math.floor(Math.random() * 90 + 10)}`);
  const [sgRules, setSgRules] = useState<Record<string, boolean>>({ ssh: true, https: false, http: false });
  const [sshFrom, setSshFrom] = useState({ value: "0.0.0.0/0", label: "Anywhere 0.0.0.0/0" });
  const [sgSel, setSgSel] = useState<any[]>([]);
  const [vols, setVols] = useState<Vol[]>([{ device: "/dev/xvda", size: "8", type: "gp3", iops: "3000", throughput: "125", encrypted: false, del: true, root: true }]);
  const [profile, setProfile] = useState<any>(null);
  const [adv, setAdv] = useState({ shutdown: "stop", hibernate: false, termProt: false, stopProt: false, monitoring: false, credit: "unlimited", pg: "", ebsOpt: false, tenancy: "default", imds: "enabled", imdsv2: "required", hop: "2", tagsMd: "disabled", spot: false, userData: "" });
  const [count, setCount] = useState("1");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [launched, setLaunched] = useState<string[] | null>(null);

  const amis = useAsync(async () => ((await ec2("DescribeImages", { Owners: ["amazon", "self"], Filters: [{ Name: "state", Values: ["available"] }] })).Images || [])
    .sort((a: any, b: any) => String(b.CreationDate).localeCompare(String(a.CreationDate))), []);
  const types = useAsync(allInstanceTypes, []);
  const vpcs = useVpcs();
  const subnets = useSubnets(vpc?.value);
  const sgs = useSgs(vpc?.value);
  const keys = useKeyPairs();
  const profiles = useProfiles();
  const pgs = useAsync(async () => ((await ec2("DescribePlacementGroups")).PlacementGroups || []).map((g: any) => g.GroupName), []);

  useEffect(() => { if (vpcs.data && !vpc) setVpc(vpcs.data.find((v: any) => v.raw.IsDefault) || vpcs.data[0]); }, [vpcs.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const quickAmis = useMemo(() => (amis.data || []).filter((a: any) => QUICK.find(q => q.id === quick)!.re.test(`${a.Name} ${a.Description || ""} ${a.PlatformDetails || ""}`)), [amis.data, quick]);
  const amiOptions: any[] = (amis.data || []).map((a: any) => ({ value: a.ImageId, label: a.Name || a.ImageId, description: `${a.ImageId} · ${a.Architecture} · ${a.PlatformDetails || ""}${a.ImageOwnerAlias ? "" : " · owned by me"}`, raw: a }));
  useEffect(() => { if (!sp.get("ami") && !sp.get("from") && !sp.get("template") && quickAmis.length) setAmiOpt(amiOptions.find(o => o.value === quickAmis[0].ImageId)); }, [quickAmis]); // eslint-disable-line react-hooks/exhaustive-deps
  const ami = amiOpt?.raw;

  // Prefill: ?ami=  ?from=<instance-id>  ?template=<lt-id>
  useEffect(() => {
    if (!amis.data) return;
    const pick = (id?: string) => { const o = amiOptions.find(x => x.value === id); if (o) setAmiOpt(o); };
    if (sp.get("ami")) pick(sp.get("ami")!);
    (async () => {
      try {
        if (sp.get("from")) {
          const i = (await ec2("DescribeInstances", { InstanceIds: [sp.get("from")] })).Reservations[0].Instances[0];
          pick(i.ImageId); setItype({ value: i.InstanceType, label: i.InstanceType });
          if (i.KeyName) setKey({ value: i.KeyName, label: i.KeyName });
          setName(nameOf(i)); setFwMode("select"); setSgSel((i.SecurityGroups || []).map((g: any) => ({ value: g.GroupId, label: g.GroupName })));
        }
        if (sp.get("template")) {
          const v = (await ec2("DescribeLaunchTemplateVersions", { LaunchTemplateId: sp.get("template"), Versions: [sp.get("version") || "$Latest"] })).LaunchTemplateVersions[0].LaunchTemplateData;
          if (v.ImageId) pick(v.ImageId);
          if (v.InstanceType) setItype({ value: v.InstanceType, label: v.InstanceType });
          if (v.KeyName) setKey({ value: v.KeyName, label: v.KeyName });
          if (v.SecurityGroupIds?.length) { setFwMode("select"); setSgSel(v.SecurityGroupIds.map((g: string) => ({ value: g, label: g }))); }
        }
      } catch (e) { flash.error(e, "Couldn't prefill the form"); }
    })();
  }, [amis.data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (ami?.RootDeviceName) setVols(v => v.map(x => x.root ? { ...x, device: ami.RootDeviceName, size: String(ami.BlockDeviceMappings?.find((b: any) => b.DeviceName === ami.RootDeviceName)?.Ebs?.VolumeSize || x.size) } : x)); }, [ami?.ImageId]); // eslint-disable-line react-hooks/exhaustive-deps

  const typeInfo = (types.data || []).find(t => t.InstanceType === itype?.value);
  const typeOpts = (types.data?.length ? types.data.map(t => t.InstanceType) : INSTANCE_TYPES).map((t: string) => {
    const x = (types.data || []).find(y => y.InstanceType === t);
    return { value: t, label: t, description: x ? `${x.VCpuInfo?.DefaultVCpus} vCPU · ${((x.MemoryInfo?.SizeInMiB || 0) / 1024).toFixed(x.MemoryInfo?.SizeInMiB < 1024 ? 1 : 0)} GiB Memory · ${(x.ProcessorInfo?.SupportedArchitectures || []).join(", ")}` : undefined };
  });

  const build = async () => {
    let sgIds = sgSel.map(s => s.value);
    if (fwMode === "create" && !isT) {
      const g = await ec2("CreateSecurityGroup", { GroupName: sgName, Description: `${sgName} created ${new Date().toISOString()}`, VpcId: vpc?.value });
      const perms = SG_RULES.filter(r => sgRules[r.id]).map(r => ({ IpProtocol: "tcp", FromPort: r.port, ToPort: r.port, IpRanges: [{ CidrIp: r.id === "ssh" ? sshFrom.value : "0.0.0.0/0" }] }));
      if (perms.length) await ec2("AuthorizeSecurityGroupIngress", { GroupId: g.GroupId, IpPermissions: perms });
      sgIds = [g.GroupId];
    }
    const bdm = vols.map(v => ({ DeviceName: v.device, Ebs: { VolumeSize: Number(v.size), VolumeType: v.type, DeleteOnTermination: v.del, Encrypted: v.encrypted || undefined,
      ...(["gp3", "io1", "io2"].includes(v.type) && v.iops ? { Iops: Number(v.iops) } : {}), ...(v.type === "gp3" && v.throughput ? { Throughput: Number(v.throughput) } : {}), ...(v.snapshot ? { SnapshotId: v.snapshot } : {}) } }));
    const allTags = [...(name ? [{ Key: "Name", Value: name }] : []), ...toTagSet(tags)];
    const d: any = {
      ImageId: ami?.ImageId, InstanceType: itype?.value, BlockDeviceMappings: bdm,
      ...(key ? { KeyName: key.value } : {}),
      ...(profile ? { IamInstanceProfile: { Arn: profile.value } } : {}),
      InstanceInitiatedShutdownBehavior: adv.shutdown, DisableApiTermination: adv.termProt, DisableApiStop: adv.stopProt,
      Monitoring: { Enabled: adv.monitoring }, EbsOptimized: adv.ebsOpt || undefined,
      MetadataOptions: { HttpEndpoint: adv.imds, HttpTokens: adv.imdsv2, HttpPutResponseHopLimit: Number(adv.hop), InstanceMetadataTags: adv.tagsMd },
      ...(/^t\d/.test(itype?.value || "") ? { CreditSpecification: { CpuCredits: adv.credit } } : {}),
      ...(adv.pg || adv.tenancy !== "default" ? { Placement: { ...(adv.pg ? { GroupName: adv.pg } : {}), Tenancy: adv.tenancy } } : {}),
      ...(adv.hibernate ? { HibernationOptions: { Configured: true } } : {}),
      ...(adv.spot ? { InstanceMarketOptions: { MarketType: "spot" } } : {}),
    };
    // RunInstances: boto3 base64-encodes UserData itself. Launch templates need it pre-encoded.
    if (adv.userData) d.UserData = isT ? btoa(unescape(encodeURIComponent(adv.userData))) : adv.userData;
    return { d, sgIds, allTags };
  };

  const submit = async () => {
    setErr(null);
    if (isT && !/^[a-zA-Z0-9().\-/_]{3,128}$/.test(tName)) { setErr(new Error("Launch template name must be 3–128 characters: letters, numbers, ( ) . - / _")); return; }
    if (!isT && !ami) { setErr(new Error("Choose an AMI.")); return; }
    setBusy(true);
    try {
      const { d, sgIds, allTags } = await build();
      if (isT) {
        const data: any = { ...d };
        if (!data.ImageId) delete data.ImageId;
        if (sgIds.length) data.SecurityGroupIds = sgIds;
        if (allTags.length) data.TagSpecifications = [{ ResourceType: "instance", Tags: allTags }];
        if (data.UserData === undefined) delete data.UserData;
        const r = await ec2("CreateLaunchTemplate", { LaunchTemplateName: tName, VersionDescription: tDesc || undefined, LaunchTemplateData: data });
        flash.notify({ type: "success", content: `Successfully created ${tName} (${r.LaunchTemplate.LaunchTemplateId}).` });
        nav("/ec2/launch-templates");
      } else {
        const ni = subnet || !publicIp ? [{ DeviceIndex: 0, AssociatePublicIpAddress: publicIp, ...(subnet ? { SubnetId: subnet.value } : {}), Groups: sgIds }] : undefined;
        const p: any = { ...d, MinCount: Number(count), MaxCount: Number(count) };
        if (ni) p.NetworkInterfaces = ni; else if (sgIds.length) p.SecurityGroupIds = sgIds;
        if (allTags.length) p.TagSpecifications = [{ ResourceType: "instance", Tags: allTags }, { ResourceType: "volume", Tags: allTags }];
        const r = await ec2("RunInstances", p);
        setLaunched(r.Instances.map((i: any) => i.InstanceId));
      }
    } catch (e) { setErr(e); window.scrollTo(0, 0); } finally { setBusy(false); }
  };

  if (launched) return (
    <ContentLayout header={<Header variant="h1">Launch an instance</Header>}>
      <SpaceBetween size="l">
        <Alert type="success" header="Success">Successfully initiated launch of instance{launched.length > 1 ? "s" : ""} ({launched.map((id, k) => <span key={id}>{k ? ", " : ""}<Link href={instHref(id)}>{id}</Link></span>)})</Alert>
        <SpaceBetween direction="horizontal" size="xs"><Button variant="primary" href="#/ec2/instances">View all instances</Button><Button onClick={() => { setLaunched(null); }}>Launch more instances</Button></SpaceBetween>
      </SpaceBetween>
    </ContentLayout>
  );

  const setVol = (i: number, p: Partial<Vol>) => setVols(vols.map((v, j) => j === i ? { ...v, ...p } : v));
  const A = (k: keyof typeof adv, v: any) => setAdv({ ...adv, [k]: v });

  const left = (
    <SpaceBetween size="l">
      {isT && (
        <Container header={<Header variant="h2">Launch template name and description</Header>}>
          <SpaceBetween size="m">
            <FormField label="Launch template name - required" constraintText="Must be unique to this account. Max 128 chars. No spaces or special characters like '&', '*', '@'."><Input value={tName} onChange={e => setTName(e.detail.value)} placeholder="MyTemplate" /></FormField>
            <FormField label="Template version description"><Input value={tDesc} onChange={e => setTDesc(e.detail.value)} placeholder="A prod webserver for MyApp" /></FormField>
          </SpaceBetween>
        </Container>
      )}
      <Container header={<Header variant="h2" info={<Link variant="info">Info</Link>}>{isT ? "Resource tags" : "Name and tags"}</Header>}>
        <SpaceBetween size="m">
          <FormField label="Name"><Input value={name} onChange={e => setName(e.detail.value)} placeholder="e.g. My Web Server" /></FormField>
          <ExpandableSection headerText="Add additional tags"><Tags tags={tags} onChange={setTags} /></ExpandableSection>
        </SpaceBetween>
      </Container>

      <Container header={<Header variant="h2" description="An AMI contains the operating system, application server, and applications for your instance.">Application and OS Images (Amazon Machine Image)</Header>}>
        <SpaceBetween size="m">
          <SegmentedControl selectedId={quick} onChange={e => setQuick(e.detail.selectedId)} options={QUICK.map(q => ({ id: q.id, text: q.label, disabled: !(amis.data || []).some((a: any) => q.re.test(`${a.Name} ${a.Description || ""} ${a.PlatformDetails || ""}`)) }))} />
          <FormField label="Amazon Machine Image (AMI)" description={`${amis.data?.length || 0} images available in the emulator.`}>
            <Select selectedOption={amiOpt} placeholder="Choose an AMI" filteringType="auto" options={quickAmis.length ? [{ label: QUICK.find(q => q.id === quick)!.label, options: amiOptions.filter(o => quickAmis.some((q: any) => q.ImageId === o.value)) }, { label: "All images", options: amiOptions }] : amiOptions}
              statusType={amis.loading ? "loading" : "finished"} onChange={e => setAmiOpt(e.detail.selectedOption)} />
          </FormField>
          {ami && <ColumnLayout columns={3} variant="text-grid">
            <ValueWithLabel label="Description">{ami.Description || ami.Name}</ValueWithLabel>
            <ValueWithLabel label="Architecture">{ami.Architecture}</ValueWithLabel>
            <ValueWithLabel label="AMI ID">{ami.ImageId}</ValueWithLabel>
            <ValueWithLabel label="Platform">{ami.PlatformDetails || "Linux/UNIX"}</ValueWithLabel>
            <ValueWithLabel label="Root device type">{ami.RootDeviceType}</ValueWithLabel>
            <ValueWithLabel label="Owner">{ami.ImageOwnerAlias || ami.OwnerId}</ValueWithLabel>
          </ColumnLayout>}
        </SpaceBetween>
      </Container>

      <Container header={<Header variant="h2">Instance type</Header>}>
        <FormField label="Instance type">
          <Select selectedOption={typeOpts.find(o => o.value === itype?.value) || itype} filteringType="auto" options={typeOpts} statusType={types.loading ? "loading" : "finished"} onChange={e => setItype(e.detail.selectedOption)} />
        </FormField>
        {typeInfo && <Box variant="small" color="text-body-secondary" margin={{ top: "xs" }}>
          Family: {typeInfo.InstanceType.split(".")[0]} · {typeInfo.VCpuInfo?.DefaultVCpus} vCPU · {((typeInfo.MemoryInfo?.SizeInMiB || 0) / 1024).toFixed(1)} GiB Memory · Network: {typeInfo.NetworkInfo?.NetworkPerformance || "-"} · Free tier eligible: {typeInfo.FreeTierEligible ? "Yes" : "No"}
        </Box>}
      </Container>

      <Container header={<Header variant="h2" description="You can use a key pair to securely connect to your instance. Ensure that you have access to the selected key pair before you launch the instance.">Key pair (login)</Header>}>
        <FormField label="Key pair name">
          <SpaceBetween direction="horizontal" size="xs">
            <div style={{ minWidth: 300 }}><Select selectedOption={key} placeholder={isT ? "Don't include in launch template" : "Proceed without a key pair (Not recommended)"} options={[{ value: "", label: "Proceed without a key pair (Not recommended)" }, ...(keys.data || [])]}
              statusType={keys.loading ? "loading" : "finished"} onChange={e => setKey(e.detail.selectedOption.value ? e.detail.selectedOption : null)} /></div>
            <Button iconName="add-plus" onClick={() => setNewKey(true)}>Create new key pair</Button>
          </SpaceBetween>
        </FormField>
      </Container>

      <Container header={<Header variant="h2">Network settings</Header>}>
        <SpaceBetween size="l">
          <ColumnLayout columns={2}>
            <FormField label="VPC"><Select selectedOption={vpc} options={vpcs.data || []} statusType={vpcs.loading ? "loading" : "finished"} onChange={e => { setVpc(e.detail.selectedOption); setSubnet(null); setSgSel([]); }} /></FormField>
            <FormField label="Subnet"><Select selectedOption={subnet} placeholder="No preference (Default subnet in any availability zone)" options={[{ value: "", label: "No preference" }, ...(subnets.data || [])]}
              onChange={e => setSubnet(e.detail.selectedOption.value ? e.detail.selectedOption : null)} /></FormField>
          </ColumnLayout>
          {!isT && <FormField label="Auto-assign public IP"><Toggle checked={publicIp} onChange={e => setPublicIp(e.detail.checked)}>{publicIp ? "Enable" : "Disable"}</Toggle></FormField>}
          <FormField label="Firewall (security groups)" description="A security group is a set of firewall rules that control the traffic for your instance.">
            <Tiles value={fwMode} onChange={e => setFwMode(e.detail.value)} items={[{ value: "create", label: "Create security group", disabled: isT }, { value: "select", label: "Select existing security group" }]} />
          </FormField>
          {fwMode === "create" && !isT ? (
            <SpaceBetween size="s">
              <FormField label="Security group name"><Input value={sgName} onChange={e => setSgName(e.detail.value)} /></FormField>
              <Box>We'll create a new security group called <b>{sgName}</b> with the following rules:</Box>
              {SG_RULES.map(r => (
                <SpaceBetween key={r.id} direction="horizontal" size="s" alignItems="center">
                  <Checkbox checked={sgRules[r.id]} onChange={e => setSgRules({ ...sgRules, [r.id]: e.detail.checked })}>{r.label}</Checkbox>
                  {r.id === "ssh" && sgRules.ssh && <Select selectedOption={sshFrom} options={[{ value: "0.0.0.0/0", label: "Anywhere 0.0.0.0/0" }, { value: "10.0.0.0/8", label: "Private 10.0.0.0/8" }, { value: "127.0.0.1/32", label: "My IP (127.0.0.1/32)" }]} onChange={e => setSshFrom(e.detail.selectedOption as any)} />}
                </SpaceBetween>
              ))}
              {sgRules.ssh && sshFrom.value === "0.0.0.0/0" && <Alert type="warning">Rules with source of 0.0.0.0/0 allow all IP addresses to access your instance. We recommend setting security group rules to allow access from known IP addresses only.</Alert>}
            </SpaceBetween>
          ) : (
            <FormField label="Common security groups"><Multiselect selectedOptions={sgSel} options={sgs.data || []} filteringType="auto" placeholder="Select security groups" onChange={e => setSgSel(e.detail.selectedOptions as any)} /></FormField>
          )}
        </SpaceBetween>
      </Container>

      <Container header={<Header variant="h2" actions={<Button onClick={() => setVols([...vols, { device: `/dev/sd${String.fromCharCode(102 + vols.length - 1)}`, size: "8", type: "gp3", iops: "3000", throughput: "125", encrypted: false, del: true }])}>Add new volume</Button>}>Configure storage</Header>}>
        <SpaceBetween size="m">
          {!isT && <Alert type="info">In testing, the emulator created only the root volume, sized from the AMI, and ignored extra volumes in the launch request. Create and attach extra volumes from Volumes after launch.</Alert>}
          {vols.map((v, i) => (
            <SpaceBetween key={i} direction="horizontal" size="xs" alignItems="end">
              <FormField label={i === 0 ? "Volume" : " "}><Box padding={{ top: "xs" }}>{v.root ? "Root" : `EBS ${i}`} · {v.device}</Box></FormField>
              <FormField label="Size (GiB)"><Input type="number" value={v.size} onChange={e => setVol(i, { size: e.detail.value })} /></FormField>
              <FormField label="Volume type"><Select selectedOption={VOLUME_TYPES.find(t => t.value === v.type)!} options={VOLUME_TYPES} onChange={e => setVol(i, { type: e.detail.selectedOption.value! })} /></FormField>
              {["gp3", "io1", "io2"].includes(v.type) && <FormField label="IOPS"><Input type="number" value={v.iops} onChange={e => setVol(i, { iops: e.detail.value })} /></FormField>}
              {v.type === "gp3" && <FormField label="Throughput (MiB/s)"><Input type="number" value={v.throughput} onChange={e => setVol(i, { throughput: e.detail.value })} /></FormField>}
              <Checkbox checked={v.encrypted} onChange={e => setVol(i, { encrypted: e.detail.checked })}>Encrypted</Checkbox>
              <Checkbox checked={v.del} onChange={e => setVol(i, { del: e.detail.checked })}>Delete on termination</Checkbox>
              {!v.root && <Button variant="icon" iconName="remove" ariaLabel="Remove volume" onClick={() => setVols(vols.filter((_, j) => j !== i))} />}
            </SpaceBetween>
          ))}
        </SpaceBetween>
      </Container>

      <ExpandableSection variant="container" headerText="Advanced details">
        <SpaceBetween size="l">
          <FormField label="Purchasing option"><Checkbox checked={adv.spot} onChange={e => A("spot", e.detail.checked)}>Spot instances</Checkbox></FormField>
          <FormField label="IAM instance profile"><Select selectedOption={profile} placeholder="Select" options={[{ value: "", label: "None" }, ...(profiles.data || [])]} onChange={e => setProfile(e.detail.selectedOption.value ? e.detail.selectedOption : null)} /></FormField>
          <ColumnLayout columns={2}>
            <FormField label="Shutdown behavior"><Select selectedOption={{ value: adv.shutdown, label: adv.shutdown === "stop" ? "Stop" : "Terminate" }} options={[{ value: "stop", label: "Stop" }, { value: "terminate", label: "Terminate" }]} onChange={e => A("shutdown", e.detail.selectedOption.value)} /></FormField>
            <FormField label="Credit specification"><Select selectedOption={{ value: adv.credit, label: adv.credit === "unlimited" ? "Unlimited" : "Standard" }} options={[{ value: "unlimited", label: "Unlimited" }, { value: "standard", label: "Standard" }]} onChange={e => A("credit", e.detail.selectedOption.value)} /></FormField>
            <FormField label="Placement group"><Select selectedOption={{ value: adv.pg, label: adv.pg || "Select" }} options={[{ value: "", label: "None" }, ...((pgs.data || []) as string[]).map(g => ({ value: g, label: g }))]} onChange={e => A("pg", e.detail.selectedOption.value)} /></FormField>
            <FormField label="Tenancy"><Select selectedOption={{ value: adv.tenancy, label: adv.tenancy }} options={["default", "dedicated", "host"].map(t => ({ value: t, label: t }))} onChange={e => A("tenancy", e.detail.selectedOption.value)} /></FormField>
            <FormField label="Metadata accessible"><Select selectedOption={{ value: adv.imds, label: adv.imds === "enabled" ? "Enabled" : "Disabled" }} options={[{ value: "enabled", label: "Enabled" }, { value: "disabled", label: "Disabled" }]} onChange={e => A("imds", e.detail.selectedOption.value)} /></FormField>
            <FormField label="Metadata version"><Select selectedOption={{ value: adv.imdsv2, label: adv.imdsv2 === "required" ? "V2 only (token required)" : "V1 and V2 (token optional)" }} options={[{ value: "required", label: "V2 only (token required)" }, { value: "optional", label: "V1 and V2 (token optional)" }]} onChange={e => A("imdsv2", e.detail.selectedOption.value)} /></FormField>
            <FormField label="Metadata response hop limit"><Input type="number" value={adv.hop} onChange={e => A("hop", e.detail.value)} /></FormField>
            <FormField label="Allow tags in metadata"><Select selectedOption={{ value: adv.tagsMd, label: adv.tagsMd === "enabled" ? "Enable" : "Disable" }} options={[{ value: "enabled", label: "Enable" }, { value: "disabled", label: "Disable" }]} onChange={e => A("tagsMd", e.detail.selectedOption.value)} /></FormField>
          </ColumnLayout>
          <SpaceBetween size="xs">
            <Checkbox checked={adv.hibernate} onChange={e => A("hibernate", e.detail.checked)}>Stop - Hibernate behavior</Checkbox>
            <Checkbox checked={adv.termProt} onChange={e => A("termProt", e.detail.checked)}>Termination protection</Checkbox>
            <Checkbox checked={adv.stopProt} onChange={e => A("stopProt", e.detail.checked)}>Stop protection</Checkbox>
            <Checkbox checked={adv.monitoring} onChange={e => A("monitoring", e.detail.checked)}>Detailed CloudWatch monitoring</Checkbox>
            <Checkbox checked={adv.ebsOpt} onChange={e => A("ebsOpt", e.detail.checked)}>EBS-optimized instance</Checkbox>
          </SpaceBetween>
          <FormField label="User data - optional" description="Enter user data in the field. It runs when the instance launches."><Textarea rows={6} value={adv.userData} onChange={e => A("userData", e.detail.value)} placeholder={"#!/bin/bash\nyum update -y"} spellcheck={false} /></FormField>
        </SpaceBetween>
      </ExpandableSection>
    </SpaceBetween>
  );

  const summary = (
    <div style={{ position: "sticky", top: 70 }}>
      <Container header={<Header variant="h2">Summary</Header>}>
        <SpaceBetween size="m">
          {!isT && <FormField label="Number of instances"><Input type="number" value={count} onChange={e => setCount(e.detail.value)} /></FormField>}
          <ValueWithLabel label="Software Image (AMI)">{ami ? <>{ami.Name}<Box variant="small" color="text-body-secondary" display="block">{ami.ImageId}</Box></> : "-"}</ValueWithLabel>
          <ValueWithLabel label="Virtual server type (instance type)">{itype?.value}</ValueWithLabel>
          <ValueWithLabel label="Firewall (security group)">{fwMode === "create" && !isT ? `New security group (${sgName})` : sgSel.map(s => s.label).join(", ") || "-"}</ValueWithLabel>
          <ValueWithLabel label="Storage (volumes)">{vols.length} volume(s) - {vols.reduce((a, v) => a + Number(v.size || 0), 0)} GiB</ValueWithLabel>
          {err ? <ErrorAlert error={err} /> : null}
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={() => nav(-1)}>Cancel</Button>
            <Button variant="primary" loading={busy} onClick={submit}>{isT ? "Create launch template" : "Launch instance"}</Button>
          </SpaceBetween>
        </SpaceBetween>
      </Container>
    </div>
  );

  return (
    <ContentLayout header={<Header variant="h1" description={isT ? "Creating a launch template allows you to create a saved instance configuration that can be reused, shared and launched at a later time." : "Amazon EC2 allows you to create virtual machines, or instances, that run on the AWS Cloud. Quickly get started by following the simple steps below."}>{isT ? "Create launch template" : "Launch an instance"}</Header>}>
      {amis.loading && !amis.data ? <Spinner size="large" /> : (
        <Grid gridDefinition={[{ colspan: { default: 12, m: 8 } }, { colspan: { default: 12, m: 4 } }]}>{left}{summary}</Grid>
      )}
      {newKey && <NewKeyModal close={() => setNewKey(false)} onCreated={k => { keys.reload(); setKey({ value: k, label: k }); }} />}
    </ContentLayout>
  );
}

export function NewKeyModal({ close, onCreated }: { close: () => void; onCreated: (name: string) => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("rsa");
  const [fmt, setFmt] = useState("pem");
  return (
    <ActionModal visible onDismiss={close} header="Create key pair" ok="Create key pair" disabled={!name} onOk={async () => {
      const r = await ec2("CreateKeyPair", { KeyName: name, KeyType: type, KeyFormat: fmt });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([r.KeyMaterial], { type: "application/x-pem-file" }));
      a.download = `${name}.${fmt}`; a.click(); URL.revokeObjectURL(a.href);
      onCreated(name);
    }}>
      <FormField label="Key pair name" constraintText="The name can include up to 255 ASCII characters. It can't include leading or trailing spaces."><Input value={name} onChange={e => setName(e.detail.value)} placeholder="Enter key pair name" /></FormField>
      <FormField label="Key pair type"><RadioGroup value={type} onChange={e => setType(e.detail.value)} items={[{ value: "rsa", label: "RSA", description: "RSA encrypted private and public key pair" }, { value: "ed25519", label: "ED25519", description: "ED25519 encrypted private and public key pair" }]} /></FormField>
      <FormField label="Private key file format"><RadioGroup value={fmt} onChange={e => setFmt(e.detail.value)} items={[{ value: "pem", label: ".pem", description: "For use with OpenSSH" }, { value: "ppk", label: ".ppk", description: "For use with PuTTY" }]} /></FormField>
      <Alert type="info">When prompted, store the private key in a secure and accessible location on your computer. You will need it later to connect to your instance.</Alert>
    </ActionModal>
  );
}
