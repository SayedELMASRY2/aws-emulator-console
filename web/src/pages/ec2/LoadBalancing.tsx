import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import SpaceBetween from "@cloudscape-design/components/space-between";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Select from "@cloudscape-design/components/select";
import Multiselect from "@cloudscape-design/components/multiselect";
import Checkbox from "@cloudscape-design/components/checkbox";
import RadioGroup from "@cloudscape-design/components/radio-group";
import Tiles from "@cloudscape-design/components/tiles";
import Table from "@cloudscape-design/components/table";
import Button from "@cloudscape-design/components/button";
import Box from "@cloudscape-design/components/box";
import Link from "@cloudscape-design/components/link";
import Form from "@cloudscape-design/components/form";
import ExpandableSection from "@cloudscape-design/components/expandable-section";
import Alert from "@cloudscape-design/components/alert";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Cards from "@cloudscape-design/components/cards";
import { useCrumbs } from "../../App";
import { ErrorAlert, useAsync, useFlash, ValueWithLabel, Copyable } from "../../common";
import { Tags } from "../s3/fields";
import { toTagSet, type KV } from "../s3/lib";
import { elb, ec2, fmt, nameOf, useVpcs, useSubnets, useSgs, allInstances, instHref, sgHref } from "./lib";
import { ResourcePage, ActionModal, useModal } from "./ResourcePage";

const crumbs = (t: string, ...more: any[]) => [{ text: "EC2", href: "#/ec2/dashboard" }, { text: t, href: more.length ? `#/ec2/${t.toLowerCase().replace(/ /g, "-")}` : "#" }, ...more];
const lbState = (s?: string) => s === "active" ? <StatusIndicator type="success">Active</StatusIndicator> : s === "provisioning" ? <StatusIndicator type="pending">Provisioning</StatusIndicator> : <StatusIndicator type="error">{s}</StatusIndicator>;
const health = (s?: string) => s === "healthy" ? <StatusIndicator type="success">Healthy</StatusIndicator> : s === "unhealthy" ? <StatusIndicator type="error">Unhealthy</StatusIndicator> : s === "initial" ? <StatusIndicator type="pending">Initial</StatusIndicator> : s === "draining" ? <StatusIndicator type="stopped">Draining</StatusIndicator> : <StatusIndicator type="info">{s || "-"}</StatusIndicator>;
const actionLabel = (a: any) => a.Type === "forward" ? `Forward to ${(a.ForwardConfig?.TargetGroups || [{ TargetGroupArn: a.TargetGroupArn }]).map((t: any) => String(t.TargetGroupArn).split("/")[1]).join(", ")}`
  : a.Type === "fixed-response" ? `Return fixed response ${a.FixedResponseConfig?.StatusCode}` : a.Type === "redirect" ? `Redirect to ${a.RedirectConfig?.Protocol}://${a.RedirectConfig?.Host}:${a.RedirectConfig?.Port}${a.RedirectConfig?.Path}` : a.Type;
const condLabel = (c: any) => c.Field === "path-pattern" ? `Path is ${(c.PathPatternConfig?.Values || c.Values).join(" OR ")}` : c.Field === "host-header" ? `Host is ${(c.HostHeaderConfig?.Values || c.Values).join(" OR ")}` : c.Field === "http-request-method" ? `HTTP method is ${(c.HttpRequestMethodConfig?.Values || []).join(" OR ")}` : `${c.Field} ${JSON.stringify(c.Values || "")}`;

// ---------------- Load balancers ----------------
export function LoadBalancers() {
  useCrumbs(crumbs("Load balancers"));
  const nav = useNavigate();
  const flash = useFlash();
  const m = useModal<any>();
  const [choose, setChoose] = useState(false);
  return <>
    <ResourcePage<any>
      title="Load balancers" trackBy="LoadBalancerArn"
      description="Elastic Load Balancing scales your load balancer capacity automatically in response to changes in incoming traffic."
      load={async () => (await elb("DescribeLoadBalancers")).LoadBalancers || []}
      poll={l => l.State?.Code === "provisioning"}
      create={{ text: "Create load balancer", onClick: () => setChoose(true) }}
      columns={[
        { id: "n", header: "Name", cell: l => l.LoadBalancerName },
        { id: "dns", header: "DNS name", cell: l => <Copyable text={l.DNSName} /> },
        { id: "s", header: "State", cell: l => lbState(l.State?.Code) },
        { id: "v", header: "VPC ID", cell: l => l.VpcId },
        { id: "az", header: "Availability Zones", cell: l => `${(l.AvailabilityZones || []).length} Availability Zones` },
        { id: "t", header: "Type", cell: l => l.Type },
        { id: "sc", header: "Scheme", cell: l => l.Scheme, hidden: true },
        { id: "c", header: "Date created", cell: l => fmt(l.CreatedTime) },
      ]}
      actions={[
        { id: "sg", text: "Edit security groups", disabled: s => s.length !== 1 || s[0].Type !== "application", run: (s, r) => m.open("sg", s, r) },
        { id: "attrs", text: "Edit load balancer attributes", disabled: s => s.length !== 1, run: (s, r) => m.open("attrs", s, r) },
        { id: "delete", text: "Delete load balancer", run: (s, r) => m.open("delete", s, r) },
      ]}
      detail={(l, reload) => [
        { id: "d", label: "Details", content: <LbDetails l={l} /> },
        { id: "l", label: "Listeners and rules", content: <Listeners l={l} /> },
        { id: "n", label: "Network mapping", content: <Table variant="embedded" items={l.AvailabilityZones || []} columnDefinitions={[{ id: "z", header: "Zone", cell: (z: any) => z.ZoneName }, { id: "s", header: "Subnet", cell: (z: any) => z.SubnetId }, { id: "a", header: "IPv4 address", cell: (z: any) => (z.LoadBalancerAddresses || []).map((a: any) => a.IpAddress).join(", ") || "Assigned by AWS" }]} /> },
        { id: "s", label: "Security", content: <SpaceBetween size="s"><Box>Security groups: {(l.SecurityGroups || []).map((g: string) => <Link key={g} href={sgHref(g)}>{g} </Link>)}{!l.SecurityGroups?.length && "-"}</Box><Button onClick={() => m.open("sg", [l], reload)} disabled={l.Type !== "application"}>Edit</Button></SpaceBetween> },
        { id: "a", label: "Attributes", content: <LbAttributes arn={l.LoadBalancerArn} /> },
        { id: "t", label: "Tags", content: <ResourceTags arn={l.LoadBalancerArn} /> },
      ]}
    />
    <ActionModal visible={choose} onDismiss={() => setChoose(false)} header="Compare and select load balancer type" ok="Close" size="large" onOk={async () => {}}>
      <Cards items={[
        { id: "application", title: "Application Load Balancer", desc: "Choose an Application Load Balancer when you need a flexible feature set for your applications with HTTP and HTTPS traffic. Operating at the request level, Application Load Balancers provide advanced routing and visibility features." },
        { id: "network", title: "Network Load Balancer", desc: "Choose a Network Load Balancer when you need ultra-high performance, TLS offloading at scale, centralized certificate deployment, support for UDP, and static IP addresses for your applications." },
        { id: "gateway", title: "Gateway Load Balancer", desc: "Choose a Gateway Load Balancer when you need to deploy and manage a fleet of third-party virtual appliances that support GENEVE." },
      ]} cardsPerRow={[{ cards: 3 }]} cardDefinition={{ header: x => x.title, sections: [{ id: "d", content: x => x.desc }, { id: "b", content: x => <Button variant="primary" onClick={() => nav(`/ec2/load-balancers/create/${x.id}`)}>Create</Button> }] }} />
    </ActionModal>
    {m.is("sg") && <LbSgModal l={m.rows[0]} close={m.close} done={() => { m.close(); m.reload(); }} />}
    {m.is("attrs") && <LbAttrModal l={m.rows[0]} close={m.close} done={() => { m.close(); m.reload(); }} />}
    <ActionModal visible={m.is("delete")} onDismiss={m.close} header="Delete load balancer" ok="Delete" danger onOk={async () => {
      for (const l of m.rows) await elb("DeleteLoadBalancer", { LoadBalancerArn: l.LoadBalancerArn }); flash.notify({ type: "success", content: `Successfully deleted ${m.rows.map(l => l.LoadBalancerName).join(", ")}.` }); m.reload();
    }}><Box>Delete {m.rows.map(l => l.LoadBalancerName).join(", ")}? Listeners are deleted too; target groups are kept.</Box></ActionModal>
  </>;
}

function LbDetails({ l }: { l: any }) {
  const local = /^127\.0\.0\.1:\d+$/.test(l.DNSName);
  return (
    <SpaceBetween size="m">
      <ColumnLayout columns={4} variant="text-grid">
        <ValueWithLabel label="Load balancer type">{l.Type === "application" ? "Application" : l.Type === "network" ? "Network" : "Gateway"}</ValueWithLabel>
        <ValueWithLabel label="Status">{lbState(l.State?.Code)}</ValueWithLabel>
        <ValueWithLabel label="VPC">{l.VpcId}</ValueWithLabel>
        <ValueWithLabel label="IP address type">{l.IpAddressType}</ValueWithLabel>
        <ValueWithLabel label="Scheme">{l.Scheme}</ValueWithLabel>
        <ValueWithLabel label="Hosted zone">{l.CanonicalHostedZoneId}</ValueWithLabel>
        <ValueWithLabel label="Date created">{fmt(l.CreatedTime)}</ValueWithLabel>
        <ValueWithLabel label="Load balancer ARN"><Copyable text={l.LoadBalancerArn} /></ValueWithLabel>
        <ValueWithLabel label="DNS name"><Copyable text={l.DNSName} /></ValueWithLabel>
      </ColumnLayout>
      {local && <Alert type="info">This load balancer answers HTTP on your machine at <Link href={`http://${l.DNSName}/`} external>http://{l.DNSName}</Link>. Fixed-response and redirect rules work; forwarding needs a target that's really listening.</Alert>}
    </SpaceBetween>
  );
}

function Listeners({ l }: { l: any }) {
  const flash = useFlash();
  const ls = useAsync(async () => (await elb("DescribeListeners", { LoadBalancerArn: l.LoadBalancerArn })).Listeners || [], [l.LoadBalancerArn]);
  const tgs = useAsync(async () => ((await elb("DescribeTargetGroups")).TargetGroups || []).filter((t: any) => t.VpcId === l.VpcId).map((t: any) => ({ value: t.TargetGroupArn, label: t.TargetGroupName, description: `${t.Protocol}:${t.Port} · ${t.TargetType}` })), [l.LoadBalancerArn]);
  const [sel, setSel] = useState<any[]>([]);
  const m = useModal<any>();
  const [f, setF] = useState<any>({ proto: "HTTP", port: "80", tg: null });
  return (
    <SpaceBetween size="l">
      <Table variant="embedded" items={ls.data || []} loading={ls.loading} trackBy="ListenerArn" selectionType="single" selectedItems={sel} onSelectionChange={e => setSel(e.detail.selectedItems)}
        header={<Header counter={`(${ls.data?.length || 0})`} actions={<SpaceBetween direction="horizontal" size="xs">
          <Button disabled={!sel.length} onClick={async () => { try { await elb("DeleteListener", { ListenerArn: sel[0].ListenerArn }); setSel([]); ls.reload(); } catch (e) { flash.error(e); } }}>Delete</Button>
          <Button onClick={() => { setF({ proto: l.Type === "network" ? "TCP" : "HTTP", port: "80", tg: null }); m.open("add"); }}>Add listener</Button>
        </SpaceBetween>}>Listeners</Header>}
        empty={<Box color="text-body-secondary">No listeners</Box>}
        columnDefinitions={[
          { id: "p", header: "Protocol:Port", cell: (x: any) => `${x.Protocol}:${x.Port}` },
          { id: "d", header: "Default action", cell: (x: any) => (x.DefaultActions || []).map(actionLabel).join("; ") },
          { id: "a", header: "ARN", cell: (x: any) => String(x.ListenerArn).split("/").pop() },
        ]} />
      {sel[0] && l.Type === "application" && <Rules listener={sel[0]} tgs={tgs.data || []} />}
      <ActionModal visible={m.is("add")} onDismiss={m.close} header="Add listener" ok="Add" disabled={!f.tg} onOk={async () => {
        await elb("CreateListener", { LoadBalancerArn: l.LoadBalancerArn, Protocol: f.proto, Port: Number(f.port), DefaultActions: [{ Type: "forward", TargetGroupArn: f.tg.value }] }); ls.reload();
      }}>
        <ColumnLayout columns={2}>
          <FormField label="Protocol"><Select selectedOption={{ value: f.proto, label: f.proto }} options={(l.Type === "network" ? ["TCP", "UDP", "TLS", "TCP_UDP"] : ["HTTP", "HTTPS"]).map(p => ({ value: p, label: p }))} onChange={e => setF({ ...f, proto: e.detail.selectedOption.value })} /></FormField>
          <FormField label="Port"><Input type="number" value={f.port} onChange={e => setF({ ...f, port: e.detail.value })} /></FormField>
        </ColumnLayout>
        <FormField label="Default action: forward to"><Select selectedOption={f.tg} placeholder="Select a target group" options={tgs.data || []} onChange={e => setF({ ...f, tg: e.detail.selectedOption })} /></FormField>
      </ActionModal>
    </SpaceBetween>
  );
}

function Rules({ listener, tgs }: { listener: any; tgs: any[] }) {
  const flash = useFlash();
  const rules = useAsync(async () => (await elb("DescribeRules", { ListenerArn: listener.ListenerArn })).Rules || [], [listener.ListenerArn]);
  const [sel, setSel] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<any>({ field: "path-pattern", value: "/api/*", prio: "10", action: "forward", tg: null, status: "200", body: "OK", ctype: "text/plain", host: "#{host}", rport: "443", rproto: "HTTPS", path: "/#{path}" });
  return (
    <>
      <Table variant="embedded" items={rules.data || []} loading={rules.loading} trackBy="RuleArn" selectionType="single" selectedItems={sel} onSelectionChange={e => setSel(e.detail.selectedItems)} isItemDisabled={r => r.IsDefault}
        header={<Header variant="h3" counter={`(${rules.data?.length || 0})`} actions={<SpaceBetween direction="horizontal" size="xs">
          <Button disabled={!sel.length} onClick={async () => { try { await elb("DeleteRule", { RuleArn: sel[0].RuleArn }); setSel([]); rules.reload(); } catch (e) { flash.error(e); } }}>Delete rule</Button>
          <Button onClick={() => setOpen(true)}>Add rule</Button>
        </SpaceBetween>}>Rules for {listener.Protocol}:{listener.Port}</Header>}
        columnDefinitions={[
          { id: "p", header: "Priority", cell: (r: any) => r.IsDefault ? "Default (last)" : r.Priority },
          { id: "c", header: "Conditions (If)", cell: (r: any) => r.IsDefault ? "If no other rule applies" : (r.Conditions || []).map(condLabel).join(" AND ") },
          { id: "a", header: "Actions (Then)", cell: (r: any) => (r.Actions || []).map(actionLabel).join("; ") },
        ]} />
      <ActionModal visible={open} onDismiss={() => setOpen(false)} header="Add rule" ok="Create" size="medium" onOk={async () => {
        const cond = f.field === "path-pattern" ? { Field: "path-pattern", PathPatternConfig: { Values: [f.value] } } : { Field: "host-header", HostHeaderConfig: { Values: [f.value] } };
        const action = f.action === "forward" ? { Type: "forward", TargetGroupArn: f.tg?.value } : f.action === "fixed" ? { Type: "fixed-response", FixedResponseConfig: { StatusCode: f.status, ContentType: f.ctype, MessageBody: f.body } }
          : { Type: "redirect", RedirectConfig: { Protocol: f.rproto, Port: f.rport, Host: f.host, Path: f.path, StatusCode: "HTTP_301" } };
        await elb("CreateRule", { ListenerArn: listener.ListenerArn, Priority: Number(f.prio), Conditions: [cond], Actions: [action] }); rules.reload();
      }}>
        <ColumnLayout columns={2}>
          <FormField label="Condition"><Select selectedOption={{ value: f.field, label: f.field === "path-pattern" ? "Path" : "Host header" }} options={[{ value: "path-pattern", label: "Path" }, { value: "host-header", label: "Host header" }]} onChange={e => setF({ ...f, field: e.detail.selectedOption.value })} /></FormField>
          <FormField label="Value"><Input value={f.value} onChange={e => setF({ ...f, value: e.detail.value })} /></FormField>
          <FormField label="Priority" constraintText="1–50000, lower is evaluated first."><Input type="number" value={f.prio} onChange={e => setF({ ...f, prio: e.detail.value })} /></FormField>
        </ColumnLayout>
        <FormField label="Action"><RadioGroup value={f.action} onChange={e => setF({ ...f, action: e.detail.value })} items={[{ value: "forward", label: "Forward to target groups" }, { value: "fixed", label: "Return fixed response" }, { value: "redirect", label: "Redirect to URL" }]} /></FormField>
        {f.action === "forward" && <FormField label="Target group"><Select selectedOption={f.tg} placeholder="Select" options={tgs} onChange={e => setF({ ...f, tg: e.detail.selectedOption })} /></FormField>}
        {f.action === "fixed" && <ColumnLayout columns={3}>
          <FormField label="Response code"><Input value={f.status} onChange={e => setF({ ...f, status: e.detail.value })} /></FormField>
          <FormField label="Content type"><Select selectedOption={{ value: f.ctype, label: f.ctype }} options={["text/plain", "text/html", "application/json"].map(c => ({ value: c, label: c }))} onChange={e => setF({ ...f, ctype: e.detail.selectedOption.value })} /></FormField>
          <FormField label="Response body"><Input value={f.body} onChange={e => setF({ ...f, body: e.detail.value })} /></FormField>
        </ColumnLayout>}
        {f.action === "redirect" && <ColumnLayout columns={2}>
          <FormField label="Protocol"><Select selectedOption={{ value: f.rproto, label: f.rproto }} options={["HTTP", "HTTPS", "#{protocol}"].map(c => ({ value: c, label: c }))} onChange={e => setF({ ...f, rproto: e.detail.selectedOption.value })} /></FormField>
          <FormField label="Port"><Input value={f.rport} onChange={e => setF({ ...f, rport: e.detail.value })} /></FormField>
          <FormField label="Host"><Input value={f.host} onChange={e => setF({ ...f, host: e.detail.value })} /></FormField>
          <FormField label="Path"><Input value={f.path} onChange={e => setF({ ...f, path: e.detail.value })} /></FormField>
        </ColumnLayout>}
      </ActionModal>
    </>
  );
}

function LbAttributes({ arn }: { arn: string }) {
  const a = useAsync(async () => (await elb("DescribeLoadBalancerAttributes", { LoadBalancerArn: arn })).Attributes || [], [arn]);
  return <Table variant="embedded" items={a.data || []} loading={a.loading} columnDefinitions={[{ id: "k", header: "Attribute", cell: (x: any) => x.Key }, { id: "v", header: "Value", cell: (x: any) => x.Value }]} />;
}
export function ResourceTags({ arn }: { arn: string }) {
  const t = useAsync(async () => ((await elb("DescribeTags", { ResourceArns: [arn] })).TagDescriptions?.[0]?.Tags) || [], [arn]);
  return <Table variant="embedded" items={t.data || []} loading={t.loading} empty={<Box color="text-body-secondary">No tags</Box>} columnDefinitions={[{ id: "k", header: "Key", cell: (x: any) => x.Key }, { id: "v", header: "Value", cell: (x: any) => x.Value }]} />;
}
function LbSgModal({ l, close, done }: { l: any; close: () => void; done: () => void }) {
  const sgs = useSgs(l.VpcId);
  const [sel, setSel] = useState<any[]>((l.SecurityGroups || []).map((g: string) => ({ value: g, label: g })));
  return (
    <ActionModal visible onDismiss={close} header="Edit security groups" ok="Save changes" disabled={!sel.length} onOk={async () => { await elb("SetSecurityGroups", { LoadBalancerArn: l.LoadBalancerArn, SecurityGroups: sel.map(s => s.value) }); done(); }}>
      <FormField label="Security groups"><Multiselect selectedOptions={sel} options={sgs.data || []} onChange={e => setSel(e.detail.selectedOptions as any)} /></FormField>
    </ActionModal>
  );
}
function LbAttrModal({ l, close, done }: { l: any; close: () => void; done: () => void }) {
  const a = useAsync(async () => (await elb("DescribeLoadBalancerAttributes", { LoadBalancerArn: l.LoadBalancerArn })).Attributes || [], []);
  const [v, setV] = useState<Record<string, string>>({});
  useEffect(() => { if (a.data) setV(Object.fromEntries(a.data.map((x: any) => [x.Key, x.Value]))); }, [a.data]);
  const keys = ["deletion_protection.enabled", "idle_timeout.timeout_seconds", "routing.http2.enabled", "load_balancing.cross_zone.enabled", "routing.http.drop_invalid_header_fields.enabled", "access_logs.s3.enabled"].filter(k => k in v);
  return (
    <ActionModal visible onDismiss={close} header="Edit load balancer attributes" ok="Save changes" size="medium" onOk={async () => {
      await elb("ModifyLoadBalancerAttributes", { LoadBalancerArn: l.LoadBalancerArn, Attributes: keys.map(k => ({ Key: k, Value: v[k] })) }); done();
    }}>
      {keys.map(k => v[k] === "true" || v[k] === "false"
        ? <Checkbox key={k} checked={v[k] === "true"} onChange={e => setV({ ...v, [k]: String(e.detail.checked) })}>{k}</Checkbox>
        : <FormField key={k} label={k}><Input value={v[k]} onChange={e => setV({ ...v, [k]: e.detail.value })} /></FormField>)}
    </ActionModal>
  );
}

export function CreateLoadBalancer() {
  const { type = "application" } = useParams();
  const nav = useNavigate();
  const flash = useFlash();
  const title = type === "application" ? "Application Load Balancer" : type === "network" ? "Network Load Balancer" : "Gateway Load Balancer";
  useCrumbs(crumbs("Load balancers", { text: `Create ${title}`, href: "#" }));
  const vpcs = useVpcs();
  const [vpc, setVpc] = useState<any>(null);
  const subnets = useSubnets(vpc?.value);
  const sgs = useSgs(vpc?.value);
  const tgs = useAsync(async () => vpc ? ((await elb("DescribeTargetGroups")).TargetGroups || []).filter((t: any) => t.VpcId === vpc.value).map((t: any) => ({ value: t.TargetGroupArn, label: t.TargetGroupName, description: `${t.Protocol}:${t.Port}` })) : [], [vpc?.value]);
  const [name, setName] = useState("");
  const [scheme, setScheme] = useState("internet-facing");
  const [ipType, setIpType] = useState("ipv4");
  const [azs, setAzs] = useState<Record<string, string>>({});
  const [sgSel, setSgSel] = useState<any[]>([]);
  const [listeners, setListeners] = useState<{ proto: string; port: string; tg: any }[]>([{ proto: type === "network" ? "TCP" : type === "gateway" ? "GENEVE" : "HTTP", port: type === "gateway" ? "6081" : "80", tg: null }]);
  const [tags, setTags] = useState<KV[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  useEffect(() => { if (vpcs.data && !vpc) setVpc(vpcs.data.find((v: any) => v.raw.IsDefault) || vpcs.data[0]); }, [vpcs.data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const d = (sgs.data || []).find((g: any) => g.label === "default"); if (d && type === "application" && !sgSel.length) setSgSel([d]); }, [sgs.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const byAz = new Map<string, any[]>();
  (subnets.data || []).forEach((s: any) => byAz.set(s.raw.AvailabilityZone, [...(byAz.get(s.raw.AvailabilityZone) || []), s]));
  const submit = async () => {
    const subs = Object.values(azs).filter(Boolean);
    if (!name) { setErr(new Error("Load balancer name is required.")); return; }
    if (type === "application" && subs.length < 2) { setErr(new Error("Select at least two Availability Zones and one subnet per zone.")); return; }
    if (!subs.length) { setErr(new Error("Select at least one Availability Zone.")); return; }
    setBusy(true); setErr(null);
    try {
      const t = toTagSet(tags);
      const r = await elb("CreateLoadBalancer", { Name: name, Type: type, ...(type !== "gateway" ? { Scheme: scheme, IpAddressType: ipType } : {}), Subnets: subs, ...(type === "application" && sgSel.length ? { SecurityGroups: sgSel.map(s => s.value) } : {}), ...(t.length ? { Tags: t } : {}) });
      const arn = r.LoadBalancers[0].LoadBalancerArn;
      for (const l of listeners) if (l.tg) await elb("CreateListener", { LoadBalancerArn: arn, ...(type !== "gateway" ? { Protocol: l.proto, Port: Number(l.port) } : {}), DefaultActions: [{ Type: "forward", TargetGroupArn: l.tg.value }] });
      flash.notify({ type: "success", content: `Successfully created load balancer: ${name}` });
      nav("/ec2/load-balancers");
    } catch (e) { setErr(e); window.scrollTo(0, 0); } finally { setBusy(false); }
  };
  return (
    <ContentLayout header={<Header variant="h1">Create {title}</Header>}>
      <Form errorText={err ? <ErrorAlert error={err} /> : undefined} actions={<SpaceBetween direction="horizontal" size="xs"><Button variant="link" onClick={() => nav(-1)}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>Create load balancer</Button></SpaceBetween>}>
        <SpaceBetween size="l">
          <Container header={<Header variant="h2">Basic configuration</Header>}>
            <SpaceBetween size="l">
              <FormField label="Load balancer name" constraintText="A maximum of 32 alphanumeric characters including hyphens are allowed, but the name must not begin or end with a hyphen."><Input value={name} onChange={e => setName(e.detail.value)} /></FormField>
              {type !== "gateway" && <FormField label="Scheme" description="Scheme can't be changed after the load balancer is created.">
                <RadioGroup value={scheme} onChange={e => setScheme(e.detail.value)} items={[
                  { value: "internet-facing", label: "Internet-facing", description: "Serves internet-facing traffic. Has public IP addresses. DNS name is publicly resolvable. Requires a public subnet." },
                  { value: "internal", label: "Internal", description: "Serves internal traffic. Has private IP addresses. DNS name is publicly resolvable." },
                ]} />
              </FormField>}
              {type !== "gateway" && <FormField label="Load balancer IP address type"><RadioGroup value={ipType} onChange={e => setIpType(e.detail.value)} items={[{ value: "ipv4", label: "IPv4" }, { value: "dualstack", label: "Dualstack" }]} /></FormField>}
            </SpaceBetween>
          </Container>
          <Container header={<Header variant="h2" description="The load balancer routes traffic to targets in the selected subnets, and in accordance with your IP address settings.">Network mapping</Header>}>
            <SpaceBetween size="l">
              <FormField label="VPC"><Select selectedOption={vpc} options={vpcs.data || []} onChange={e => { setVpc(e.detail.selectedOption); setAzs({}); }} /></FormField>
              <FormField label="Availability Zones and subnets" description={type === "application" ? "Select at least two Availability Zones and one subnet per zone." : "Select at least one Availability Zone and one subnet per zone."}>
                <SpaceBetween size="s">
                  {[...byAz.entries()].sort().map(([az, list]) => (
                    <SpaceBetween key={az} direction="horizontal" size="s" alignItems="center">
                      <Checkbox checked={!!azs[az]} onChange={e => setAzs({ ...azs, [az]: e.detail.checked ? list[0].value : "" })}>{az}</Checkbox>
                      {azs[az] && <Select selectedOption={list.find(s => s.value === azs[az])} options={list} onChange={e => setAzs({ ...azs, [az]: e.detail.selectedOption.value! })} />}
                    </SpaceBetween>
                  ))}
                </SpaceBetween>
              </FormField>
            </SpaceBetween>
          </Container>
          {type === "application" && <Container header={<Header variant="h2" description="A security group is a set of firewall rules that control the traffic to your load balancer.">Security groups</Header>}>
            <Multiselect selectedOptions={sgSel} options={sgs.data || []} onChange={e => setSgSel(e.detail.selectedOptions as any)} placeholder="Select up to 5 security groups" />
          </Container>}
          <Container header={<Header variant="h2" description="A listener is a process that checks for connection requests using the port and protocol you configure.">Listeners and routing</Header>}>
            <SpaceBetween size="m">
              {listeners.map((l, i) => (
                <ExpandableSection key={i} defaultExpanded variant="container" headerText={`Listener ${l.proto}:${l.port}`}
                  headerActions={listeners.length > 1 ? <Button onClick={() => setListeners(listeners.filter((_, j) => j !== i))}>Remove</Button> : undefined}>
                  <ColumnLayout columns={3}>
                    {type !== "gateway" && <FormField label="Protocol"><Select selectedOption={{ value: l.proto, label: l.proto }} options={(type === "network" ? ["TCP", "TLS", "UDP", "TCP_UDP"] : ["HTTP", "HTTPS"]).map(p => ({ value: p, label: p }))} onChange={e => setListeners(listeners.map((x, j) => j === i ? { ...x, proto: e.detail.selectedOption.value! } : x))} /></FormField>}
                    {type !== "gateway" && <FormField label="Port"><Input type="number" value={l.port} onChange={e => setListeners(listeners.map((x, j) => j === i ? { ...x, port: e.detail.value } : x))} /></FormField>}
                    <FormField label="Default action" description={<>Forward to <Link href="#/ec2/target-groups/create" external>Create target group</Link></>}>
                      <Select selectedOption={l.tg} placeholder="Select a target group" options={tgs.data || []} statusType={tgs.loading ? "loading" : "finished"} empty="No target groups in this VPC" onChange={e => setListeners(listeners.map((x, j) => j === i ? { ...x, tg: e.detail.selectedOption } : x))} />
                    </FormField>
                  </ColumnLayout>
                </ExpandableSection>
              ))}
              {type !== "gateway" && <Button onClick={() => setListeners([...listeners, { proto: type === "network" ? "TCP" : "HTTP", port: "8080", tg: null }])}>Add listener</Button>}
              {listeners.some(l => !l.tg) && <Alert type="info">Listeners without a target group are skipped. Create a target group first, then add the listener.</Alert>}
            </SpaceBetween>
          </Container>
          <Container header={<Header variant="h2">Load balancer tags - optional</Header>}><Tags tags={tags} onChange={setTags} /></Container>
        </SpaceBetween>
      </Form>
    </ContentLayout>
  );
}

// ---------------- Target groups ----------------
export function TargetGroups() {
  useCrumbs(crumbs("Target groups"));
  const flash = useFlash();
  const m = useModal<any>();
  return <>
    <ResourcePage<any>
      title="Target groups" trackBy="TargetGroupArn"
      load={async () => (await elb("DescribeTargetGroups")).TargetGroups || []}
      create={{ text: "Create target group", href: "#/ec2/target-groups/create" }}
      columns={[
        { id: "n", header: "Name", cell: t => t.TargetGroupName },
        { id: "arn", header: "ARN", cell: t => <Copyable text={t.TargetGroupArn} />, hidden: true },
        { id: "p", header: "Port", cell: t => t.Port ?? "-" },
        { id: "pr", header: "Protocol", cell: t => t.Protocol || "-" },
        { id: "t", header: "Target type", cell: t => t.TargetType },
        { id: "lb", header: "Load balancer", cell: t => (t.LoadBalancerArns || []).map((a: string) => a.split("/")[2]).join(", ") || "None associated" },
        { id: "v", header: "VPC ID", cell: t => t.VpcId || "-" },
      ]}
      actions={[
        { id: "hc", text: "Edit health check settings", disabled: s => s.length !== 1, run: (s, r) => m.open("hc", s, r) },
        { id: "delete", text: "Delete", disabled: s => !s.length || s.some(t => t.LoadBalancerArns?.length), disabledReason: "Remove it from load balancer listeners first.", run: (s, r) => m.open("delete", s, r) },
      ]}
      detail={t => [
        { id: "targets", label: "Targets", content: <Targets tg={t} /> },
        { id: "d", label: "Details", content: <ColumnLayout columns={4} variant="text-grid">
          <ValueWithLabel label="Target type">{t.TargetType}</ValueWithLabel>
          <ValueWithLabel label="Protocol : Port">{t.Protocol}: {t.Port}</ValueWithLabel>
          <ValueWithLabel label="Protocol version">{t.ProtocolVersion || "-"}</ValueWithLabel>
          <ValueWithLabel label="VPC">{t.VpcId}</ValueWithLabel>
          <ValueWithLabel label="IP address type">{t.IpAddressType || "ipv4"}</ValueWithLabel>
          <ValueWithLabel label="Load balancer">{(t.LoadBalancerArns || []).map((a: string) => a.split("/")[2]).join(", ") || "None associated"}</ValueWithLabel>
        </ColumnLayout> },
        { id: "hc", label: "Health checks", content: <ColumnLayout columns={4} variant="text-grid">
          <ValueWithLabel label="Protocol">{t.HealthCheckProtocol}</ValueWithLabel>
          <ValueWithLabel label="Path">{t.HealthCheckPath || "-"}</ValueWithLabel>
          <ValueWithLabel label="Port">{t.HealthCheckPort}</ValueWithLabel>
          <ValueWithLabel label="Healthy threshold">{t.HealthyThresholdCount}</ValueWithLabel>
          <ValueWithLabel label="Unhealthy threshold">{t.UnhealthyThresholdCount}</ValueWithLabel>
          <ValueWithLabel label="Timeout">{t.HealthCheckTimeoutSeconds} seconds</ValueWithLabel>
          <ValueWithLabel label="Interval">{t.HealthCheckIntervalSeconds} seconds</ValueWithLabel>
          <ValueWithLabel label="Success codes">{t.Matcher?.HttpCode || t.Matcher?.GrpcCode || "-"}</ValueWithLabel>
        </ColumnLayout> },
        { id: "a", label: "Attributes", content: <TgAttributes arn={t.TargetGroupArn} /> },
        { id: "t", label: "Tags", content: <ResourceTags arn={t.TargetGroupArn} /> },
      ]}
    />
    {m.is("hc") && <HealthCheckModal t={m.rows[0]} close={m.close} done={() => { m.close(); m.reload(); }} />}
    <ActionModal visible={m.is("delete")} onDismiss={m.close} header="Delete target groups" ok="Delete" danger onOk={async () => {
      for (const t of m.rows) await elb("DeleteTargetGroup", { TargetGroupArn: t.TargetGroupArn }); flash.notify({ type: "success", content: "Target groups deleted." }); m.reload();
    }}><Box>Delete {m.rows.map(t => t.TargetGroupName).join(", ")}?</Box></ActionModal>
  </>;
}
function TgAttributes({ arn }: { arn: string }) {
  const a = useAsync(async () => (await elb("DescribeTargetGroupAttributes", { TargetGroupArn: arn })).Attributes || [], [arn]);
  return <Table variant="embedded" items={a.data || []} loading={a.loading} columnDefinitions={[{ id: "k", header: "Attribute", cell: (x: any) => x.Key }, { id: "v", header: "Value", cell: (x: any) => x.Value }]} />;
}
function Targets({ tg }: { tg: any }) {
  const flash = useFlash();
  const th = useAsync(async () => (await elb("DescribeTargetHealth", { TargetGroupArn: tg.TargetGroupArn })).TargetHealthDescriptions || [], [tg.TargetGroupArn]);
  const [sel, setSel] = useState<any[]>([]);
  const [reg, setReg] = useState(false);
  return (
    <>
      <Table variant="embedded" items={th.data || []} loading={th.loading} trackBy={(x: any) => `${x.Target.Id}:${x.Target.Port}`} selectionType="multi" selectedItems={sel} onSelectionChange={e => setSel(e.detail.selectedItems)}
        header={<Header counter={`(${th.data?.length || 0})`} actions={<SpaceBetween direction="horizontal" size="xs">
          <Button iconName="refresh" ariaLabel="Refresh" onClick={() => th.reload()} />
          <Button disabled={!sel.length} onClick={async () => { try { await elb("DeregisterTargets", { TargetGroupArn: tg.TargetGroupArn, Targets: sel.map(x => x.Target) }); setSel([]); th.reload(); } catch (e) { flash.error(e); } }}>Deregister</Button>
          <Button variant="primary" onClick={() => setReg(true)}>Register targets</Button>
        </SpaceBetween>}>Registered targets</Header>}
        empty={<Box color="text-body-secondary">No targets are registered to this target group</Box>}
        columnDefinitions={[
          { id: "i", header: tg.TargetType === "ip" ? "IP address" : "Instance ID", cell: (x: any) => tg.TargetType === "instance" ? <Link href={instHref(x.Target.Id)}>{x.Target.Id}</Link> : x.Target.Id },
          { id: "p", header: "Port", cell: (x: any) => x.Target.Port },
          { id: "z", header: "Zone", cell: (x: any) => x.Target.AvailabilityZone || "-" },
          { id: "h", header: "Health status", cell: (x: any) => health(x.TargetHealth?.State) },
          { id: "d", header: "Health status details", cell: (x: any) => x.TargetHealth?.Description || x.TargetHealth?.Reason || "-" },
        ]} />
      {reg && <RegisterModal tg={tg} close={() => setReg(false)} done={() => { setReg(false); th.reload(); }} />}
    </>
  );
}
function RegisterModal({ tg, close, done }: { tg: any; close: () => void; done: () => void }) {
  const insts = useAsync(async () => (await allInstances([{ Name: "vpc-id", Values: [tg.VpcId] }, { Name: "instance-state-name", Values: ["running", "stopped"] }])), []);
  const [sel, setSel] = useState<any[]>([]);
  const [port, setPort] = useState(String(tg.Port || 80));
  const [ips, setIps] = useState("");
  return (
    <ActionModal visible onDismiss={close} header="Register targets" ok="Include as pending below and register" size="large" disabled={tg.TargetType === "instance" ? !sel.length : !ips.trim()} onOk={async () => {
      const targets = tg.TargetType === "instance" ? sel.map(i => ({ Id: i.InstanceId, Port: Number(port) })) : ips.split(/[\s,]+/).filter(Boolean).map(ip => ({ Id: ip, Port: Number(port) }));
      await elb("RegisterTargets", { TargetGroupArn: tg.TargetGroupArn, Targets: targets }); done();
    }}>
      {tg.TargetType === "instance"
        ? <Table variant="embedded" items={insts.data || []} loading={insts.loading} trackBy="InstanceId" selectionType="multi" selectedItems={sel} onSelectionChange={e => setSel(e.detail.selectedItems)}
            header={<Header variant="h3">Available instances</Header>} empty={<Box color="text-body-secondary">No instances in {tg.VpcId}</Box>}
            columnDefinitions={[{ id: "i", header: "Instance ID", cell: (i: any) => i.InstanceId }, { id: "n", header: "Name", cell: (i: any) => nameOf(i) || "-" }, { id: "s", header: "State", cell: (i: any) => i.State?.Name }, { id: "z", header: "Zone", cell: (i: any) => i.Placement?.AvailabilityZone }]} />
        : <FormField label="IPv4 addresses" description="One or more IP addresses in the VPC, separated by spaces or commas."><Input value={ips} onChange={e => setIps(e.detail.value)} placeholder="172.31.0.10 172.31.0.11" /></FormField>}
      <FormField label="Ports for the selected instances"><Input type="number" value={port} onChange={e => setPort(e.detail.value)} /></FormField>
    </ActionModal>
  );
}
function HealthCheckModal({ t, close, done }: { t: any; close: () => void; done: () => void }) {
  const [f, setF] = useState({ proto: t.HealthCheckProtocol || "HTTP", path: t.HealthCheckPath || "/", healthy: String(t.HealthyThresholdCount ?? 5), unhealthy: String(t.UnhealthyThresholdCount ?? 2), timeout: String(t.HealthCheckTimeoutSeconds ?? 5), interval: String(t.HealthCheckIntervalSeconds ?? 30), codes: t.Matcher?.HttpCode || "200" });
  return (
    <ActionModal visible onDismiss={close} header="Edit health check settings" ok="Save changes" size="medium" onOk={async () => {
      await elb("ModifyTargetGroup", { TargetGroupArn: t.TargetGroupArn, HealthCheckProtocol: f.proto, ...(f.proto.startsWith("HTTP") ? { HealthCheckPath: f.path, Matcher: { HttpCode: f.codes } } : {}), HealthyThresholdCount: Number(f.healthy), UnhealthyThresholdCount: Number(f.unhealthy), HealthCheckTimeoutSeconds: Number(f.timeout), HealthCheckIntervalSeconds: Number(f.interval) });
      done();
    }}><HealthCheckFields f={f} setF={setF} /></ActionModal>
  );
}
function HealthCheckFields({ f, setF }: { f: any; setF: (f: any) => void }) {
  return (
    <SpaceBetween size="m">
      <ColumnLayout columns={2}>
        <FormField label="Health check protocol"><Select selectedOption={{ value: f.proto, label: f.proto }} options={["HTTP", "HTTPS", "TCP"].map(p => ({ value: p, label: p }))} onChange={e => setF({ ...f, proto: e.detail.selectedOption.value })} /></FormField>
        {f.proto.startsWith("HTTP") && <FormField label="Health check path"><Input value={f.path} onChange={e => setF({ ...f, path: e.detail.value })} /></FormField>}
      </ColumnLayout>
      <ExpandableSection headerText="Advanced health check settings">
        <ColumnLayout columns={3}>
          <FormField label="Healthy threshold"><Input type="number" value={f.healthy} onChange={e => setF({ ...f, healthy: e.detail.value })} /></FormField>
          <FormField label="Unhealthy threshold"><Input type="number" value={f.unhealthy} onChange={e => setF({ ...f, unhealthy: e.detail.value })} /></FormField>
          <FormField label="Timeout (seconds)"><Input type="number" value={f.timeout} onChange={e => setF({ ...f, timeout: e.detail.value })} /></FormField>
          <FormField label="Interval (seconds)"><Input type="number" value={f.interval} onChange={e => setF({ ...f, interval: e.detail.value })} /></FormField>
          {f.proto.startsWith("HTTP") && <FormField label="Success codes"><Input value={f.codes} onChange={e => setF({ ...f, codes: e.detail.value })} /></FormField>}
        </ColumnLayout>
      </ExpandableSection>
    </SpaceBetween>
  );
}

export function CreateTargetGroup() {
  const nav = useNavigate();
  const flash = useFlash();
  const [sp] = useSearchParams();
  useCrumbs(crumbs("Target groups", { text: "Create target group", href: "#" }));
  const vpcs = useVpcs();
  const [type, setType] = useState(sp.get("type") || "instance");
  const [name, setName] = useState("");
  const [proto, setProto] = useState("HTTP");
  const [port, setPort] = useState("80");
  const [vpc, setVpc] = useState<any>(null);
  const [pv, setPv] = useState("HTTP1");
  const [hc, setHc] = useState<any>({ proto: "HTTP", path: "/", healthy: "5", unhealthy: "2", timeout: "5", interval: "30", codes: "200" });
  const [tags, setTags] = useState<KV[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  useEffect(() => { if (vpcs.data && !vpc) setVpc(vpcs.data.find((v: any) => v.raw.IsDefault) || vpcs.data[0]); }, [vpcs.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const lambda = type === "lambda";
  const submit = async () => {
    if (!/^[a-zA-Z0-9-]{1,32}$/.test(name)) { setErr(new Error("Target group name must be 1–32 characters: letters, numbers and hyphens.")); return; }
    setBusy(true); setErr(null);
    try {
      const t = toTagSet(tags);
      await elb("CreateTargetGroup", {
        Name: name, TargetType: type, ...(lambda ? {} : { Protocol: proto, Port: Number(port), VpcId: vpc?.value, ...(proto.startsWith("HTTP") ? { ProtocolVersion: pv } : {}) }),
        HealthCheckProtocol: lambda ? undefined : hc.proto, ...(hc.proto.startsWith("HTTP") || lambda ? { HealthCheckPath: hc.path, Matcher: { HttpCode: hc.codes } } : {}),
        HealthyThresholdCount: Number(hc.healthy), UnhealthyThresholdCount: Number(hc.unhealthy), HealthCheckTimeoutSeconds: Number(hc.timeout), HealthCheckIntervalSeconds: Number(hc.interval),
        ...(t.length ? { Tags: t } : {}),
      });
      flash.notify({ type: "success", content: `Successfully created target group: ${name}. Select it in the list to register targets.` });
      nav("/ec2/target-groups");
    } catch (e) { setErr(e); window.scrollTo(0, 0); } finally { setBusy(false); }
  };
  return (
    <ContentLayout header={<Header variant="h1" description="Your load balancer routes requests to the targets in a target group and performs health checks on the targets.">Create target group</Header>}>
      <Form errorText={err ? <ErrorAlert error={err} /> : undefined} actions={<SpaceBetween direction="horizontal" size="xs"><Button variant="link" onClick={() => nav(-1)}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>Create target group</Button></SpaceBetween>}>
        <SpaceBetween size="l">
          <Container header={<Header variant="h2">Basic configuration</Header>}>
            <SpaceBetween size="l">
              <FormField label="Choose a target type">
                <Tiles value={type} onChange={e => setType(e.detail.value)} columns={2} items={[
                  { value: "instance", label: "Instances", description: "Supports load balancing to instances within a specific VPC." },
                  { value: "ip", label: "IP addresses", description: "Supports load balancing to VPC and on-premises resources." },
                  { value: "lambda", label: "Lambda function", description: "Facilitates routing to a single Lambda function." },
                  { value: "alb", label: "Application Load Balancer", description: "Offers the flexibility for a Network Load Balancer to accept and route TCP requests within a specific VPC." },
                ]} />
              </FormField>
              <FormField label="Target group name" constraintText="A maximum of 32 alphanumeric characters including hyphens are allowed, but the name must not begin or end with a hyphen."><Input value={name} onChange={e => setName(e.detail.value)} /></FormField>
              {!lambda && <ColumnLayout columns={2}>
                <FormField label="Protocol"><Select selectedOption={{ value: proto, label: proto }} options={["HTTP", "HTTPS", "TCP", "TLS", "UDP", "TCP_UDP", "GENEVE"].map(p => ({ value: p, label: p }))} onChange={e => setProto(e.detail.selectedOption.value!)} /></FormField>
                <FormField label="Port"><Input type="number" value={port} onChange={e => setPort(e.detail.value)} /></FormField>
              </ColumnLayout>}
              {!lambda && <FormField label="VPC"><Select selectedOption={vpc} options={vpcs.data || []} onChange={e => setVpc(e.detail.selectedOption)} /></FormField>}
              {!lambda && proto.startsWith("HTTP") && <FormField label="Protocol version"><RadioGroup value={pv} onChange={e => setPv(e.detail.value)} items={[{ value: "HTTP1", label: "HTTP1", description: "Send requests to targets using HTTP/1.1." }, { value: "HTTP2", label: "HTTP2", description: "Send requests to targets using HTTP/2." }, { value: "GRPC", label: "gRPC", description: "Send requests to targets using gRPC." }]} /></FormField>}
            </SpaceBetween>
          </Container>
          <Container header={<Header variant="h2" description="The associated load balancer periodically sends requests, per the settings below, to the registered targets to test their status.">Health checks</Header>}>
            <HealthCheckFields f={hc} setF={setHc} />
          </Container>
          <Container header={<Header variant="h2">Tags - optional</Header>}><Tags tags={tags} onChange={setTags} /></Container>
        </SpaceBetween>
      </Form>
    </ContentLayout>
  );
}

