import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import SpaceBetween from "@cloudscape-design/components/space-between";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Tabs from "@cloudscape-design/components/tabs";
import Table from "@cloudscape-design/components/table";
import Button from "@cloudscape-design/components/button";
import ButtonDropdown from "@cloudscape-design/components/button-dropdown";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Select from "@cloudscape-design/components/select";
import Autosuggest from "@cloudscape-design/components/autosuggest";
import Box from "@cloudscape-design/components/box";
import Alert from "@cloudscape-design/components/alert";
import Link from "@cloudscape-design/components/link";
import Spinner from "@cloudscape-design/components/spinner";
import Form from "@cloudscape-design/components/form";
import { useCrumbs } from "../../App";
import { ErrorAlert, useAsync, useFlash, ValueWithLabel } from "../../common";
import { Tags } from "../s3/fields";
import { toTagSet, type KV } from "../s3/lib";
import { ec2, nameOf, sgHref, PROTOCOLS, ruleTypeOf, portRange, protoLabel, useVpcs, useSgs } from "./lib";
import { ResourcePage, ActionModal, useModal } from "./ResourcePage";
import { TagsModal } from "./InstanceActions";

type Rule = { id?: string; type: string; proto: string; from: string; to: string; srcType: string; src: string; desc: string };
const SRC_TYPES = [{ value: "custom", label: "Custom" }, { value: "anywhere4", label: "Anywhere-IPv4" }, { value: "anywhere6", label: "Anywhere-IPv6" }, { value: "myip", label: "My IP" }];

function ruleFromApi(r: any): Rule {
  const src = r.CidrIpv4 || r.CidrIpv6 || r.ReferencedGroupInfo?.GroupId || r.PrefixListId || "";
  const srcType = src === "0.0.0.0/0" ? "anywhere4" : src === "::/0" ? "anywhere6" : "custom";
  const p = { IpProtocol: r.IpProtocol, FromPort: r.FromPort, ToPort: r.ToPort };
  return { id: r.SecurityGroupRuleId, type: ruleTypeOf(p), proto: r.IpProtocol, from: String(r.FromPort ?? -1), to: String(r.ToPort ?? -1), srcType, src, desc: r.Description || "" };
}
function ruleToPerm(r: Rule) {
  const p: any = { IpProtocol: r.proto };
  if (!["-1"].includes(r.proto)) { p.FromPort = Number(r.from); p.ToPort = Number(r.to || r.from); }
  const src = r.srcType === "anywhere4" ? "0.0.0.0/0" : r.srcType === "anywhere6" ? "::/0" : r.srcType === "myip" ? "127.0.0.1/32" : r.src;
  const d = r.desc ? { Description: r.desc } : {};
  if (src.startsWith("sg-")) p.UserIdGroupPairs = [{ GroupId: src, ...d }];
  else if (src.startsWith("pl-")) p.PrefixListIds = [{ PrefixListId: src, ...d }];
  else if (src.includes(":")) p.Ipv6Ranges = [{ CidrIpv6: src, ...d }];
  else p.IpRanges = [{ CidrIp: src, ...d }];
  return p;
}
function ruleToSgRule(r: Rule) {
  const src = r.srcType === "anywhere4" ? "0.0.0.0/0" : r.srcType === "anywhere6" ? "::/0" : r.srcType === "myip" ? "127.0.0.1/32" : r.src;
  const out: any = { IpProtocol: r.proto, FromPort: r.proto === "-1" ? -1 : Number(r.from), ToPort: r.proto === "-1" ? -1 : Number(r.to || r.from), Description: r.desc || undefined };
  if (src.startsWith("sg-")) out.ReferencedGroupId = src; else if (src.startsWith("pl-")) out.PrefixListId = src; else if (src.includes(":")) out.CidrIpv6 = src; else out.CidrIpv4 = src;
  return out;
}
const newRule = (egress = false): Rule => egress ? { type: "All traffic", proto: "-1", from: "-1", to: "-1", srcType: "anywhere4", src: "0.0.0.0/0", desc: "" } : { type: "Custom TCP", proto: "tcp", from: "", to: "", srcType: "custom", src: "", desc: "" };

export function RuleEditor({ rules, onChange, egress, sgOptions }: { rules: Rule[]; onChange: (r: Rule[]) => void; egress?: boolean; sgOptions: any[] }) {
  const set = (i: number, p: Partial<Rule>) => onChange(rules.map((r, j) => j === i ? { ...r, ...p } : r));
  const typeOpts = Object.keys(PROTOCOLS).map(k => ({ value: k, label: k }));
  return (
    <SpaceBetween size="s">
      <Table variant="embedded" items={rules} trackBy={r => String(rules.indexOf(r))}
        empty={<Box color="text-body-secondary">This security group has no {egress ? "outbound" : "inbound"} rules.</Box>}
        columnDefinitions={[
          { id: "id", header: "Security group rule ID", width: 170, cell: r => r.id || "-" },
          { id: "t", header: "Type", width: 170, cell: r => <Select selectedOption={{ value: r.type, label: r.type }} options={typeOpts} filteringType="auto" onChange={e => {
            const k = e.detail.selectedOption.value!; const def = PROTOCOLS[k];
            set(rules.indexOf(r), { type: k, proto: def.proto || r.proto, ...(def.port ? { from: String(def.port[0]), to: String(def.port[1]) } : {}) });
          }} /> },
          { id: "p", header: "Protocol", width: 110, cell: r => r.type === "Custom protocol" ? <Input value={r.proto} onChange={e => set(rules.indexOf(r), { proto: e.detail.value })} placeholder="6" /> : protoLabel(r.proto) },
          { id: "po", header: "Port range", width: 130, cell: r => PROTOCOLS[r.type]?.port || r.proto === "-1" ? portRange({ IpProtocol: r.proto, FromPort: Number(r.from), ToPort: Number(r.to) }) :
            <Input value={r.from === r.to || !r.to ? r.from : `${r.from}-${r.to}`} placeholder="0 or 80-443" onChange={e => { const [a, b] = e.detail.value.split("-"); set(rules.indexOf(r), { from: a.trim(), to: (b ?? a).trim() }); }} /> },
          { id: "s", header: egress ? "Destination" : "Source", cell: r => (
            <SpaceBetween direction="horizontal" size="xxs">
              <Select selectedOption={SRC_TYPES.find(s => s.value === r.srcType)!} options={SRC_TYPES} onChange={e => set(rules.indexOf(r), { srcType: e.detail.selectedOption.value!, src: e.detail.selectedOption.value === "anywhere4" ? "0.0.0.0/0" : e.detail.selectedOption.value === "anywhere6" ? "::/0" : r.src })} />
              {r.srcType === "custom" && <Autosuggest value={r.src} placeholder="CIDR blocks, security group or prefix list" enteredTextLabel={v => `Use: "${v}"`}
                options={[{ label: "Security groups", options: sgOptions.map(o => ({ value: o.value, label: o.value, description: o.label })) }]}
                onChange={e => set(rules.indexOf(r), { src: e.detail.value })} empty="Type a CIDR, e.g. 10.0.0.0/16" />}
            </SpaceBetween>
          ) },
          { id: "d", header: "Description - optional", cell: r => <Input value={r.desc} onChange={e => set(rules.indexOf(r), { desc: e.detail.value })} /> },
          { id: "x", header: "", width: 90, cell: r => <Button formAction="none" onClick={() => onChange(rules.filter(x => x !== r))}>Delete</Button> },
        ]} />
      <Button formAction="none" onClick={() => onChange([...rules, newRule(egress)])}>Add rule</Button>
    </SpaceBetween>
  );
}
function validate(rules: Rule[]) {
  for (const r of rules) {
    const src = r.srcType === "custom" ? r.src : "x";
    if (!src) return "Every rule needs a source or destination.";
    if (r.proto !== "-1" && !PROTOCOLS[r.type]?.port && r.proto !== "icmp" && (r.from === "" || isNaN(Number(r.from)))) return "Enter a port or port range for custom rules.";
  }
  return undefined;
}

const sgCols = [
  { id: "n", header: "Name", cell: (g: any) => nameOf(g) || "-" },
  { id: "id", header: "Security group ID", cell: (g: any) => <Link href={sgHref(g.GroupId)}>{g.GroupId}</Link> },
  { id: "gn", header: "Security group name", cell: (g: any) => g.GroupName },
  { id: "vpc", header: "VPC ID", cell: (g: any) => g.VpcId },
  { id: "d", header: "Description", cell: (g: any) => g.Description },
  { id: "o", header: "Owner", cell: (g: any) => g.OwnerId },
  { id: "in", header: "Inbound rules count", cell: (g: any) => `${countRules(g.IpPermissions)} Permission entr${countRules(g.IpPermissions) === 1 ? "y" : "ies"}` },
  { id: "out", header: "Outbound rules count", cell: (g: any) => `${countRules(g.IpPermissionsEgress)} Permission entr${countRules(g.IpPermissionsEgress) === 1 ? "y" : "ies"}` },
];
const countRules = (ps: any[] = []) => ps.reduce((a, p) => a + (p.IpRanges?.length || 0) + (p.Ipv6Ranges?.length || 0) + (p.UserIdGroupPairs?.length || 0) + (p.PrefixListIds?.length || 0), 0);

function RulesTable({ id, egress }: { id: string; egress: boolean }) {
  const rules = useAsync(async () => ((await ec2("DescribeSecurityGroupRules", { Filters: [{ Name: "group-id", Values: [id] }] })).SecurityGroupRules || []).filter((r: any) => !!r.IsEgress === egress), [id, egress]);
  return (
    <Table variant="embedded" items={rules.data || []} loading={rules.loading}
      header={<Header counter={`(${rules.data?.length || 0})`} actions={<Button href={`#/ec2/security-groups/${id}/edit/${egress ? "outbound" : "inbound"}`}>Edit {egress ? "outbound" : "inbound"} rules</Button>}>{egress ? "Outbound" : "Inbound"} rules</Header>}
      empty={<Box color="text-body-secondary">No rules</Box>}
      columnDefinitions={[
        { id: "id", header: "Security group rule ID", cell: (r: any) => r.SecurityGroupRuleId },
        { id: "v", header: "IP version", cell: (r: any) => r.CidrIpv4 ? "IPv4" : r.CidrIpv6 ? "IPv6" : "-" },
        { id: "t", header: "Type", cell: (r: any) => ruleTypeOf(r) },
        { id: "p", header: "Protocol", cell: (r: any) => protoLabel(r.IpProtocol) },
        { id: "po", header: "Port range", cell: (r: any) => portRange(r) },
        { id: "s", header: egress ? "Destination" : "Source", cell: (r: any) => r.CidrIpv4 || r.CidrIpv6 || (r.ReferencedGroupInfo ? <Link href={sgHref(r.ReferencedGroupInfo.GroupId)}>{r.ReferencedGroupInfo.GroupId}</Link> : r.PrefixListId) },
        { id: "d", header: "Description", cell: (r: any) => r.Description || "-" },
      ]} />
  );
}

export function SecurityGroups() {
  useCrumbs([{ text: "EC2", href: "#/ec2/dashboard" }, { text: "Security Groups", href: "#" }]);
  const nav = useNavigate();
  const flash = useFlash();
  const m = useModal<any>();
  return <>
    <ResourcePage<any>
      title="Security Groups" trackBy="GroupId"
      load={async () => (await ec2("DescribeSecurityGroups")).SecurityGroups || []}
      create={{ text: "Create security group", href: "#/ec2/security-groups/create" }}
      columns={sgCols}
      actions={[
        { id: "in", text: "Edit inbound rules", disabled: s => s.length !== 1, run: s => nav(`/ec2/security-groups/${s[0].GroupId}/edit/inbound`) },
        { id: "out", text: "Edit outbound rules", disabled: s => s.length !== 1, run: s => nav(`/ec2/security-groups/${s[0].GroupId}/edit/outbound`) },
        { id: "tags", text: "Manage tags", disabled: s => s.length !== 1, run: (s, r) => m.open("tags", s, r) },
        { id: "copy", text: "Copy to new security group", disabled: s => s.length !== 1, run: s => nav(`/ec2/security-groups/create?copy=${s[0].GroupId}`) },
        { id: "delete", text: "Delete security groups", disabled: s => !s.length || s.some(g => g.GroupName === "default"), disabledReason: "The default security group can't be deleted.", run: (s, r) => m.open("delete", s, r) },
      ]}
      detail={g => [
        { id: "d", label: "Details", content: <ColumnLayout columns={4} variant="text-grid">
          <ValueWithLabel label="Security group name">{g.GroupName}</ValueWithLabel>
          <ValueWithLabel label="Security group ID">{g.GroupId}</ValueWithLabel>
          <ValueWithLabel label="Description">{g.Description}</ValueWithLabel>
          <ValueWithLabel label="VPC ID">{g.VpcId}</ValueWithLabel>
          <ValueWithLabel label="Owner">{g.OwnerId}</ValueWithLabel>
          <ValueWithLabel label="Inbound rules count">{countRules(g.IpPermissions)}</ValueWithLabel>
          <ValueWithLabel label="Outbound rules count">{countRules(g.IpPermissionsEgress)}</ValueWithLabel>
        </ColumnLayout> },
        { id: "in", label: "Inbound rules", content: <RulesTable id={g.GroupId} egress={false} /> },
        { id: "out", label: "Outbound rules", content: <RulesTable id={g.GroupId} egress /> },
      ]}
    />
    {m.is("tags") && <TagsModal id={m.rows[0].GroupId} tags={m.rows[0].Tags} close={m.close} done={() => { m.close(); m.reload(); }} />}
    <ActionModal visible={m.is("delete")} onDismiss={m.close} header="Delete security groups" ok="Delete" danger onOk={async () => {
      for (const g of m.rows) await ec2("DeleteSecurityGroup", { GroupId: g.GroupId }); flash.notify({ type: "success", content: `Deleted ${m.rows.map(g => g.GroupId).join(", ")}.` }); m.reload();
    }}>
      <Alert type="warning">Security groups in use by instances or network interfaces, or referenced by other groups' rules, can't be deleted.</Alert>
      <Box>{m.rows.map(g => `${g.GroupId} (${g.GroupName})`).join(", ")}</Box>
    </ActionModal>
  </>;
}

export function SecurityGroupDetail() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  useCrumbs([{ text: "EC2", href: "#/ec2/dashboard" }, { text: "Security Groups", href: "#/ec2/security-groups" }, { text: id, href: "#" }]);
  const g = useAsync(async () => (await ec2("DescribeSecurityGroups", { GroupIds: [id] })).SecurityGroups[0], [id]);
  const m = useModal<any>();
  if (g.loading && !g.data) return <Spinner size="large" />;
  if (g.error) return <ErrorAlert error={g.error} />;
  const s = g.data;
  return (
    <ContentLayout header={<Header variant="h1" actions={<ButtonDropdown onItemClick={e => e.detail.id === "tags" ? m.open("tags", [s]) : nav(e.detail.id === "copy" ? `/ec2/security-groups/create?copy=${id}` : `/ec2/security-groups/${id}/edit/${e.detail.id}`)}
      items={[{ id: "inbound", text: "Edit inbound rules" }, { id: "outbound", text: "Edit outbound rules" }, { id: "tags", text: "Manage tags" }, { id: "copy", text: "Copy to new security group" }]}>Actions</ButtonDropdown>}>{id} - {s.GroupName}</Header>}>
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Details</Header>}>
          <ColumnLayout columns={4} variant="text-grid">
            <ValueWithLabel label="Security group name">{s.GroupName}</ValueWithLabel>
            <ValueWithLabel label="Security group ID">{s.GroupId}</ValueWithLabel>
            <ValueWithLabel label="Description">{s.Description}</ValueWithLabel>
            <ValueWithLabel label="VPC ID">{s.VpcId}</ValueWithLabel>
            <ValueWithLabel label="Owner">{s.OwnerId}</ValueWithLabel>
            <ValueWithLabel label="Inbound rules count">{countRules(s.IpPermissions)} Permission entries</ValueWithLabel>
            <ValueWithLabel label="Outbound rules count">{countRules(s.IpPermissionsEgress)} Permission entries</ValueWithLabel>
          </ColumnLayout>
        </Container>
        <Tabs tabs={[
          { id: "in", label: "Inbound rules", content: <Container><RulesTable id={id} egress={false} /></Container> },
          { id: "out", label: "Outbound rules", content: <Container><RulesTable id={id} egress /></Container> },
          { id: "tags", label: "Tags", content: <Container><Table variant="embedded" items={s.Tags || []} empty={<Box color="text-body-secondary">No tags</Box>} header={<Header actions={<Button onClick={() => m.open("tags", [s])}>Manage tags</Button>}>Tags</Header>} columnDefinitions={[{ id: "k", header: "Key", cell: (t: any) => t.Key }, { id: "v", header: "Value", cell: (t: any) => t.Value }]} /></Container> },
        ]} />
      </SpaceBetween>
      {m.is("tags") && <TagsModal id={id} tags={s.Tags} close={m.close} done={() => { m.close(); g.reload(); }} />}
    </ContentLayout>
  );
}

export function EditRules() {
  const { id = "", dir = "inbound" } = useParams();
  const egress = dir === "outbound";
  const nav = useNavigate();
  const flash = useFlash();
  useCrumbs([{ text: "EC2", href: "#/ec2/dashboard" }, { text: "Security Groups", href: "#/ec2/security-groups" }, { text: id, href: sgHref(id) }, { text: `Edit ${dir} rules`, href: "#" }]);
  const data = useAsync(async () => {
    const [g, rules] = await Promise.all([ec2("DescribeSecurityGroups", { GroupIds: [id] }), ec2("DescribeSecurityGroupRules", { Filters: [{ Name: "group-id", Values: [id] }] })]);
    return { g: g.SecurityGroups[0], rules: (rules.SecurityGroupRules || []).filter((r: any) => !!r.IsEgress === egress) };
  }, [id, dir]);
  const sgs = useSgs(data.data?.g.VpcId);
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  useEffect(() => { if (data.data) setRules(data.data.rules.map(ruleFromApi)); }, [data.data]);
  const save = async () => {
    const v = validate(rules!); if (v) { setErr(new Error(v)); return; }
    setBusy(true); setErr(null);
    try {
      const orig = data.data!.rules;
      const keptIds = rules!.filter(r => r.id).map(r => r.id);
      const removed = orig.filter((r: any) => !keptIds.includes(r.SecurityGroupRuleId)).map((r: any) => r.SecurityGroupRuleId);
      if (removed.length) await ec2(egress ? "RevokeSecurityGroupEgress" : "RevokeSecurityGroupIngress", { GroupId: id, SecurityGroupRuleIds: removed });
      const changed = rules!.filter(r => r.id).filter(r => { const o = orig.find((x: any) => x.SecurityGroupRuleId === r.id); return JSON.stringify(ruleFromApi(o)) !== JSON.stringify(r); });
      if (changed.length) await ec2("ModifySecurityGroupRules", { GroupId: id, SecurityGroupRules: changed.map(r => ({ SecurityGroupRuleId: r.id, SecurityGroupRule: ruleToSgRule(r) })) });
      const added = rules!.filter(r => !r.id);
      if (added.length) await ec2(egress ? "AuthorizeSecurityGroupEgress" : "AuthorizeSecurityGroupIngress", { GroupId: id, IpPermissions: added.map(ruleToPerm) });
      flash.notify({ type: "success", content: `${egress ? "Outbound" : "Inbound"} security group rules successfully modified on security group (${id})` });
      nav(sgHref(id).slice(1));
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <ContentLayout header={<Header variant="h1" description={`${egress ? "Outbound" : "Inbound"} rules control the ${egress ? "outgoing" : "incoming"} traffic ${egress ? "that's allowed to leave" : "that's allowed to reach"} the instance.`}>Edit {dir} rules</Header>}>
      {!rules ? (data.error ? <ErrorAlert error={data.error} /> : <Spinner size="large" />) : (
        <Form errorText={err ? <ErrorAlert error={err} /> : undefined}
          actions={<SpaceBetween direction="horizontal" size="xs"><Button variant="link" onClick={() => nav(-1)}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save rules</Button></SpaceBetween>}>
          <Container header={<Header variant="h2">{egress ? "Outbound" : "Inbound"} rules</Header>}>
            <RuleEditor rules={rules} onChange={setRules} egress={egress} sgOptions={sgs.data || []} />
          </Container>
        </Form>
      )}
    </ContentLayout>
  );
}

export function CreateSecurityGroup() {
  const nav = useNavigate();
  const flash = useFlash();
  useCrumbs([{ text: "EC2", href: "#/ec2/dashboard" }, { text: "Security Groups", href: "#/ec2/security-groups" }, { text: "Create security group", href: "#" }]);
  const copyFrom = new URLSearchParams(location.hash.split("?")[1] || "").get("copy");
  const vpcs = useVpcs();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [vpc, setVpc] = useState<any>(null);
  const [inb, setInb] = useState<Rule[]>([]);
  const [outb, setOutb] = useState<Rule[]>([newRule(true)]);
  const [tags, setTags] = useState<KV[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const sgs = useSgs(vpc?.value);
  useEffect(() => { if (vpcs.data && !vpc) setVpc(vpcs.data.find((v: any) => v.raw.IsDefault) || vpcs.data[0]); }, [vpcs.data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!copyFrom) return;
    (async () => {
      const [g, rules] = await Promise.all([ec2("DescribeSecurityGroups", { GroupIds: [copyFrom] }), ec2("DescribeSecurityGroupRules", { Filters: [{ Name: "group-id", Values: [copyFrom] }] })]);
      const s = g.SecurityGroups[0];
      setName(`${s.GroupName}-copy`); setDesc(s.Description);
      setInb((rules.SecurityGroupRules || []).filter((r: any) => !r.IsEgress).map((r: any) => ({ ...ruleFromApi(r), id: undefined })));
      setOutb((rules.SecurityGroupRules || []).filter((r: any) => r.IsEgress).map((r: any) => ({ ...ruleFromApi(r), id: undefined })));
    })().catch(e => setErr(e));
  }, [copyFrom]);
  const save = async () => {
    if (!name || !desc) { setErr(new Error("Security group name and description are required.")); return; }
    const v = validate([...inb, ...outb]); if (v) { setErr(new Error(v)); return; }
    setBusy(true); setErr(null);
    try {
      const allTags = toTagSet(tags);
      const g = await ec2("CreateSecurityGroup", { GroupName: name, Description: desc, VpcId: vpc?.value, ...(allTags.length ? { TagSpecifications: [{ ResourceType: "security-group", Tags: allTags }] } : {}) });
      if (inb.length) await ec2("AuthorizeSecurityGroupIngress", { GroupId: g.GroupId, IpPermissions: inb.map(ruleToPerm) });
      // Replace the default allow-all egress rule with what the user configured.
      const isDefault = outb.length === 1 && outb[0].proto === "-1" && outb[0].srcType === "anywhere4";
      if (!isDefault) {
        await ec2("RevokeSecurityGroupEgress", { GroupId: g.GroupId, IpPermissions: [{ IpProtocol: "-1", IpRanges: [{ CidrIp: "0.0.0.0/0" }] }] }).catch(() => {});
        if (outb.length) await ec2("AuthorizeSecurityGroupEgress", { GroupId: g.GroupId, IpPermissions: outb.map(ruleToPerm) });
      }
      flash.notify({ type: "success", content: `Security group (${g.GroupId} | ${name}) was created successfully` });
      nav(sgHref(g.GroupId).slice(1));
    } catch (e) { setErr(e); window.scrollTo(0, 0); } finally { setBusy(false); }
  };
  return (
    <ContentLayout header={<Header variant="h1" description="A security group acts as a virtual firewall for your instance to control inbound and outbound traffic.">Create security group</Header>}>
      <Form errorText={err ? <ErrorAlert error={err} /> : undefined}
        actions={<SpaceBetween direction="horizontal" size="xs"><Button variant="link" onClick={() => nav(-1)}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Create security group</Button></SpaceBetween>}>
        <SpaceBetween size="l">
          <Container header={<Header variant="h2">Basic details</Header>}>
            <SpaceBetween size="m">
              <FormField label="Security group name" constraintText="Name cannot be edited after creation."><Input value={name} onChange={e => setName(e.detail.value)} placeholder="MyWebServerGroup" /></FormField>
              <FormField label="Description"><Input value={desc} onChange={e => setDesc(e.detail.value)} placeholder="Allows SSH access to developers" /></FormField>
              <FormField label="VPC"><Select selectedOption={vpc} options={vpcs.data || []} onChange={e => setVpc(e.detail.selectedOption)} /></FormField>
            </SpaceBetween>
          </Container>
          <Container header={<Header variant="h2">Inbound rules</Header>}><RuleEditor rules={inb} onChange={setInb} sgOptions={sgs.data || []} /></Container>
          <Container header={<Header variant="h2">Outbound rules</Header>}><RuleEditor rules={outb} onChange={setOutb} egress sgOptions={sgs.data || []} /></Container>
          <Container header={<Header variant="h2">Tags - optional</Header>}><Tags tags={tags} onChange={setTags} /></Container>
        </SpaceBetween>
      </Form>
    </ContentLayout>
  );
}

