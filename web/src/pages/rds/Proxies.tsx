import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import SpaceBetween from "@cloudscape-design/components/space-between";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Select from "@cloudscape-design/components/select";
import Multiselect from "@cloudscape-design/components/multiselect";
import Tiles from "@cloudscape-design/components/tiles";
import Checkbox from "@cloudscape-design/components/checkbox";
import Button from "@cloudscape-design/components/button";
import Box from "@cloudscape-design/components/box";
import Link from "@cloudscape-design/components/link";
import Table from "@cloudscape-design/components/table";
import Spinner from "@cloudscape-design/components/spinner";
import Alert from "@cloudscape-design/components/alert";
import { useCrumbs } from "../../App";
import { api } from "../../api";
import { ErrorAlert, useAsync, useFlash, ValueWithLabel, Copyable } from "../../common";
import { useVpcs, useSubnets, useSgs } from "../ec2/lib";
import { ResourcePage, ActionModal } from "../ec2/ResourcePage";
import { rds, rdsAll, crumbs, Status, dbHref, clusterHref, fmtWhen, enabled } from "./lib";
import { TagsTab } from "./DatabaseDetail";

const opt = (v: string, l?: string, d?: string) => ({ value: v, label: l || v, description: d });
const href = (n: string) => `#/rds/proxies/${encodeURIComponent(n)}`;

export function Proxies() {
  useCrumbs(crumbs({ text: "Proxies" }));
  const flash = useFlash();
  const [del, setDel] = useState<{ p: any; r: () => void } | null>(null);
  return (
    <>
      <ResourcePage<any> title="Proxies" load={() => rdsAll("DescribeDBProxies", "DBProxies")} trackBy="DBProxyName" multi={false} poll={p => /creating|modifying|deleting/.test(p.Status)}
        description="RDS Proxy makes applications more scalable, more resilient to database failures, and more secure."
        actions={[{ id: "delete", text: "Delete", run: (s, r) => setDel({ p: s[0], r }) }]}
        create={{ text: "Create proxy", href: "#/rds/proxies/create" }}
        columns={[
          { id: "n", header: "Proxy identifier", cell: p => <Link href={href(p.DBProxyName)}>{p.DBProxyName}</Link>, sortingField: "DBProxyName" },
          { id: "e", header: "Engine family", cell: p => p.EngineFamily },
          { id: "s", header: "Status", cell: p => <Status s={p.Status} /> },
          { id: "ep", header: "Proxy endpoint", cell: p => p.Endpoint },
          { id: "v", header: "VPC", cell: p => p.VpcId || "-" },
          { id: "c", header: "Created", cell: p => fmtWhen(p.CreatedDate) },
        ]} />
      {del && <ActionModal visible danger onDismiss={() => setDel(null)} header={`Delete ${del.p.DBProxyName}?`} ok="Delete" onOk={async () => {
        await rds("DeleteDBProxy", { DBProxyName: del.p.DBProxyName }); flash.notify({ type: "success", content: `Deleting proxy ${del.p.DBProxyName}.` }); del.r();
      }}><Box>Applications that connect through this proxy will lose connectivity.</Box></ActionModal>}
    </>
  );
}

export function CreateProxy() {
  useCrumbs(crumbs({ text: "Proxies", href: "#/rds/proxies" }, { text: "Create proxy" }));
  const nav = useNavigate();
  const flash = useFlash();
  const [f, setF] = useState<any>({ family: "MYSQL", name: "", idle: "30", tls: false, target: null, pool: "100", borrow: "120", secrets: [], iamAuth: "DISABLED", role: null, newRole: true, subnets: [], sgs: [], debug: false });
  const dbs = useAsync(async () => {
    const [i, c] = await Promise.all([rdsAll("DescribeDBInstances", "DBInstances"), rdsAll("DescribeDBClusters", "DBClusters")]);
    return [
      ...c.map((x: any) => ({ ...opt(`cluster:${x.DBClusterIdentifier}`, x.DBClusterIdentifier, `Cluster · ${x.Engine}`), engine: x.Engine })),
      ...i.filter((x: any) => !x.DBClusterIdentifier).map((x: any) => ({ ...opt(`instance:${x.DBInstanceIdentifier}`, x.DBInstanceIdentifier, `Instance · ${x.Engine}`), engine: x.Engine, vpc: x.DBSubnetGroup?.VpcId })),
    ];
  }, []);
  const famOk = (e: string) => f.family === "POSTGRESQL" ? /postgres/.test(e) : f.family === "SQLSERVER" ? /sqlserver/.test(e) : /mysql|mariadb/.test(e);
  const secrets = useAsync(async () => ((await api.call("secretsmanager", "ListSecrets")).SecretList || []).map((s: any) => opt(s.ARN, s.Name)), []);
  const roles = useAsync(async () => ((await api.call("iam", "ListRoles")).Roles || []).map((r: any) => opt(r.Arn, r.RoleName)), []);
  const vpcs = useVpcs();
  const vpc = vpcs.data?.find((v: any) => v.raw.IsDefault) || vpcs.data?.[0];
  const subnets = useSubnets(vpc?.value);
  const sgs = useSgs(vpc?.value);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const set = (k: string) => (v: any) => setF({ ...f, [k]: v });
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      let roleArn = f.role?.value;
      if (f.newRole) {
        const rn = `rds-proxy-role-${Date.now()}`;
        const r = await api.call("iam", "CreateRole", { RoleName: rn, AssumeRolePolicyDocument: JSON.stringify({ Version: "2012-10-17", Statement: [{ Effect: "Allow", Principal: { Service: "rds.amazonaws.com" }, Action: "sts:AssumeRole" }] }) });
        roleArn = r.Role.Arn;
      }
      const subnetIds = f.subnets.length ? f.subnets.map((s: any) => s.value) : (subnets.data || []).map((s: any) => s.value);
      await rds("CreateDBProxy", {
        DBProxyName: f.name, EngineFamily: f.family, RoleArn: roleArn, IdleClientTimeout: Number(f.idle) * 60, RequireTLS: f.tls, DebugLogging: f.debug,
        Auth: f.secrets.map((s: any) => ({ AuthScheme: "SECRETS", SecretArn: s.value, IAMAuth: f.iamAuth })),
        VpcSubnetIds: subnetIds, ...(f.sgs.length ? { VpcSecurityGroupIds: f.sgs.map((s: any) => s.value) } : {}),
      });
      if (f.target) {
        const [kind, id] = f.target.value.split(":");
        for (let k = 0; k < 30; k++) {
          const st = (await rds("DescribeDBProxies", { DBProxyName: f.name })).DBProxies?.[0]?.Status;
          if (st === "available") break;
          await new Promise(r => setTimeout(r, 2000));
        }
        await rds("ModifyDBProxyTargetGroup", { DBProxyName: f.name, TargetGroupName: "default", ConnectionPoolConfig: { MaxConnectionsPercent: Number(f.pool), ConnectionBorrowTimeout: Number(f.borrow) } }).catch(() => {});
        await rds("RegisterDBProxyTargets", { DBProxyName: f.name, ...(kind === "cluster" ? { DBClusterIdentifiers: [id] } : { DBInstanceIdentifiers: [id] }) });
      }
      flash.notify({ type: "success", content: `Creating proxy ${f.name}.` });
      nav("/rds/proxies");
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <ContentLayout header={<Header variant="h1">Create proxy</Header>}>
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Proxy configuration</Header>}>
          <SpaceBetween size="l">
            <FormField label="Engine family"><Tiles value={f.family} onChange={e => setF({ ...f, family: e.detail.value, target: null })} items={[{ value: "MYSQL", label: "MariaDB and MySQL" }, { value: "POSTGRESQL", label: "PostgreSQL" }, { value: "SQLSERVER", label: "SQL Server" }]} /></FormField>
            <FormField label="Proxy identifier" constraintText="1 to 60 letters, numbers or hyphens. Must begin with a letter."><Input value={f.name} onChange={e => set("name")(e.detail.value)} /></FormField>
            <FormField label="Idle client connection timeout (minutes)" description="A client connection is closed after it's idle for this long."><Input type="number" value={f.idle} onChange={e => set("idle")(e.detail.value)} /></FormField>
          </SpaceBetween>
        </Container>
        <Container header={<Header variant="h2">Target group configuration</Header>}>
          <SpaceBetween size="l">
            <FormField label="Database"><Select selectedOption={f.target} options={(dbs.data || []).filter((d: any) => famOk(d.engine))} onChange={e => set("target")(e.detail.selectedOption)} placeholder="Choose a database" statusType={dbs.loading ? "loading" : "finished"} empty="No compatible databases" /></FormField>
            <FormField label="Connection pool maximum connections (%)"><Input type="number" value={f.pool} onChange={e => set("pool")(e.detail.value)} /></FormField>
            <FormField label="Connection borrow timeout (seconds)"><Input type="number" value={f.borrow} onChange={e => set("borrow")(e.detail.value)} /></FormField>
          </SpaceBetween>
        </Container>
        <Container header={<Header variant="h2">Authentication</Header>}>
          <SpaceBetween size="l">
            <FormField label="IAM role">
              <SpaceBetween size="xs">
                <Checkbox checked={f.newRole} onChange={e => set("newRole")(e.detail.checked)}>Create IAM role</Checkbox>
                {!f.newRole && <Select selectedOption={f.role} options={roles.data || []} onChange={e => set("role")(e.detail.selectedOption)} filteringType="auto" placeholder="Choose a role" />}
              </SpaceBetween>
            </FormField>
            <FormField label="Secrets Manager secrets" description="Secrets that hold database user credentials the proxy can use."><Multiselect selectedOptions={f.secrets} options={secrets.data || []} onChange={e => set("secrets")(e.detail.selectedOptions)} placeholder="Choose secrets" empty="No secrets. Create one in Secrets Manager." /></FormField>
            <FormField label="IAM authentication"><Select selectedOption={opt(f.iamAuth, f.iamAuth === "REQUIRED" ? "Required" : "Not allowed")} options={[opt("DISABLED", "Not allowed"), opt("REQUIRED", "Required")]} onChange={e => set("iamAuth")(e.detail.selectedOption.value)} /></FormField>
            <Checkbox checked={f.tls} onChange={e => set("tls")(e.detail.checked)}>Require Transport Layer Security</Checkbox>
          </SpaceBetween>
        </Container>
        <Container header={<Header variant="h2">Connectivity</Header>}>
          <SpaceBetween size="l">
            <FormField label="Subnets" description={`VPC ${vpc?.value || ""}. Leave empty to use all subnets.`}><Multiselect selectedOptions={f.subnets} options={subnets.data || []} onChange={e => set("subnets")(e.detail.selectedOptions)} placeholder="All subnets" /></FormField>
            <FormField label="VPC security groups"><Multiselect selectedOptions={f.sgs} options={sgs.data || []} onChange={e => set("sgs")(e.detail.selectedOptions)} placeholder="Default" /></FormField>
          </SpaceBetween>
        </Container>
        <Container header={<Header variant="h2">Additional configuration</Header>}>
          <Checkbox checked={f.debug} onChange={e => set("debug")(e.detail.checked)}>Activate enhanced logging</Checkbox>
        </Container>
        {!f.secrets.length && <Alert type="warning">Choose at least one Secrets Manager secret. RDS Proxy uses it to connect to the database.</Alert>}
        <ErrorAlert error={err} />
        <Box float="right"><SpaceBetween direction="horizontal" size="xs">
          <Button variant="link" onClick={() => nav(-1)}>Cancel</Button>
          <Button variant="primary" loading={busy} disabled={!f.name || !f.secrets.length || (!f.newRole && !f.role)} onClick={submit}>Create proxy</Button>
        </SpaceBetween></Box>
      </SpaceBetween>
    </ContentLayout>
  );
}

export function ProxyDetail() {
  const { name = "" } = useParams();
  useCrumbs(crumbs({ text: "Proxies", href: "#/rds/proxies" }, { text: name }));
  const d = useAsync(async () => {
    const p = (await rds("DescribeDBProxies", { DBProxyName: name })).DBProxies[0];
    const [tg, t, ep] = await Promise.all([
      rds("DescribeDBProxyTargetGroups", { DBProxyName: name }).then(r => r.TargetGroups || []).catch(() => []),
      rds("DescribeDBProxyTargets", { DBProxyName: name }).then(r => r.Targets || []).catch(() => []),
      rds("DescribeDBProxyEndpoints", { DBProxyName: name }).then(r => r.DBProxyEndpoints || []).catch(() => []),
    ]);
    return { p, tg, t, ep };
  }, [name]);
  if (d.error) return <ErrorAlert error={d.error} />;
  if (!d.data) return <Box textAlign="center" padding="xl"><Spinner size="large" /></Box>;
  const { p, tg, t, ep } = d.data;
  const V = ValueWithLabel;
  return (
    <ContentLayout header={<Header variant="h1" actions={<Button iconName="refresh" ariaLabel="Refresh" onClick={() => d.reload()} />}>{name}</Header>}>
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Proxy configurations</Header>}>
          <ColumnLayout columns={3} variant="text-grid">
            <V label="Proxy identifier">{p.DBProxyName}</V><V label="Engine family">{p.EngineFamily}</V><V label="Status"><Status s={p.Status} /></V>
            <V label="Proxy endpoint"><Copyable text={p.Endpoint} /></V><V label="ARN"><Copyable text={p.DBProxyArn} /></V><V label="IAM role">{String(p.RoleArn).split("/").pop()}</V>
            <V label="Idle client connection timeout">{Math.round((p.IdleClientTimeout || 0) / 60)} minutes</V><V label="Require TLS">{enabled(p.RequireTLS)}</V><V label="Enhanced logging">{enabled(p.DebugLogging)}</V>
            <V label="Subnets">{(p.VpcSubnetIds || []).join(", ")}</V><V label="Security groups">{(p.VpcSecurityGroupIds || []).join(", ") || "-"}</V><V label="Created">{fmtWhen(p.CreatedDate)}</V>
          </ColumnLayout>
        </Container>
        <Table variant="container" header={<Header variant="h2" counter={`(${tg.length})`}>Target groups</Header>} items={tg}
          columnDefinitions={[
            { id: "n", header: "Target group", cell: (g: any) => g.TargetGroupName }, { id: "s", header: "Status", cell: (g: any) => <Status s={g.Status} /> },
            { id: "c", header: "Max connections", cell: (g: any) => `${g.ConnectionPoolConfig?.MaxConnectionsPercent ?? "-"}%` },
            { id: "b", header: "Borrow timeout", cell: (g: any) => `${g.ConnectionPoolConfig?.ConnectionBorrowTimeout ?? "-"} s` },
          ]} />
        <Table variant="container" header={<Header variant="h2" counter={`(${t.length})`}>Targets</Header>} items={t} empty={<Box color="text-body-secondary">No registered targets.</Box>}
          columnDefinitions={[
            { id: "n", header: "Database", cell: (x: any) => x.Type === "TRACKED_CLUSTER" ? <Link href={clusterHref(x.RdsResourceId)}>{x.RdsResourceId}</Link> : <Link href={dbHref(x.RdsResourceId)}>{x.RdsResourceId}</Link> },
            { id: "t", header: "Type", cell: (x: any) => x.Type }, { id: "e", header: "Endpoint", cell: (x: any) => x.Endpoint ? `${x.Endpoint}:${x.Port}` : "-" },
            { id: "h", header: "Health", cell: (x: any) => x.TargetHealth?.State || "-" },
          ]} />
        <Table variant="container" header={<Header variant="h2" counter={`(${ep.length})`}>Proxy endpoints</Header>} items={ep} empty={<Box color="text-body-secondary">Only the default endpoint.</Box>}
          columnDefinitions={[{ id: "n", header: "Name", cell: (x: any) => x.DBProxyEndpointName }, { id: "e", header: "Endpoint", cell: (x: any) => x.Endpoint }, { id: "r", header: "Target role", cell: (x: any) => x.TargetRole }, { id: "s", header: "Status", cell: (x: any) => <Status s={x.Status} /> }]} />
        <TagsTab arnStr={p.DBProxyArn} />
      </SpaceBetween>
    </ContentLayout>
  );
}
