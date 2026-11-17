import { useState } from "react";
import Link from "@cloudscape-design/components/link";
import Modal from "@cloudscape-design/components/modal";
import Box from "@cloudscape-design/components/box";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Button from "@cloudscape-design/components/button";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import { ResourcePage, type Col, type Action } from "../ec2/ResourcePage";
import { useCrumbs } from "../../App";
import { useFlash, ErrorAlert } from "../../common";
import { athena, athenaAll, crumbs, St, fmt } from "./lib";

export interface WorkgroupRow {
  Name: string;
  State?: string;
  Description?: string;
  CreationTime?: string;
  EngineVersion?: { SelectedEngineVersion?: string; EffectiveEngineVersion?: string };
}

export default function Workgroups() {
  useCrumbs(crumbs({ text: "Workgroups" }));
  const flash = useFlash();

  const [deleteTarget, setDeleteTarget] = useState<WorkgroupRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const loadWorkgroups = async (): Promise<WorkgroupRow[]> => {
    const list = await athenaAll("ListWorkGroups", "WorkGroups");
    return list || [];
  };

  const columns: Col<WorkgroupRow>[] = [
    {
      id: "name",
      header: "Workgroup name",
      cell: w => <b>{w.Name}</b>,
    },
    {
      id: "state",
      header: "State",
      cell: w => <St s={w.State} />,
    },
    {
      id: "desc",
      header: "Description",
      cell: w => w.Description || "-",
    },
    {
      id: "engine",
      header: "Engine version",
      cell: w => w.EngineVersion?.EffectiveEngineVersion || "Athena engine version 3",
    },
    {
      id: "created",
      header: "Created at",
      cell: w => fmt(w.CreationTime),
    },
  ];

  const actions: Action<WorkgroupRow>[] = [
    {
      id: "delete",
      text: "Delete workgroup",
      disabled: sel => sel.length !== 1 || sel[0].Name === "primary",
      disabledReason: "The primary workgroup cannot be deleted.",
      run: sel => {
        setDeleteTarget(sel[0]);
        setError(null);
      },
    },
  ];

  const handleDelete = async (reload: () => void) => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      await athena("DeleteWorkGroup", {
        WorkGroup: deleteTarget.Name,
        RecursiveDeleteOption: true,
      });
      flash.notify({ type: "success", content: `Deleted workgroup ${deleteTarget.Name}.` });
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
      <ResourcePage<WorkgroupRow>
        title="Workgroups"
        description="Workgroups are used to isolate queries for users, teams, or applications, and to set query result locations."
        load={loadWorkgroups}
        columns={columns}
        trackBy="Name"
        create={{ text: "Create workgroup", href: "#/athena/workgroups/create" }}
        actions={actions}
        multi={false}
      />

      {deleteTarget && (
        <Modal
          visible={true}
          onDismiss={() => setDeleteTarget(null)}
          header={`Delete workgroup: ${deleteTarget.Name}`}
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
              Are you sure you want to delete workgroup <b>{deleteTarget.Name}</b>?
            </Box>
            <ErrorAlert error={error} />
          </SpaceBetween>
        </Modal>
      )}
    </>
  );
}
