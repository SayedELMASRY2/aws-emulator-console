import { useState } from "react";
import Link from "@cloudscape-design/components/link";
import Modal from "@cloudscape-design/components/modal";
import Box from "@cloudscape-design/components/box";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Button from "@cloudscape-design/components/button";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Select from "@cloudscape-design/components/select";
import { ResourcePage, type Col, type Action } from "../ec2/ResourcePage";
import { useCrumbs } from "../../App";
import { useFlash, ErrorAlert, EmulatorNote, Copyable } from "../../common";
import { logs, logsAll, crumbs, fmt, fmtBytes, RETENTION_OPTIONS, enc } from "./lib";

export interface LogGroupRow {
  logGroupName: string;
  creationTime?: number;
  retentionInDays?: number;
  metricFilterCount?: number;
  arn?: string;
  storedBytes?: number;
  kmsKeyId?: string;
}

export default function LogGroups() {
  useCrumbs(crumbs({ text: "Log groups" }));
  const flash = useFlash();

  // Retention modal
  const [retentionTarget, setRetentionTarget] = useState<LogGroupRow | null>(null);
  const [selectedRetention, setSelectedRetention] = useState(RETENTION_OPTIONS[0]);
  const [savingRetention, setSavingRetention] = useState(false);

  // Delete modal
  const [deleteTarget, setDeleteTarget] = useState<LogGroupRow | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const loadLogGroups = async (): Promise<LogGroupRow[]> => {
    const list = await logsAll("DescribeLogGroups", "logGroups");
    return list || [];
  };

  const columns: Col<LogGroupRow>[] = [
    {
      id: "name",
      header: "Log group",
      minWidth: 320,
      cell: g => (
        <Link href={`#/logs/log-groups/${enc(g.logGroupName)}`}>
          <b>{g.logGroupName}</b>
        </Link>
      ),
    },
    {
      id: "retention",
      header: "Retention",
      cell: g => (g.retentionInDays ? `${g.retentionInDays} days` : "Never expire"),
    },
    {
      id: "stored",
      header: "Stored bytes",
      cell: g => fmtBytes(g.storedBytes),
    },
    {
      id: "metrics",
      header: "Metric filters",
      cell: g => g.metricFilterCount ?? 0,
    },
    {
      id: "created",
      header: "Creation time",
      cell: g => fmt(g.creationTime),
    },
    {
      id: "arn",
      header: "ARN",
      cell: g => (
        <SpaceBetween direction="horizontal" size="xxs">
          <code>{g.arn ? g.arn.slice(0, 24) + "..." : "-"}</code>
          {g.arn && <Copyable text={g.arn} iconOnly />}
        </SpaceBetween>
      ),
    },
  ];

  const actions: Action<LogGroupRow>[] = [
    {
      id: "retention",
      text: "Edit retention setting",
      disabled: sel => sel.length !== 1,
      run: sel => {
        const item = sel[0];
        setRetentionTarget(item);
        const match = RETENTION_OPTIONS.find(o => Number(o.value) === (item.retentionInDays || 0));
        setSelectedRetention(match || RETENTION_OPTIONS[0]);
        setError(null);
      },
    },
    {
      id: "delete",
      text: "Delete log group",
      disabled: sel => sel.length !== 1,
      run: sel => {
        setDeleteTarget(sel[0]);
        setConfirmName("");
        setError(null);
      },
    },
  ];

  const handleSaveRetention = async (reload: () => void) => {
    if (!retentionTarget) return;
    setSavingRetention(true);
    setError(null);
    try {
      const days = Number(selectedRetention.value);
      if (days === 0) {
        await logs("DeleteRetentionPolicy", { logGroupName: retentionTarget.logGroupName });
      } else {
        await logs("PutRetentionPolicy", { logGroupName: retentionTarget.logGroupName, retentionInDays: days });
      }
      flash.notify({ type: "success", content: `Updated retention policy for ${retentionTarget.logGroupName}.` });
      setRetentionTarget(null);
      reload();
    } catch (e) {
      setError(e);
    } finally {
      setSavingRetention(false);
    }
  };

  const handleDelete = async (reload: () => void) => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      await logs("DeleteLogGroup", { logGroupName: deleteTarget.logGroupName });
      flash.notify({ type: "success", content: `Deleted log group ${deleteTarget.logGroupName}.` });
      setDeleteTarget(null);
      reload();
    } catch (e) {
      setError(e);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <ResourcePage<LogGroupRow>
        title="Log groups"
        description="A log group defines the retention, monitoring, and access controls for incoming log streams."
        load={loadLogGroups}
        columns={columns}
        trackBy="logGroupName"
        create={{ text: "Create log group", href: "#/logs/log-groups/create" }}
        actions={actions}
        multi={false}
        banner={
          <EmulatorNote>
            Log events emitted by Lambda functions, application streams, and local services are ingested and queryable directly in the emulator.
          </EmulatorNote>
        }
      />

      {/* Retention Modal */}
      {retentionTarget && (
        <Modal
          visible={true}
          onDismiss={() => setRetentionTarget(null)}
          header={`Edit retention setting: ${retentionTarget.logGroupName}`}
          footer={
            <Box float="right">
              <SpaceBetween direction="horizontal" size="xs">
                <Button variant="link" onClick={() => setRetentionTarget(null)} disabled={savingRetention}>
                  Cancel
                </Button>
                <Button variant="primary" loading={savingRetention} onClick={() => handleSaveRetention(() => window.location.reload())}>
                  Save
                </Button>
              </SpaceBetween>
            </Box>
          }
        >
          <SpaceBetween size="m">
            <FormField label="Retention period" description="Choose how long log events are retained.">
              <Select
                selectedOption={selectedRetention}
                onChange={e => setSelectedRetention(e.detail.selectedOption as any)}
                options={RETENTION_OPTIONS}
              />
            </FormField>
            <ErrorAlert error={error} />
          </SpaceBetween>
        </Modal>
      )}

      {/* Delete Modal */}
      {deleteTarget && (
        <Modal
          visible={true}
          onDismiss={() => setDeleteTarget(null)}
          header={`Delete log group: ${deleteTarget.logGroupName}`}
          footer={
            <Box float="right">
              <SpaceBetween direction="horizontal" size="xs">
                <Button variant="link" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  loading={deleting}
                  disabled={confirmName !== deleteTarget.logGroupName}
                  onClick={() => handleDelete(() => window.location.reload())}
                >
                  Delete
                </Button>
              </SpaceBetween>
            </Box>
          }
        >
          <SpaceBetween size="m">
            <Box>
              Are you sure you want to delete log group <b>{deleteTarget.logGroupName}</b>?
              All associated log streams and events will be deleted.
            </Box>
            <FormField label={`To confirm deletion, type "${deleteTarget.logGroupName}" in the field below:`}>
              <Input
                value={confirmName}
                placeholder={deleteTarget.logGroupName}
                onChange={e => setConfirmName(e.detail.value)}
              />
            </FormField>
            <ErrorAlert error={error} />
          </SpaceBetween>
        </Modal>
      )}
    </>
  );
}
