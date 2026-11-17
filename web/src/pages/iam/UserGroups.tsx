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
import { iam, iamAll, crumbs, fmt } from "./lib";

export interface GroupRow {
  GroupName: string;
  GroupId: string;
  Arn: string;
  CreateDate: string;
}

export default function UserGroups() {
  useCrumbs(crumbs({ text: "User groups" }));
  const flash = useFlash();

  const [createOpen, setCreateOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [creating, setCreating] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<GroupRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const loadGroups = async (): Promise<GroupRow[]> => {
    const list = await iamAll("ListGroups", "Groups");
    return list || [];
  };

  const columns: Col<GroupRow>[] = [
    {
      id: "name",
      header: "User group name",
      cell: g => <b>{g.GroupName}</b>,
    },
    {
      id: "arn",
      header: "ARN",
      cell: g => (
        <SpaceBetween direction="horizontal" size="xxs">
          <span>{g.Arn.slice(0, 28)}...</span>
          <Copyable text={g.Arn} iconOnly />
        </SpaceBetween>
      ),
    },
    {
      id: "created",
      header: "Created at",
      cell: g => fmt(g.CreateDate),
    },
  ];

  const actions: Action<GroupRow>[] = [
    {
      id: "delete",
      text: "Delete",
      disabled: sel => sel.length !== 1,
      run: sel => {
        setDeleteTarget(sel[0]);
        setError(null);
      },
    },
  ];

  const handleCreate = async (reload: () => void) => {
    if (!groupName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await iam("CreateGroup", { GroupName: groupName.trim() });
      flash.notify({ type: "success", content: `Created user group ${groupName}.` });
      setCreateOpen(false);
      setGroupName("");
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
      await iam("DeleteGroup", { GroupName: deleteTarget.GroupName });
      flash.notify({ type: "success", content: `Deleted user group ${deleteTarget.GroupName}.` });
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
      <ResourcePage<GroupRow>
        title="User groups"
        description="An IAM user group is a collection of IAM users. You can use groups to specify permissions for multiple users at once."
        load={loadGroups}
        columns={columns}
        trackBy="GroupName"
        create={{ text: "Create user group", onClick: () => setCreateOpen(true) }}
        actions={actions}
        multi={false}
      />

      {/* Create Modal */}
      {createOpen && (
        <Modal
          visible={true}
          onDismiss={() => setCreateOpen(false)}
          header="Create user group"
          footer={
            <Box float="right">
              <SpaceBetween direction="horizontal" size="xs">
                <Button variant="link" onClick={() => setCreateOpen(false)} disabled={creating}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  loading={creating}
                  disabled={!groupName.trim()}
                  onClick={() => handleCreate(() => window.location.reload())}
                >
                  Create
                </Button>
              </SpaceBetween>
            </Box>
          }
        >
          <SpaceBetween size="m">
            <FormField label="User group name" constraintText="Required">
              <Input
                value={groupName}
                placeholder="developers"
                onChange={e => setGroupName(e.detail.value)}
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
          header={`Delete user group ${deleteTarget.GroupName}`}
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
              Are you sure you want to delete user group <b>{deleteTarget.GroupName}</b>?
            </Box>
            <ErrorAlert error={error} />
          </SpaceBetween>
        </Modal>
      )}
    </>
  );
}
