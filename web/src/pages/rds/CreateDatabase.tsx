import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import SpaceBetween from "@cloudscape-design/components/space-between";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Select from "@cloudscape-design/components/select";
import Multiselect from "@cloudscape-design/components/multiselect";
import Tiles from "@cloudscape-design/components/tiles";
import RadioGroup from "@cloudscape-design/components/radio-group";
import Checkbox from "@cloudscape-design/components/checkbox";
import Button from "@cloudscape-design/components/button";
import Box from "@cloudscape-design/components/box";
import Alert from "@cloudscape-design/components/alert";
import ExpandableSection from "@cloudscape-design/components/expandable-section";
import Table from "@cloudscape-design/components/table";
import { useCrumbs } from "../../App";
import { ErrorAlert, useFlash } from "../../common";
import { Tags } from "../s3/fields";
import { toTagSet, type KV } from "../s3/lib";
import { ec2, useVpcs, useSgs } from "../ec2/lib";
import { rds, crumbs, ENGINES, CLASSES, STORAGE_TYPES, classSpec, useSubnetGroups, useParamGroups, useOptionGroups, useEngineVersions, isAurora, isMysqlish, isPg, type EngineKey, dbHref, clusterHref } from "./lib";

const LOGS: Record<string, string[]> = {
  mysql: ["audit", "error", "general", "slowquery"], mariadb: ["audit", "error", "general", "slowquery"], "aurora-mysql": ["audit", "error", "general", "slowquery"],
  postgres: ["postgresql", "upgrade"], "aurora-postgresql": ["postgresql"],
};
const opt = (v: string, l?: string, d?: string) => ({ value: v, label: l || v, description: d });

export function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return <Container header={<Header variant="h2" description={description}>{title}</Header>}><SpaceBetween size="l">{children}</SpaceBetween></Container>;
}

export function ClassPicker({ aurora, value, onChange, free }: { aurora?: boolean; value: string; onChange: (v: string) => void; free?: boolean }) {
  const groupOf = (c: string) => c === "db.serverless" ? "serverless" : CLASSES.burstable.includes(c) ? "burstable" : CLASSES.memory.includes(c) ? "memory" : "standard";
  const [g, setG] = useState(groupOf(value));
  const list = g === "serverless" ? ["db.serverless"] : free ? ["db.t3.micro", "db.t4g.micro"] : CLASSES[g];
  return (
    <SpaceBetween size="s">
      <FormField label="DB instance class" info={<Box variant="small" color="text-body-secondary">Hide filters</Box>}>
        <RadioGroup value={g} onChange={e => { setG(e.detail.value); const l = e.detail.value === "serverless" ? ["db.serverless"] : CLASSES[e.detail.value]; onChange(l[0]); }} items={[
          ...(aurora ? [{ value: "serverless", label: "Serverless v2" }] : [{ value: "standard", label: "Standard classes (includes m classes)", disabled: free }]),
          { value: "memory", label: "Memory optimized classes (includes r and x classes)", disabled: free },
          { value: "burstable", label: "Burstable classes (includes t classes)" },
        ]} />
      </FormField>
      <Select selectedOption={opt(value, value, classSpec(value))} options={list.map(c => opt(c, c, classSpec(c) || (c === "db.serverless" ? "Aurora capacity units scale automatically" : undefined)))} onChange={e => onChange(e.detail.selectedOption.value!)} />
    </SpaceBetween>
  );
}

export default function CreateDatabase() {
  useCrumbs(crumbs({ text: "Databases", href: "#/rds/databases" }, { text: "Create database" }));
  const nav = useNavigate();
  const flash = useFlash();
  const [method, setMethod] = useState("standard");
  const [engine, setEngine] = useState<EngineKey>("mysql");
  const [edition, setEdition] = useState<string>("");
  const eng = ENGINES.find(e => e.key === engine)!;
  const engineName = eng.editions ? edition || eng.editions[0].value : engine;
  const aurora = isAurora(engine);
  const versions = useEngineVersions(engineName);
  const [version, setVersion] = useState<any>(null);
  useEffect(() => { const l = versions.data || []; setVersion(l.length ? l[l.length - 1] : null); }, [versions.data]);
  const [template, setTemplate] = useState("dev");
  const free = template === "free";
  const [deploy, setDeploy] = useState("single");
  const [id, setId] = useState(aurora ? "database-1" : "database-1");
  const [user, setUser] = useState(eng.user);
  useEffect(() => { setUser(eng.user); setPort(String(eng.port)); setEdition(""); setParam(null); setOptGroup(null); setLogs([]); }, [engine]); // eslint-disable-line react-hooks/exhaustive-deps
  const [credMode, setCredMode] = useState("self");
  const [autoPw, setAutoPw] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [auroraStorage, setAuroraStorage] = useState("aurora");
  const [cls, setCls] = useState("db.t3.micro");
  useEffect(() => { if (free) { setCls("db.t3.micro"); setDeploy("single"); } else if (template === "prod" && !aurora) { setCls("db.m5.large"); setDeploy("multi"); } else if (aurora) setCls(template === "prod" ? "db.r6g.large" : "db.t3.medium"); }, [template, aurora]); // eslint-disable-line react-hooks/exhaustive-deps
  const [storage, setStorage] = useState({ type: "gp3", size: "20", iops: "3000", auto: true, max: "1000" });
  useEffect(() => { if (free) setStorage(s => ({ ...s, type: "gp2", size: "20" })); }, [free]);
  const vpcs = useVpcs();
  const [vpc, setVpc] = useState<any>(null);
  useEffect(() => { if (!vpc && vpcs.data?.length) setVpc(vpcs.data.find((v: any) => v.raw.IsDefault) || vpcs.data[0]); }, [vpcs.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const subnetGroups = useSubnetGroups();
  const sgOptions = (subnetGroups.data || []).filter((g: any) => !vpc || g.raw.VpcId === vpc.value);
  const [subnetGroup, setSubnetGroup] = useState<any>(null);
  useEffect(() => { if (!subnetGroup || !sgOptions.some((g: any) => g.value === subnetGroup.value)) setSubnetGroup(sgOptions[0] || null); }, [subnetGroups.data, vpc]); // eslint-disable-line react-hooks/exhaustive-deps
  const [publicAccess, setPublicAccess] = useState("no");
  const [sgMode, setSgMode] = useState("existing");
  const sgs = useSgs(vpc?.value);
  const [sgSel, setSgSel] = useState<any[]>([]);
  useEffect(() => { const d = (sgs.data || []).find((g: any) => g.label === "default"); setSgSel(d ? [d] : []); }, [sgs.data]);
  const [newSg, setNewSg] = useState("");
  const [az, setAz] = useState<any>({ value: "", label: "No preference" });
  const [ca, setCa] = useState<any>(opt("rds-ca-rsa2048-g1", "rds-ca-rsa2048-g1 (default)", "Expiry: May 26, 2061"));
  const [port, setPort] = useState(String(eng.port));
  const [tags, setTags] = useState<KV[]>([]);
  const [auth, setAuth] = useState("password");
  const [pi, setPi] = useState(false);
  const [em, setEm] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [dbName, setDbName] = useState("");
  const family = version?.DBParameterGroupFamily;
  const params = useParamGroups(family);
  const cparams = useParamGroups(aurora ? family : undefined, true);
  const [param, setParam] = useState<any>(null);
  const [cparam, setCparam] = useState<any>(null);
  const ogs = useOptionGroups(aurora ? undefined : engineName, version?.MajorEngineVersion);
  const [optGroup, setOptGroup] = useState<any>(null);
  const [backup, setBackup] = useState({ on: true, days: "7", copyTags: true, window: "none", start: "03:00", dur: "0.5" });
  useEffect(() => { if (free) setBackup(b => ({ ...b, days: "1" })); }, [free]);
  const [encrypt, setEncrypt] = useState(true);
  const [kms, setKms] = useState("(default) aws/rds");
  const [maint, setMaint] = useState({ autoMinor: true, window: "none", day: "mon", start: "08:00", dur: "0.5" });
  const [delProt, setDelProt] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const easy = method === "easy";
  useEffect(() => { setDelProt(template === "prod"); }, [template]);

  const versionOpts = useMemo(() => (versions.data || []).map((v: any) => opt(v.EngineVersion, v.DBEngineVersionDescription || `${eng.family} ${v.EngineVersion}`)), [versions.data, eng.family]);
  const pwError = credMode === "self" && !autoPw && (pw.length > 0 && pw.length < 8 ? "Must be at least 8 characters." : /[\/"@ ]/.test(pw) ? "Can't contain / ' \" @ or spaces." : pw2 && pw !== pw2 ? "Passwords don't match." : "");
  const idError = id && !/^[a-zA-Z][a-zA-Z0-9-]{0,62}$/.test(id) ? "Must begin with a letter and contain only ASCII letters, digits, and hyphens." : /--|-$/.test(id) ? "Can't end with a hyphen or contain two consecutive hyphens." : "";

  const windowStr = (start: string, dur: string, day?: string) => {
    const [h, m] = start.split(":").map(Number);
    const end = new Date(Date.UTC(2000, 0, 1, h, m) + Number(dur) * 3600e3);
    const e = `${String(end.getUTCHours()).padStart(2, "0")}:${String(end.getUTCMinutes()).padStart(2, "0")}`;
    return day ? `${day}:${start}-${day}:${e}` : `${start}-${e}`;
  };

  const submit = async () => {
    setErr(null);
    if (!id || idError) return setErr(new Error("Enter a valid DB identifier."));
    if (credMode === "self" && !autoPw && (!pw || pwError || pw !== pw2)) return setErr(new Error("Enter and confirm a valid master password."));
    setBusy(true);
    try {
      let password = pw;
      if (credMode === "self" && autoPw) password = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"[b % 57]).join("");
      let sgIds = sgSel.map(s => s.value);
      if (!easy && sgMode === "new" && newSg) {
        const g = await ec2("CreateSecurityGroup", { GroupName: newSg, Description: "Created by RDS management console", VpcId: vpc?.value });
        await ec2("AuthorizeSecurityGroupIngress", { GroupId: g.GroupId, IpPermissions: [{ IpProtocol: "tcp", FromPort: Number(port), ToPort: Number(port), IpRanges: [{ CidrIp: "0.0.0.0/0" }] }] });
        sgIds = [g.GroupId];
      }
      const creds = credMode === "secrets" ? { ManageMasterUserPassword: true } : { MasterUserPassword: password };
      const tagList = toTagSet(tags);
      const common = {
        Engine: engineName, ...(version ? { EngineVersion: version.EngineVersion } : {}),
        ...(subnetGroup ? { DBSubnetGroupName: subnetGroup.value } : {}), ...(sgIds.length ? { VpcSecurityGroupIds: sgIds } : {}),
        ...(tagList.length ? { Tags: tagList } : {}),
      };
      const backupWin = !easy && backup.window === "choose" ? { PreferredBackupWindow: windowStr(backup.start, backup.dur) } : {};
      const maintWin = !easy && maint.window === "choose" ? { PreferredMaintenanceWindow: windowStr(maint.start, maint.dur, maint.day) } : {};
      const instCommon = {
        DBInstanceClass: cls, PubliclyAccessible: publicAccess === "yes", AutoMinorVersionUpgrade: maint.autoMinor,
        ...(az.value && deploy !== "multi" ? { AvailabilityZone: az.value } : {}), CACertificateIdentifier: ca.value,
        ...(param ? { DBParameterGroupName: param.value } : {}), EnablePerformanceInsights: pi, ...(em ? { MonitoringInterval: 60 } : {}),
      };
      if (aurora) {
        await rds("CreateDBCluster", {
          DBClusterIdentifier: id, ...common, MasterUsername: user, ...creds, Port: Number(port), ...(dbName ? { DatabaseName: dbName } : {}),
          ...(cparam ? { DBClusterParameterGroupName: cparam.value } : {}), BackupRetentionPeriod: Number(backup.days), CopyTagsToSnapshot: backup.copyTags,
          StorageEncrypted: encrypt, DeletionProtection: delProt, EnableIAMDatabaseAuthentication: auth === "iam",
          ...(auroraStorage === "iopt" ? { StorageType: "aurora-iopt1" } : {}), ...(logs.length ? { EnableCloudwatchLogsExports: logs } : {}),
          ...(cls === "db.serverless" ? { ServerlessV2ScalingConfiguration: { MinCapacity: 0.5, MaxCapacity: 16 } } : {}), ...backupWin, ...maintWin,
        });
        await rds("CreateDBInstance", { DBInstanceIdentifier: `${id}-instance-1`, DBClusterIdentifier: id, Engine: engineName, ...instCommon, ...(tagList.length ? { Tags: tagList } : {}) });
        if (deploy === "multi") await rds("CreateDBInstance", { DBInstanceIdentifier: `${id}-instance-2`, DBClusterIdentifier: id, Engine: engineName, ...instCommon, AvailabilityZone: undefined, ...(tagList.length ? { Tags: tagList } : {}) });
      } else {
        const io = storage.type.startsWith("io");
        await rds("CreateDBInstance", {
          DBInstanceIdentifier: id, ...common, ...instCommon, MasterUsername: user, ...creds, Port: Number(port),
          ...(dbName ? { DBName: dbName } : {}), AllocatedStorage: Number(storage.size), StorageType: storage.type,
          ...(io || (storage.type === "gp3" && Number(storage.size) >= 400) ? { Iops: Number(storage.iops) } : {}),
          ...(storage.auto && !free ? { MaxAllocatedStorage: Number(storage.max) } : {}),
          MultiAZ: deploy === "multi", ...(optGroup ? { OptionGroupName: optGroup.value } : {}),
          BackupRetentionPeriod: backup.on ? Number(backup.days) : 0, CopyTagsToSnapshot: backup.copyTags, StorageEncrypted: encrypt,
          DeletionProtection: delProt, EnableIAMDatabaseAuthentication: auth === "iam", ...(logs.length ? { EnableCloudwatchLogsExports: logs } : {}),
          ...(isPg(engine) || isMysqlish(engine) ? {} : { LicenseModel: engine.startsWith("sqlserver") ? "license-included" : engine.startsWith("db2") ? "bring-your-own-license" : "bring-your-own-license" }),
          ...backupWin, ...maintWin,
        });
      }
      flash.notify({
        type: credMode === "self" && autoPw ? "info" : "success", header: `Creating database ${id}`,
        content: credMode === "self" && autoPw ? <>Your generated master password is <code>{password}</code>. Copy it now; it isn't shown again.</> : "Your database might take a few minutes to launch.",
        action: <Button href={aurora ? clusterHref(id) : dbHref(id)}>View details</Button>,
      });
      nav("/rds/databases");
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };

  const engineTiles = ENGINES.map(e => ({ value: e.key, label: e.label }));
  return (
    <ContentLayout header={<Header variant="h1">Create database</Header>}>
      <SpaceBetween size="l">
        <Section title="Choose a database creation method">
          <Tiles value={method} onChange={e => setMethod(e.detail.value)} items={[
            { value: "standard", label: "Standard create", description: "You set all of the configuration options, including ones for availability, security, backups, and maintenance." },
            { value: "easy", label: "Easy create", description: "Use recommended best-practice configurations. Some configuration options can be changed after the database is created." },
          ]} />
        </Section>
        <Section title="Engine options">
          <FormField label="Engine type"><Tiles columns={4} value={engine} onChange={e => setEngine(e.detail.value as EngineKey)} items={engineTiles} /></FormField>
          {!(isPg(engine) || isMysqlish(engine)) && <Alert type="info">The emulator only models the API for {eng.family}; no database server runs. MySQL, MariaDB, PostgreSQL and Aurora run as real servers on 127.0.0.1.</Alert>}
          {eng.editions && <FormField label="Edition"><RadioGroup value={engineName} onChange={e => setEdition(e.detail.value)} items={eng.editions} /></FormField>}
          {!easy && (
            <FormField label="Engine version" description={versions.loading ? undefined : `${(versions.data || []).length} versions available`}>
              <Select selectedOption={version ? opt(version.EngineVersion, version.DBEngineVersionDescription || version.EngineVersion) : null} placeholder="Choose a version" filteringType="auto"
                statusType={versions.loading ? "loading" : "finished"} options={versionOpts}
                onChange={e => setVersion((versions.data || []).find((v: any) => v.EngineVersion === e.detail.selectedOption.value))} />
            </FormField>
          )}
        </Section>
        {easy ? (
          <Section title="DB instance size">
            <Tiles value={template} onChange={e => setTemplate(e.detail.value)} items={[
              { value: "prod", label: "Production", description: aurora ? "db.r6g.large · 2 vCPUs · 16 GiB RAM" : "db.m5.large · 2 vCPUs · 8 GiB RAM · 500 GiB" },
              { value: "dev", label: "Dev/Test", description: aurora ? "db.t3.medium · 2 vCPUs · 4 GiB RAM" : "db.t3.micro · 2 vCPUs · 1 GiB RAM · 20 GiB" },
              ...(aurora ? [] : [{ value: "free", label: "Free tier", description: "db.t3.micro · 2 vCPUs · 1 GiB RAM · 20 GiB" }]),
            ]} />
          </Section>
        ) : (
          <Section title="Templates" description="Choose a sample template to meet your use case.">
            <Tiles value={template} onChange={e => setTemplate(e.detail.value)} items={[
              { value: "prod", label: "Production", description: "Use defaults for high availability and fast, consistent performance." },
              { value: "dev", label: "Dev/Test", description: "This instance is intended for development use outside of a production environment." },
              ...(aurora ? [] : [{ value: "free", label: "Free tier", description: "Use RDS Free Tier to develop new applications, test existing applications, or gain hands-on experience with Amazon RDS." }]),
            ]} />
          </Section>
        )}
        {!easy && (
          <Section title="Availability and durability">
            <FormField label="Deployment options">
              <Tiles value={deploy} onChange={e => setDeploy(e.detail.value)} items={aurora ? [
                { value: "multi", label: "Create an Aurora Replica or Reader node in a different AZ (recommended for scaled availability)", description: "Creates an Aurora Replica for fast failover and high availability." },
                { value: "single", label: "Don't create an Aurora Replica" },
              ] : [
                { value: "multi", label: "Multi-AZ DB instance deployment (2 instances)", description: "Creates a primary DB instance and a standby DB instance in a different AZ.", disabled: free },
                { value: "single", label: "Single-AZ DB instance deployment (1 instance)", description: "Creates a single DB instance with no standby DB instances." },
              ]} />
            </FormField>
          </Section>
        )}
        <Section title="Settings">
          <FormField label={aurora ? "DB cluster identifier" : "DB instance identifier"} errorText={idError} constraintText="The identifier is case-insensitive, but is stored as all lowercase. Must contain from 1 to 63 alphanumeric characters or hyphens. First character must be a letter.">
            <Input value={id} onChange={e => setId(e.detail.value.toLowerCase())} />
          </FormField>
          <ExpandableSection headerText="Credentials Settings" defaultExpanded>
            <SpaceBetween size="l">
              <FormField label="Master username" description={`Type a login ID for the master user of your DB ${aurora ? "cluster" : "instance"}.`} constraintText="1 to 16 alphanumeric characters. The first character must be a letter.">
                <Input value={user} onChange={e => setUser(e.detail.value)} />
              </FormField>
              <FormField label="Credentials management">
                <Tiles value={credMode} onChange={e => setCredMode(e.detail.value)} items={[
                  { value: "secrets", label: "Managed in AWS Secrets Manager - most secure", description: "RDS generates a password for you and manages it throughout its lifecycle using AWS Secrets Manager." },
                  { value: "self", label: "Self managed", description: "Create your own password or have RDS create a password that you manage." },
                ]} />
              </FormField>
              {credMode === "self" && <SpaceBetween size="l">
                <Checkbox checked={autoPw} onChange={e => setAutoPw(e.detail.checked)} description="Amazon RDS can generate a password for you, or you can specify your own password.">Auto generate password</Checkbox>
                {!autoPw && <SpaceBetween size="l">
                  <FormField label="Master password" errorText={pwError && !pwError.includes("match") ? pwError : undefined} constraintText="Minimum constraints: At least 8 printable ASCII characters. Can't contain any of the following symbols: / ' &quot; @">
                    <Input type="password" value={pw} onChange={e => setPw(e.detail.value)} />
                  </FormField>
                  <FormField label="Confirm master password" errorText={pwError && pwError.includes("match") ? pwError : undefined}><Input type="password" value={pw2} onChange={e => setPw2(e.detail.value)} /></FormField>
                </SpaceBetween>}
              </SpaceBetween>}
            </SpaceBetween>
          </ExpandableSection>
        </Section>
        {!easy && aurora && (
          <Section title="Cluster storage configuration" description="Choose the storage configuration for the Aurora DB cluster that best fits your application's price predictability and price performance needs.">
            <Tiles value={auroraStorage} onChange={e => setAuroraStorage(e.detail.value)} items={[
              { value: "iopt", label: "Aurora I/O-Optimized", description: "Improved price performance and price predictability for I/O-intensive applications." },
              { value: "aurora", label: "Aurora Standard", description: "Cost-effective pricing for many applications with moderate I/O usage." },
            ]} />
          </Section>
        )}
        {!easy && (
          <Section title="Instance configuration" description="The DB instance configuration options below are limited to those supported by the engine that you selected above.">
            <ClassPicker key={`${aurora}-${free}`} aurora={aurora} value={cls} onChange={setCls} free={free} />
          </Section>
        )}
        {!easy && !aurora && (
          <Section title="Storage">
            <FormField label="Storage type"><Select selectedOption={STORAGE_TYPES.find(s => s.value === storage.type)!} options={free ? STORAGE_TYPES.filter(s => s.value.startsWith("gp")) : STORAGE_TYPES} onChange={e => setStorage({ ...storage, type: e.detail.selectedOption.value! })} /></FormField>
            <FormField label="Allocated storage" constraintText="The minimum value is 20 GiB and the maximum value is 6,144 GiB">
              <Input type="number" value={storage.size} onChange={e => setStorage({ ...storage, size: e.detail.value })} />
            </FormField>
            {(storage.type.startsWith("io") || (storage.type === "gp3" && Number(storage.size) >= 400)) && (
              <FormField label="Provisioned IOPS"><Input type="number" value={storage.iops} onChange={e => setStorage({ ...storage, iops: e.detail.value })} /></FormField>
            )}
            {!free && <ExpandableSection headerText="Storage autoscaling" defaultExpanded>
              <SpaceBetween size="s">
                <Checkbox checked={storage.auto} onChange={e => setStorage({ ...storage, auto: e.detail.checked })} description="Enabling this feature will allow the storage to increase after the specified threshold is exceeded.">Enable storage autoscaling</Checkbox>
                {storage.auto && <FormField label="Maximum storage threshold" constraintText="The minimum value is 22 GiB and the maximum value is 65,536 GiB"><Input type="number" value={storage.max} onChange={e => setStorage({ ...storage, max: e.detail.value })} /></FormField>}
              </SpaceBetween>
            </ExpandableSection>}
          </Section>
        )}
        {!easy && (
          <Section title="Connectivity">
            <FormField label="Compute resource" description="Choose whether to set up a connection to a compute resource for this database.">
              <Tiles value="none" items={[{ value: "none", label: "Don't connect to an EC2 compute resource" }, { value: "ec2", label: "Connect to an EC2 compute resource", disabled: true }]} />
            </FormField>
            <FormField label="Network type"><RadioGroup value="IPV4" items={[{ value: "IPV4", label: "IPv4", description: "Your resources can communicate only over the IPv4 addressing protocol." }, { value: "DUAL", label: "Dual-stack mode", disabled: true }]} /></FormField>
            <FormField label="Virtual private cloud (VPC)" description="Choose the VPC. The VPC defines the virtual networking environment for this DB instance." constraintText="After a database is created, you can't change its VPC.">
              <Select selectedOption={vpc} options={vpcs.data || []} onChange={e => setVpc(e.detail.selectedOption)} statusType={vpcs.loading ? "loading" : "finished"} />
            </FormField>
            <FormField label="DB subnet group" description="Choose the DB subnet group. The DB subnet group defines which subnets and IP ranges the DB instance can use in the VPC that you selected.">
              <Select selectedOption={subnetGroup} options={sgOptions} onChange={e => setSubnetGroup(e.detail.selectedOption)} placeholder="Choose a DB subnet group" />
            </FormField>
            <FormField label="Public access">
              <RadioGroup value={publicAccess} onChange={e => setPublicAccess(e.detail.value)} items={[
                { value: "yes", label: "Yes", description: "RDS assigns a public IP address to the database. Amazon EC2 instances and other resources outside of the VPC can connect to your database." },
                { value: "no", label: "No", description: "RDS doesn't assign a public IP address to the database. Only Amazon EC2 instances and other resources inside the VPC can connect to your database." },
              ]} />
            </FormField>
            <FormField label="VPC security group (firewall)" description="Choose one or more VPC security groups to allow access to your database.">
              <Tiles value={sgMode} onChange={e => setSgMode(e.detail.value)} items={[{ value: "existing", label: "Choose existing", description: "Choose existing VPC security groups" }, { value: "new", label: "Create new", description: "Create new VPC security group" }]} />
            </FormField>
            {sgMode === "existing"
              ? <FormField label="Existing VPC security groups"><Multiselect selectedOptions={sgSel} options={sgs.data || []} onChange={e => setSgSel(e.detail.selectedOptions as any)} placeholder="Choose one or more options" /></FormField>
              : <FormField label="New VPC security group name"><Input value={newSg} onChange={e => setNewSg(e.detail.value)} /></FormField>}
            {!(deploy === "multi" && !aurora) && (
              <FormField label="Availability Zone">
                <Select selectedOption={az} options={[opt("", "No preference"), ...((subnetGroup?.raw?.Subnets || []).map((s: any) => opt(s.SubnetAvailabilityZone.Name)))]} onChange={e => setAz(e.detail.selectedOption)} />
              </FormField>
            )}
            <FormField label="Certificate authority - optional">
              <Select selectedOption={ca} onChange={e => setCa(e.detail.selectedOption)} options={[opt("rds-ca-rsa2048-g1", "rds-ca-rsa2048-g1 (default)", "Expiry: May 26, 2061"), opt("rds-ca-rsa4096-g1", "rds-ca-rsa4096-g1", "Expiry: May 26, 2121"), opt("rds-ca-ecc384-g1", "rds-ca-ecc384-g1", "Expiry: May 26, 2121")]} />
            </FormField>
            <ExpandableSection headerText="Additional configuration">
              <FormField label="Database port" description="TCP/IP port that the database will use for application connections."><Input type="number" value={port} onChange={e => setPort(e.detail.value)} /></FormField>
            </ExpandableSection>
          </Section>
        )}
        {!easy && <Section title="Tags - optional"><Tags tags={tags} onChange={setTags} /></Section>}
        {!easy && (
          <Section title="Database authentication">
            <FormField label="Database authentication options">
              <RadioGroup value={auth} onChange={e => setAuth(e.detail.value)} items={[
                { value: "password", label: "Password authentication", description: "Authenticates using database passwords." },
                { value: "iam", label: "Password and IAM database authentication", description: "Authenticates using the database password and user credentials through AWS IAM users and roles." },
                { value: "kerberos", label: "Password and Kerberos authentication", description: "Not available in the emulator.", disabled: true },
              ]} />
            </FormField>
          </Section>
        )}
        {!easy && (
          <Section title="Monitoring">
            <Checkbox checked={pi} onChange={e => setPi(e.detail.checked)} description="Performance Insights collects data (the emulator records the setting only).">Enable Performance Insights</Checkbox>
            <Checkbox checked={em} onChange={e => setEm(e.detail.checked)} description="Enabling Enhanced Monitoring metrics are useful when you want to see how different processes or threads use the CPU.">Enable Enhanced monitoring</Checkbox>
            {(LOGS[engine] || []).length > 0 && (
              <FormField label="Log exports" description="Select the log types to publish to Amazon CloudWatch Logs">
                <SpaceBetween size="xxs">{LOGS[engine].map(l => <Checkbox key={l} checked={logs.includes(l)} onChange={e => setLogs(e.detail.checked ? [...logs, l] : logs.filter(x => x !== l))}>{({ audit: "Audit log", error: "Error log", general: "General log", slowquery: "Slow query log", postgresql: "PostgreSQL log", upgrade: "Upgrade log" } as any)[l]}</Checkbox>)}</SpaceBetween>
              </FormField>
            )}
          </Section>
        )}
        {!easy && (
          <Container header={<Header variant="h2">Additional configuration</Header>}>
            <ExpandableSection headerText="Database options, encryption turned on, backup turned on, backtrack turned off, maintenance, CloudWatch Logs, delete protection turned off." defaultExpanded>
              <SpaceBetween size="l">
                <Header variant="h3">Database options</Header>
                <FormField label="Initial database name" description="If you do not specify a database name, Amazon RDS does not create a database."><Input value={dbName} onChange={e => setDbName(e.detail.value)} /></FormField>
                {aurora && <FormField label="DB cluster parameter group"><Select selectedOption={cparam || (family ? opt(`default.${family}`) : null)} options={cparams.data || []} onChange={e => setCparam(e.detail.selectedOption)} /></FormField>}
                <FormField label="DB parameter group"><Select selectedOption={param || (family ? opt(`default.${family}`) : null)} options={params.data || []} onChange={e => setParam(e.detail.selectedOption)} statusType={params.loading ? "loading" : "finished"} /></FormField>
                {!aurora && <FormField label="Option group"><Select selectedOption={optGroup || ((ogs.data || []).find((o: any) => o.value.startsWith("default:")) || null)} options={ogs.data || []} onChange={e => setOptGroup(e.detail.selectedOption)} placeholder="default" /></FormField>}
                <Header variant="h3">Backup</Header>
                {!aurora && <Checkbox checked={backup.on} onChange={e => setBackup({ ...backup, on: e.detail.checked })} description="Creates a point-in-time snapshot of your database">Enable automated backups</Checkbox>}
                {(backup.on || aurora) && <SpaceBetween size="l">
                  <FormField label="Backup retention period" description="The number of days (1-35) for which automatic backups are kept.">
                    <Select selectedOption={opt(backup.days, `${backup.days} day${backup.days === "1" ? "" : "s"}`)} options={Array.from({ length: 35 }, (_, k) => opt(String(k + 1), `${k + 1} day${k ? "s" : ""}`))} onChange={e => setBackup({ ...backup, days: e.detail.selectedOption.value! })} />
                  </FormField>
                  <FormField label="Backup window" description="The daily time range (in UTC) during which RDS takes automated backups.">
                    <RadioGroup value={backup.window} onChange={e => setBackup({ ...backup, window: e.detail.value })} items={[{ value: "choose", label: "Choose a window" }, { value: "none", label: "No preference" }]} />
                  </FormField>
                  {backup.window === "choose" && <SpaceBetween direction="horizontal" size="s">
                    <FormField label="Start time (UTC)"><Input value={backup.start} onChange={e => setBackup({ ...backup, start: e.detail.value })} placeholder="hh:mm" /></FormField>
                    <FormField label="Duration (hours)"><Input type="number" value={backup.dur} onChange={e => setBackup({ ...backup, dur: e.detail.value })} /></FormField>
                  </SpaceBetween>}
                  <Checkbox checked={backup.copyTags} onChange={e => setBackup({ ...backup, copyTags: e.detail.checked })}>Copy tags to snapshots</Checkbox>
                </SpaceBetween>}
                <Header variant="h3">Encryption</Header>
                <Checkbox checked={encrypt} onChange={e => setEncrypt(e.detail.checked)} description="Choose to encrypt the given instance. Master key IDs and aliases appear in the list after they have been created using the AWS Key Management Service console.">Enable encryption</Checkbox>
                {encrypt && <FormField label="AWS KMS key"><Select selectedOption={opt(kms)} options={[opt("(default) aws/rds")]} onChange={e => setKms(e.detail.selectedOption.value!)} /></FormField>}
                <Header variant="h3">Maintenance</Header>
                <Checkbox checked={maint.autoMinor} onChange={e => setMaint({ ...maint, autoMinor: e.detail.checked })} description="Enabling auto minor version upgrade will automatically upgrade to new minor versions as they are released.">Enable auto minor version upgrade</Checkbox>
                <FormField label="Maintenance window" description="Select the period you want pending modifications or maintenance applied to the database by Amazon RDS.">
                  <RadioGroup value={maint.window} onChange={e => setMaint({ ...maint, window: e.detail.value })} items={[{ value: "choose", label: "Choose a window" }, { value: "none", label: "No preference" }]} />
                </FormField>
                {maint.window === "choose" && <SpaceBetween direction="horizontal" size="s">
                  <FormField label="Start day"><Select selectedOption={opt(maint.day)} options={["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map(d => opt(d))} onChange={e => setMaint({ ...maint, day: e.detail.selectedOption.value! })} /></FormField>
                  <FormField label="Start time (UTC)"><Input value={maint.start} onChange={e => setMaint({ ...maint, start: e.detail.value })} /></FormField>
                  <FormField label="Duration (hours)"><Input type="number" value={maint.dur} onChange={e => setMaint({ ...maint, dur: e.detail.value })} /></FormField>
                </SpaceBetween>}
                <Header variant="h3">Deletion protection</Header>
                <Checkbox checked={delProt} onChange={e => setDelProt(e.detail.checked)} description="Protects the database from being deleted accidentally. While this option is enabled, you can't delete the database.">Enable deletion protection</Checkbox>
              </SpaceBetween>
            </ExpandableSection>
          </Container>
        )}
        {easy && (
          <Container>
            <ExpandableSection headerText="View default settings for Easy create" variant="footer">
              <Table variant="embedded" items={[
                ["Encryption", "Enabled"], ["VPC", vpc?.label || "Default VPC"], ["DB subnet group", subnetGroup?.value || "default"], ["Automatic backups", "Enabled"],
                ["VPC security group", "default"], ["Publicly accessible", "No"], ["Database port", port], ["DB instance class", aurora ? (template === "prod" ? "db.r6g.large" : "db.t3.medium") : (template === "prod" ? "db.m5.large" : "db.t3.micro")],
                ["Engine version", version?.EngineVersion || "-"], ["Deletion protection", template === "prod" ? "Enabled" : "Disabled"],
              ].map(([a, b]) => ({ a, b }))} columnDefinitions={[{ id: "a", header: "Configuration", cell: (x: any) => x.a }, { id: "b", header: "Value", cell: (x: any) => x.b }]} />
            </ExpandableSection>
          </Container>
        )}
        <Container header={<Header variant="h2">Estimated monthly costs</Header>}>
          <Box color="text-body-secondary">The emulator doesn't bill for resources. In AWS, this {aurora ? "cluster" : "instance"} ({cls}) would incur instance-hour and storage charges.</Box>
        </Container>
        <ErrorAlert error={err} />
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={() => nav("/rds/databases")}>Cancel</Button>
            <Button variant="primary" loading={busy} onClick={submit}>Create database</Button>
          </SpaceBetween>
        </Box>
      </SpaceBetween>
    </ContentLayout>
  );
}
