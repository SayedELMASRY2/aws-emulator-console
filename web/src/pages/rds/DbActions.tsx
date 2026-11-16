// Actions shared by the Databases list and the database detail pages.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { type ButtonDropdownProps } from "@cloudscape-design/components/button-dropdown";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Checkbox from "@cloudscape-design/components/checkbox";
import Select from "@cloudscape-design/components/select";
import Box from "@cloudscape-design/components/box";
import Alert from "@cloudscape-design/components/alert";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { useFlash } from "../../common";
import { ActionModal } from "../ec2/ResourcePage";
import { rds, arn, useParamGroups } from "./lib";

const familyOf = (src: any) => { const m = String(src.DBParameterGroups?.[0]?.DBParameterGroupName || "").match(/^default\.(.+)$/); return m ? m[1] : undefined; };

export type Row = { kind: "instance" | "cluster" | "bg"; id: string; parent?: string; role: string; raw: any; cluster?: any };

export function itemsFor(r?: Row): ButtonDropdownProps.Items {
  if (!r) return [{ id: "none", text: "Select a database", disabled: true }];
  const s = r.kind === "bg" ? r.raw.Status : r.kind === "cluster" ? r.raw.Status : r.raw.DBInstanceStatus;
  const avail = s === "available";
  const na = (id: string, text: string, why: string) => ({ id, text, disabled: true, disabledReason: why });
  if (r.kind === "bg") return [
    { id: "switchover", text: "Switch over", disabled: s !== "AVAILABLE" },
    { id: "delete-bg", text: "Delete" },
  ];
  if (r.kind === "cluster") return [
    { id: "add-reader", text: "Add reader", disabled: !avail },
    { id: "stop", text: "Stop temporarily", disabled: !avail },
    { id: "start", text: "Start", disabled: s !== "stopped" },
    { id: "reboot", text: "Reboot", disabled: true, disabledReason: "Aurora clusters are rebooted one DB instance at a time. Reboot the instances instead." },
    { id: "delete", text: "Delete" },
    { id: "failover", text: "Failover", disabled: !avail || (r.raw.DBClusterMembers || []).length < 2, disabledReason: "Needs at least one reader instance." },
    { id: "snapshot", text: "Take snapshot", disabled: !avail },
    na("pitr", "Restore to point in time", "Not implemented in the emulator."),
    { id: "bluegreen", text: "Create Blue/Green Deployment", disabled: !avail },
    na("cross-region", "Create cross-Region read replica", "The emulator runs a single Region."),
  ];
  const inCluster = !!r.raw.DBClusterIdentifier;
  const isReplica = !!r.raw.ReadReplicaSourceDBInstanceIdentifier;
  if (inCluster) return [
    { id: "reboot", text: "Reboot", disabled: !avail },
    { id: "delete", text: "Delete" },
    { id: "failover", text: "Failover", disabled: !avail || r.role === "Writer instance", disabledReason: "Fail over to a reader instance." },
  ];
  return [
    { id: "multiaz", text: "Convert to Multi-AZ deployment", disabled: !avail || r.raw.MultiAZ },
    { id: "stop", text: "Stop temporarily", disabled: !avail || isReplica },
    { id: "start", text: "Start", disabled: s !== "stopped" },
    { id: "reboot", text: "Reboot", disabled: !avail },
    { id: "delete", text: "Delete" },
    { id: "replica", text: "Create read replica", disabled: !avail || isReplica },
    { id: "promote", text: "Promote", disabled: !avail || !isReplica },
    { id: "snapshot", text: "Take snapshot", disabled: !avail },
    na("pitr", "Restore to point in time", "Not implemented in the emulator."),
    { id: "bluegreen", text: "Create Blue/Green Deployment", disabled: !avail || isReplica },
    na("ec2-connect", "Set up EC2 connection", "Not available in the emulator."),
  ];
}

/** Returns a runner for action ids plus the modal element to render. */
export function useDbActions(reload: () => void, onDeleted?: () => void) {
  const nav = useNavigate();
  const flash = useFlash();
  const [m, setM] = useState<{ id: string; r: Row } | null>(null);
  const close = () => setM(null);
  const done = () => { close(); reload(); };
  const run = async (id: string, r: Row) => {
    try {
      if (id === "replica") return nav(`/rds/databases/instance/${encodeURIComponent(r.id)}/replica`);
      if (id === "add-reader") return nav(`/rds/databases/cluster/${encodeURIComponent(r.id)}/add-reader`);
      if (id === "snapshot") return nav(`/rds/snapshots/take?kind=${r.kind}&db=${encodeURIComponent(r.id)}`);
      if (id === "start") {
        if (r.kind === "cluster") await rds("StartDBCluster", { DBClusterIdentifier: r.id });
        else await rds("StartDBInstance", { DBInstanceIdentifier: r.id });
        flash.notify({ type: "success", content: `Starting ${r.id}.` }); reload(); return;
      }
      setM({ id, r });
    } catch (e) { flash.error(e, "Action failed"); }
  };
  const p = m ? { r: m.r, close, done } : null;
  const modal = !m || !p ? null
    : m.id === "stop" ? <StopModal {...p} />
    : m.id === "reboot" ? <RebootModal {...p} />
    : m.id === "delete" ? <DeleteModal {...p} done={() => { close(); reload(); onDeleted?.(); }} />
    : m.id === "promote" ? <PromoteModal {...p} />
    : m.id === "failover" ? <FailoverModal {...p} />
    : m.id === "multiaz" ? <MultiAzModal {...p} />
    : m.id === "bluegreen" ? <BlueGreenModal {...p} />
    : m.id === "switchover" ? <SwitchoverModal {...p} />
    : m.id === "delete-bg" ? <DeleteBgModal {...p} />
    : null;
  return { run, modal };
}

type P = { r: Row; close: () => void; done: () => void };

function StopModal({ r, close, done }: P) {
  const flash = useFlash();
  const [snap, setSnap] = useState(false);
  const [name, setName] = useState(`${r.id}-${new Date().toISOString().slice(0, 10)}`);
  return (
    <ActionModal visible onDismiss={close} header={`Stop ${r.kind === "cluster" ? "DB cluster" : "DB instance"} temporarily`} ok="Stop temporarily" onOk={async () => {
      if (r.kind === "cluster") await rds("StopDBCluster", { DBClusterIdentifier: r.id });
      else await rds("StopDBInstance", { DBInstanceIdentifier: r.id, ...(snap ? { DBSnapshotIdentifier: name } : {}) });
      flash.notify({ type: "success", content: `Stopping ${r.id}.` }); done();
    }}>
      <Alert type="warning">You can stop a database for up to 7 days. After 7 days, AWS automatically starts it to keep it up to date with maintenance updates.</Alert>
      <Box>You're stopping <b>{r.id}</b>. You aren't charged for instance hours while it's stopped, but storage charges continue.</Box>
      {r.kind === "instance" && <SpaceBetween size="m">
        <Checkbox checked={snap} onChange={e => setSnap(e.detail.checked)}>Save the DB instance in a snapshot</Checkbox>
        {snap && <FormField label="Snapshot identifier"><Input value={name} onChange={e => setName(e.detail.value)} /></FormField>}
      </SpaceBetween>}
    </ActionModal>
  );
}

function RebootModal({ r, close, done }: P) {
  const flash = useFlash();
  const [fo, setFo] = useState(false);
  return (
    <ActionModal visible onDismiss={close} header={`Reboot ${r.kind === "cluster" ? "DB cluster" : "DB instance"}`} ok="Confirm" onOk={async () => {
      if (r.kind === "cluster") await rds("RebootDBCluster", { DBClusterIdentifier: r.id });
      else await rds("RebootDBInstance", { DBInstanceIdentifier: r.id, ...(fo ? { ForceFailover: true } : {}) });
      flash.notify({ type: "success", content: `Rebooting ${r.id}.` }); done();
    }}>
      <Box>Are you sure you want to reboot <b>{r.id}</b>? The database is unavailable while it reboots.</Box>
      {r.kind === "instance" && r.raw.MultiAZ && <Checkbox checked={fo} onChange={e => setFo(e.detail.checked)}>Reboot with failover</Checkbox>}
    </ActionModal>
  );
}

function DeleteModal({ r, close, done }: P) {
  const flash = useFlash();
  const members: any[] = r.kind === "cluster" ? r.raw.DBClusterMembers || [] : [];
  const inCluster = r.kind === "instance" && !!r.raw.DBClusterIdentifier;
  const [final, setFinal] = useState(!inCluster);
  const [snapName, setSnapName] = useState(`${r.id}-final-snapshot`);
  const [retain, setRetain] = useState(false);
  const [ack, setAck] = useState(false);
  const [typed, setTyped] = useState("");
  const needAck = !inCluster && !final;
  const prot = r.kind === "cluster" ? r.raw.DeletionProtection : r.raw.DeletionProtection;
  return (
    <ActionModal visible onDismiss={close} header={`Delete ${r.id}?`} ok="Delete" danger disabled={typed !== "delete me" || (needAck && !ack) || prot} onOk={async () => {
      if (r.kind === "cluster") {
        for (const mbr of members) await rds("DeleteDBInstance", { DBInstanceIdentifier: mbr.DBInstanceIdentifier, SkipFinalSnapshot: true });
        await rds("DeleteDBCluster", { DBClusterIdentifier: r.id, ...(final ? { FinalDBSnapshotIdentifier: snapName } : { SkipFinalSnapshot: true }) });
      } else if (inCluster) {
        await rds("DeleteDBInstance", { DBInstanceIdentifier: r.id, SkipFinalSnapshot: true });
      } else {
        await rds("DeleteDBInstance", { DBInstanceIdentifier: r.id, ...(final ? { FinalDBSnapshotIdentifier: snapName } : { SkipFinalSnapshot: true }), DeleteAutomatedBackups: !retain });
      }
      flash.notify({ type: "success", content: `Deleting ${r.id}.` }); done();
    }}>
      {prot && <Alert type="error" header="Deletion protection is turned on">Modify the database and turn off deletion protection before you delete it.</Alert>}
      {r.kind === "cluster" && members.length > 0 && <Alert type="warning">This also deletes the cluster's {members.length} DB instance(s): {members.map(x => x.DBInstanceIdentifier).join(", ")}.</Alert>}
      {inCluster
        ? <Box>Delete the DB instance <b>{r.id}</b> from cluster <b>{r.raw.DBClusterIdentifier}</b>.</Box>
        : <SpaceBetween size="s">
            <Checkbox checked={final} onChange={e => setFinal(e.detail.checked)} description="Take a snapshot of the database before it's deleted.">Create final snapshot</Checkbox>
            {final && <FormField label="Final snapshot name"><Input value={snapName} onChange={e => setSnapName(e.detail.value)} /></FormField>}
            {r.kind === "instance" && <Checkbox checked={retain} onChange={e => setRetain(e.detail.checked)} description="Automated backups are kept for the retention period after the database is deleted.">Retain automated backups</Checkbox>}
            {needAck && <Checkbox checked={ack} onChange={e => setAck(e.detail.checked)}>I acknowledge that upon deletion, automated backups, including system snapshots and point-in-time recovery, will no longer be available.</Checkbox>}
          </SpaceBetween>}
      <FormField label={<span>To confirm deletion, type <i>delete me</i> into the field.</span>}><Input value={typed} placeholder="delete me" onChange={e => setTyped(e.detail.value)} /></FormField>
    </ActionModal>
  );
}

function PromoteModal({ r, close, done }: P) {
  const flash = useFlash();
  const [ret, setRet] = useState("1");
  return (
    <ActionModal visible onDismiss={close} header={`Promote read replica ${r.id}`} ok="Promote read replica" onOk={async () => {
      await rds("PromoteReadReplica", { DBInstanceIdentifier: r.id, BackupRetentionPeriod: Number(ret) });
      flash.notify({ type: "success", content: `Promoting ${r.id} to a standalone DB instance.` }); done();
    }}>
      <Alert type="info">Promoting a read replica makes it a standalone DB instance. Replication from {r.raw.ReadReplicaSourceDBInstanceIdentifier} stops and can't be restarted.</Alert>
      <FormField label="Backup retention period (days)"><Input type="number" value={ret} onChange={e => setRet(e.detail.value)} /></FormField>
    </ActionModal>
  );
}

function FailoverModal({ r, close, done }: P) {
  const flash = useFlash();
  const cl = r.kind === "cluster" ? r.raw : r.cluster;
  const readers = (cl?.DBClusterMembers || []).filter((x: any) => !x.IsClusterWriter).map((x: any) => ({ value: x.DBInstanceIdentifier, label: x.DBInstanceIdentifier }));
  const [t, setT] = useState<any>(r.kind === "instance" ? { value: r.id, label: r.id } : readers[0] || null);
  return (
    <ActionModal visible onDismiss={close} header="Failover DB cluster" ok="Failover" disabled={!t} onOk={async () => {
      await rds("FailoverDBCluster", { DBClusterIdentifier: cl.DBClusterIdentifier, TargetDBInstanceIdentifier: t.value });
      flash.notify({ type: "success", content: `Failing over ${cl.DBClusterIdentifier} to ${t.value}.` }); done();
    }}>
      <Box>The writer of <b>{cl?.DBClusterIdentifier}</b> becomes a reader, and the instance you choose becomes the new writer.</Box>
      <FormField label="New writer instance"><Select selectedOption={t} options={readers} onChange={e => setT(e.detail.selectedOption)} /></FormField>
    </ActionModal>
  );
}

function MultiAzModal({ r, close, done }: P) {
  const flash = useFlash();
  return (
    <ActionModal visible onDismiss={close} header="Convert to Multi-AZ deployment" ok="Convert to Multi-AZ" onOk={async () => {
      await rds("ModifyDBInstance", { DBInstanceIdentifier: r.id, MultiAZ: true, ApplyImmediately: true });
      flash.notify({ type: "success", content: `Converting ${r.id} to a Multi-AZ deployment.` }); done();
    }}>
      <Box>RDS creates a standby instance in a different Availability Zone and replicates data to it synchronously. The change is applied immediately.</Box>
    </ActionModal>
  );
}

function BlueGreenModal({ r, close, done }: P) {
  const flash = useFlash();
  const src = r.raw;
  const [name, setName] = useState(`${r.id}-bg`);
  const [ver, setVer] = useState("");
  const pgs = useParamGroups(r.kind === "cluster" ? undefined : src.DBParameterGroups?.[0]?.DBParameterGroupName ? familyOf(src) : undefined);
  const [pg, setPg] = useState<any>(null);
  return (
    <ActionModal visible onDismiss={close} header="Create Blue/Green Deployment" ok="Create staging environment" size="medium" disabled={!name} onOk={async () => {
      await rds("CreateBlueGreenDeployment", { BlueGreenDeploymentName: name, Source: r.kind === "cluster" ? src.DBClusterArn : src.DBInstanceArn || arn("db", r.id),
        ...(ver ? { TargetEngineVersion: ver } : {}), ...(pg ? { TargetDBParameterGroupName: pg.value } : {}) });
      flash.notify({ type: "success", content: `Creating Blue/Green Deployment ${name}.` }); done();
    }}>
      <Box>A blue/green deployment copies <b>{r.id}</b> (blue) to a staging environment (green) that stays in sync with it. Make changes on green, then switch over.</Box>
      <FormField label="Blue/Green Deployment identifier"><Input value={name} onChange={e => setName(e.detail.value)} /></FormField>
      <FormField label="Engine version for green databases" description={`Current version: ${src.EngineVersion}. Leave empty to keep it.`}><Input value={ver} onChange={e => setVer(e.detail.value)} placeholder={src.EngineVersion} /></FormField>
      {(pgs.data || []).length > 0 && <FormField label="DB parameter group for green databases"><Select selectedOption={pg} options={pgs.data || []} onChange={e => setPg(e.detail.selectedOption)} placeholder="Same as blue" /></FormField>}
    </ActionModal>
  );
}

function SwitchoverModal({ r, close, done }: P) {
  const flash = useFlash();
  const [t, setT] = useState("300");
  return (
    <ActionModal visible onDismiss={close} header={`Switch over ${r.raw.BlueGreenDeploymentName}`} ok="Switch over" onOk={async () => {
      await rds("SwitchoverBlueGreenDeployment", { BlueGreenDeploymentIdentifier: r.id, SwitchoverTimeout: Number(t) });
      flash.notify({ type: "success", content: `Switching over ${r.raw.BlueGreenDeploymentName}.` }); done();
    }}>
      <Box>The green databases are promoted to production and take over the blue databases' names and endpoints.</Box>
      <FormField label="Timeout (seconds)"><Input type="number" value={t} onChange={e => setT(e.detail.value)} /></FormField>
    </ActionModal>
  );
}

function DeleteBgModal({ r, close, done }: P) {
  const flash = useFlash();
  const [tgt, setTgt] = useState(r.raw.Status !== "SWITCHOVER_COMPLETED");
  return (
    <ActionModal visible onDismiss={close} header={`Delete ${r.raw.BlueGreenDeploymentName}?`} ok="Delete" danger onOk={async () => {
      await rds("DeleteBlueGreenDeployment", { BlueGreenDeploymentIdentifier: r.id, DeleteTarget: tgt });
      flash.notify({ type: "success", content: `Deleting ${r.raw.BlueGreenDeploymentName}.` }); done();
    }}>
      <Checkbox checked={tgt} onChange={e => setTgt(e.detail.checked)} description="Deletes the green databases along with the deployment.">Delete the green databases in this Blue/Green Deployment</Checkbox>
    </ActionModal>
  );
}
