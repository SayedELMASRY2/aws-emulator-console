import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import Tabs from "@cloudscape-design/components/tabs";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ButtonDropdown from "@cloudscape-design/components/button-dropdown";
import Table from "@cloudscape-design/components/table";
import Link from "@cloudscape-design/components/link";
import Modal from "@cloudscape-design/components/modal";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Select from "@cloudscape-design/components/select";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import { useCrumbs } from "../../App";
import { useAsync, useFlash, ErrorAlert, ValueWithLabel, Copyable } from "../../common";
import { logs, logsAll, crumbs, fmt, fmtBytes, RETENTION_OPTIONS, enc } from "./lib";

export default function LogGroupDetail() {
  const { groupName = "" } = useParams();
  const nav = useNavigate();
  const flash = useFlash();

  useCrumbs(
    crumbs(
      { text: "Log groups", href: "#/logs/log-groups" },
      { text: groupName }
    )
  );

  const groupData = useAsync(async () => {
    const res = await logs("DescribeLogGroups", { logGroupNamePrefix: groupName });
    const g = (res.logGroups || []).find((x: any) => x.logGroupName === groupName);
    if (!g) throw new Error(`Log group ${groupName} not found`);
    return g;
  }, [groupName]);

  const streamsData = useAsync(async () => {
    try {
      const res = await logsAll("DescribeLogStreams", "logStreams", {
        logGroupName: groupName,
        descending: true,
        orderBy: "LastEventTime",
      });
      return res || [];
    } catch {
      return [];
    }
  }, [groupName]);

  const g = groupData.data;

  // Create stream modal
  const [createStreamOpen, setCreateStreamOpen] = useState(false);
  const [newStreamName, setNewStreamName] = useState("");
  const [creatingStream, setCreatingStream] = useState(false);

  // Delete stream modal
  const [delStreamTarget, setDelStreamTarget] = useState<any | null>(null);
  const [deletingStream, setDeletingStream] = useState(false);

  // Retention modal
  const [retentionOpen, setRetentionOpen] = useState(false);
  const [selectedRetention, setSelectedRetention] = useState(RETENTION_OPTIONS[0]);
  const [savingRetention, setSavingRetention] = useState(false);

  // Delete log group modal
  const [deleteGroupOpen, setDeleteGroupOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [deletingGroup, setDeletingGroup] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const handleCreateStream = async () => {
    if (!newStreamName.trim()) return;
    setCreatingStream(true);
    setError(null);
    try {
      await logs("CreateLogStream", {
        logGroupName: groupName,
        logStreamName: newStreamName.trim(),
      });
      flash.notify({ type: "success", content: `Created log stream ${newStreamName}.` });
      setCreateStreamOpen(false);
      setNewStreamName("");
      streamsData.reload();
    } catch (e) {
      setError(e);
    } finally {
      setCreatingStream(false);
    }
  };

  const handleDeleteStream = async () => {
    if (!delStreamTarget) return;
    setDeletingStream(true);
    setError(null);
    try {
      await logs("DeleteLogStream", {
        logGroupName: groupName,
        logStreamName: delStreamTarget.logStreamName,
      });
      flash.notify({ type: "success", content: `Deleted log stream ${delStreamTarget.logStreamName}.` });
      setDelStreamTarget(null);
      streamsData.reload();
    } catch (e) {
      setError(e);
    } finally {
      setDeletingStream(false);
    }
  };

  const handleSaveRetention = async () => {
    setSavingRetention(true);
    setError(null);
    try {
      const days = Number(selectedRetention.value);
      if (days === 0) {
        await logs("DeleteRetentionPolicy", { logGroupName: groupName });
      } else {
        await logs("PutRetentionPolicy", { logGroupName: groupName, retentionInDays: days });
      }
      flash.notify({ type: "success", content: `Updated retention policy for ${groupName}.` });
      setRetentionOpen(false);
      groupData.reload();
    } catch (e) {
      setError(e);
    } finally {
      setSavingRetention(false);
    }
  };

  const handleDeleteGroup = async () => {
    setDeletingGroup(true);
    setError(null);
    try {
      await logs("DeleteLogGroup", { logGroupName: groupName });
      flash.notify({ type: "success", content: `Deleted log group ${groupName}.` });
      nav("/logs/log-groups");
    } catch (e) {
      setError(e);
    } finally {
      setDeletingGroup(false);
    }
  };

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button
                onClick={() => {
                  const match = RETENTION_OPTIONS.find(o => Number(o.value) === (g?.retentionInDays || 0));
                  setSelectedRetention(match || RETENTION_OPTIONS[0]);
                  setRetentionOpen(true);
                }}
              >
                Edit retention setting
              </Button>
              <ButtonDropdown
                items={[{ id: "delete", text: "Delete log group" }]}
                onItemClick={e => {
                  if (e.detail.id === "delete") {
                    setConfirmName("");
                    setDeleteGroupOpen(true);
                  }
                }}
              >
                Actions
              </ButtonDropdown>
            </SpaceBetween>
          }
        >
          {groupName}
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Log group overview</Header>}>
          <ColumnLayout columns={4} variant="text-grid">
            <ValueWithLabel label="Retention setting">
              {g?.retentionInDays ? `${g.retentionInDays} days` : "Never expire"}
            </ValueWithLabel>
            <ValueWithLabel label="Stored bytes">{fmtBytes(g?.storedBytes)}</ValueWithLabel>
            <ValueWithLabel label="Metric filters">{g?.metricFilterCount ?? 0}</ValueWithLabel>
            <ValueWithLabel label="Created at">{fmt(g?.creationTime)}</ValueWithLabel>
            <ValueWithLabel label="ARN">
              {g?.arn ? <Copyable text={g.arn} /> : "-"}
            </ValueWithLabel>
          </ColumnLayout>
        </Container>

        <Tabs
          tabs={[
            {
              id: "streams",
              label: `Log streams (${streamsData.data?.length ?? 0})`,
              content: (
                <Table
                  items={streamsData.data || []}
                  loading={streamsData.loading}
                  header={
                    <Header
                      variant="h2"
                      actions={
                        <Button variant="primary" onClick={() => setCreateStreamOpen(true)}>
                          Create log stream
                        </Button>
                      }
                    >
                      Log streams
                    </Header>
                  }
                  columnDefinitions={[
                    {
                      id: "name",
                      header: "Log stream name",
                      cell: (s: any) => (
                        <Link href={`#/logs/log-groups/${enc(groupName)}/streams/${enc(s.logStreamName)}`}>
                          <code>{s.logStreamName}</code>
                        </Link>
                      ),
                    },
                    {
                      id: "lastEvent",
                      header: "Last event time",
                      cell: (s: any) => fmt(s.lastEventTimestamp),
                    },
                    {
                      id: "firstEvent",
                      header: "First event time",
                      cell: (s: any) => fmt(s.firstEventTimestamp),
                    },
                    {
                      id: "stored",
                      header: "Stored bytes",
                      cell: (s: any) => fmtBytes(s.storedBytes),
                    },
                    {
                      id: "created",
                      header: "Created time",
                      cell: (s: any) => fmt(s.creationTime),
                    },
                    {
                      id: "actions",
                      header: "Actions",
                      cell: (s: any) => (
                        <Button
                          variant="inline-link"
                          onClick={() => setDelStreamTarget(s)}
                        >
                          Delete
                        </Button>
                      ),
                    },
                  ]}
                  empty={
                    <Box textAlign="center" color="inherit">
                      <b>No log streams</b>
                      <Box variant="p" color="text-body-secondary">
                        Log streams are created automatically by services (like Lambda) or manually here.
                      </Box>
                    </Box>
                  }
                />
              ),
            },
          ]}
        />

        {/* Create Stream Modal */}
        {createStreamOpen && (
          <Modal
            visible={true}
            onDismiss={() => setCreateStreamOpen(false)}
            header="Create log stream"
            footer={
              <Box float="right">
                <SpaceBetween direction="horizontal" size="xs">
                  <Button variant="link" onClick={() => setCreateStreamOpen(false)} disabled={creatingStream}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    loading={creatingStream}
                    disabled={!newStreamName.trim()}
                    onClick={handleCreateStream}
                  >
                    Create
                  </Button>
                </SpaceBetween>
              </Box>
            }
          >
            <SpaceBetween size="m">
              <FormField label="Log stream name" constraintText="Required">
                <Input
                  value={newStreamName}
                  placeholder="2026/11/17/stream-1"
                  onChange={e => setNewStreamName(e.detail.value)}
                />
              </FormField>
              <ErrorAlert error={error} />
            </SpaceBetween>
          </Modal>
        )}

        {/* Delete Stream Modal */}
        {delStreamTarget && (
          <Modal
            visible={true}
            onDismiss={() => setDelStreamTarget(null)}
            header={`Delete log stream: ${delStreamTarget.logStreamName}`}
            footer={
              <Box float="right">
                <SpaceBetween direction="horizontal" size="xs">
                  <Button variant="link" onClick={() => setDelStreamTarget(null)} disabled={deletingStream}>
                    Cancel
                  </Button>
                  <Button variant="primary" loading={deletingStream} onClick={handleDeleteStream}>
                    Delete
                  </Button>
                </SpaceBetween>
              </Box>
            }
          >
            <SpaceBetween size="m">
              <Box>
                Are you sure you want to delete log stream <code>{delStreamTarget.logStreamName}</code>?
              </Box>
              <ErrorAlert error={error} />
            </SpaceBetween>
          </Modal>
        )}

        {/* Retention Modal */}
        {retentionOpen && (
          <Modal
            visible={true}
            onDismiss={() => setRetentionOpen(false)}
            header={`Edit retention setting: ${groupName}`}
            footer={
              <Box float="right">
                <SpaceBetween direction="horizontal" size="xs">
                  <Button variant="link" onClick={() => setRetentionOpen(false)} disabled={savingRetention}>
                    Cancel
                  </Button>
                  <Button variant="primary" loading={savingRetention} onClick={handleSaveRetention}>
                    Save
                  </Button>
                </SpaceBetween>
              </Box>
            }
          >
            <SpaceBetween size="m">
              <FormField label="Retention period">
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

        {/* Delete Log Group Modal */}
        {deleteGroupOpen && (
          <Modal
            visible={true}
            onDismiss={() => setDeleteGroupOpen(false)}
            header={`Delete log group: ${groupName}`}
            footer={
              <Box float="right">
                <SpaceBetween direction="horizontal" size="xs">
                  <Button variant="link" onClick={() => setDeleteGroupOpen(false)} disabled={deletingGroup}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    loading={deletingGroup}
                    disabled={confirmName !== groupName}
                    onClick={handleDeleteGroup}
                  >
                    Delete
                  </Button>
                </SpaceBetween>
              </Box>
            }
          >
            <SpaceBetween size="m">
              <Box>
                Are you sure you want to delete log group <b>{groupName}</b>?
                All associated log streams will be permanently deleted.
              </Box>
              <FormField label={`To confirm deletion, type "${groupName}" in the field below:`}>
                <Input
                  value={confirmName}
                  placeholder={groupName}
                  onChange={e => setConfirmName(e.detail.value)}
                />
              </FormField>
              <ErrorAlert error={error} />
            </SpaceBetween>
          </Modal>
        )}
      </SpaceBetween>
    </ContentLayout>
  );
}
