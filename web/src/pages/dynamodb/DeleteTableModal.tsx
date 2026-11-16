import { useEffect, useState } from "react";
import Checkbox from "@cloudscape-design/components/checkbox";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import SpaceBetween from "@cloudscape-design/components/space-between";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import { ConfirmModal, errText, useFlash } from "../../common";
import { api } from "../../api";
import { ddb } from "./lib";

export default function DeleteTableModal({ visible, tables, onDismiss, onDone }: { visible: boolean; tables: any[]; onDismiss: () => void; onDone: (allDeleted: boolean) => void }) {
  const flash = useFlash();
  const [alarms, setAlarms] = useState(true);
  const [backup, setBackup] = useState(false);
  const [backupName, setBackupName] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (visible) { setBackup(false); setBackupName(tables.length === 1 ? `${tables[0].TableName}-final-backup` : ""); } }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const protectedOnes = tables.filter(t => t.DeletionProtectionEnabled);
  const go = async () => {
    setBusy(true);
    const fails: string[] = [];
    for (const t of tables) {
      try {
        if (backup) await ddb("CreateBackup", { TableName: t.TableName, BackupName: tables.length === 1 ? backupName : `${t.TableName}-final-backup` });
        if (alarms) {
          const a = ((await api.call("cloudwatch", "DescribeAlarms")).MetricAlarms || []).filter((x: any) => (x.Dimensions || []).some((d: any) => d.Name === "TableName" && d.Value === t.TableName));
          if (a.length) await api.call("cloudwatch", "DeleteAlarms", { AlarmNames: a.map((x: any) => x.AlarmName) });
        }
        await ddb("DeleteTable", { TableName: t.TableName });
      } catch (e) { fails.push(`${t.TableName}: ${errText(e)}`); }
    }
    setBusy(false);
    if (fails.length) flash.notify({ type: "error", header: "Some tables weren't deleted", content: fails.join("; ") });
    else flash.notify({ type: "success", content: `Deleting ${tables.map(t => t.TableName).join(", ")}.` });
    onDismiss(); onDone(!fails.length);
  };
  return (
    <ConfirmModal visible={visible} onDismiss={onDismiss} onConfirm={go} busy={busy} header={tables.length === 1 ? `Delete table: ${tables[0]?.TableName}` : `Delete ${tables.length} tables`} confirmText="confirm" confirmLabel="Delete">
      <SpaceBetween size="m">
        {protectedOnes.length > 0 && <Alert type="error" header="Deletion protection is turned on">{protectedOnes.map(t => t.TableName).join(", ")} can't be deleted until you turn off deletion protection under Additional settings.</Alert>}
        <Box>Deleting a table removes all its items and can't be undone.</Box>
        <Checkbox checked={alarms} onChange={e => setAlarms(e.detail.checked)}>Delete all CloudWatch alarms for {tables.length === 1 ? "this table" : "these tables"}</Checkbox>
        <Checkbox checked={backup} onChange={e => setBackup(e.detail.checked)} description="Create an on-demand backup before the table is deleted.">Create an on-demand backup of {tables.length === 1 ? "this table" : "these tables"} before deleting</Checkbox>
        {backup && tables.length === 1 && <FormField label="Backup name"><Input value={backupName} onChange={e => setBackupName(e.detail.value)} /></FormField>}
      </SpaceBetween>
    </ConfirmModal>
  );
}
