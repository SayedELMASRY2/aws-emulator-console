import { useState } from "react";
import Modal from "@cloudscape-design/components/modal";
import Box from "@cloudscape-design/components/box";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Button from "@cloudscape-design/components/button";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import { ResourcePage, type Col, type Action } from "../ec2/ResourcePage";
import { useCrumbs } from "../../App";
import { useFlash, ErrorAlert, Copyable } from "../../common";
import { events, crumbs } from "./lib";

export interface BusRow {
  Name: string;
  Arn: string;
}

export default function EventBuses() {
  useCrumbs(crumbs({ text: "Event buses" }));
  const flash = useFlash();

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [busName, setBusName] = useState("");
  const [creating, setCreating] = useState(false);

  // Delete modal
  const [deleteTarget, setDeleteTarget] = useState<BusRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const loadBuses = async (): Promise<BusRow[]> => {
    const res = await events("ListEventBuses");
    return res.EventBuses || [];
  };

  const columns: Col<BusRow>[] = [
    {
      id: "name",
      header: "Event bus name",
      cell: b => <b>{b.Name}</b>,
    },
    {
      id: "arn",
      header: "ARN",
      cell: b => (
        <SpaceBetween direction="horizontal" size="xxs">
          <span>{b.Arn}</span>
          <Copyable text={b.Arn} iconOnly />
        </SpaceBetween>
      ),
    },
  ];

  const actions: Action<BusRow>[] = [
    {
      id: "delete",
      text: "Delete event bus",
      disabled: sel => sel.length !== 1 || sel[0].Name === "default",
      disabledReason: "The default event bus cannot be deleted.",
      run: sel => {
        setDeleteTarget(sel[0]);
        setError(null);
      },
    },
  ];

  const handleCreate = async (reload: () => void) => {
    if (!busName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await events("CreateEventBus", { Name: busName.trim() });
      flash.notify({ type: "success", content: `Created event bus ${busName}.` });
      setCreateOpen(false);
      setBusName("");
      reload();
    } catch (e) {
      setError(e);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (reload: () => void) => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      await events("DeleteEventBus", { Name: deleteTarget.Name });
      flash.notify({ type: "success", content: `Deleted event bus ${deleteTarget.Name}.` });
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
      <ResourcePage<BusRow>
        title="Event buses"
        description="An event bus receives events from sources and applies rules to route them to targets."
        load={loadBuses}
        columns={columns}
        trackBy="Name"
        create={{ text: "Create event bus", onClick: () => setCreateOpen(true) }}
        actions={actions}
        multi={false}
      />

      {/* Create Modal */}
      {createOpen && (
        <Modal
          visible={true}
          onDismiss={() => setCreateOpen(false)}
          header="Create event bus"
          footer={
            <Box float="right">
              <SpaceBetween direction="horizontal" size="xs">
                <Button variant="link" onClick={() => setCreateOpen(false)} disabled={creating}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  loading={creating}
                  disabled={!busName.trim()}
                  onClick={() => handleCreate(() => window.location.reload())}
                >
                  Create
                </Button>
              </SpaceBetween>
            </Box>
          }
        >
          <SpaceBetween size="m">
            <FormField label="Event bus name" constraintText="Required">
              <Input
                value={busName}
                placeholder="custom-events"
                onChange={e => setBusName(e.detail.value)}
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
          header={`Delete event bus ${deleteTarget.Name}`}
          footer={
            <Box float="right">
              <SpaceBetween direction="horizontal" size="xs">
                <Button variant="link" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                  Cancel
                </Button>
                <Button variant="primary" loading={deleting} onClick={() => handleDelete(() => window.location.reload())}>
                  Delete
                </Button>
              </SpaceBetween>
            </Box>
          }
        >
          <SpaceBetween size="m">
            <Box>
              Are you sure you want to delete event bus <b>{deleteTarget.Name}</b>?
            </Box>
            <ErrorAlert error={error} />
          </SpaceBetween>
        </Modal>
      )}
    </>
  );
}
