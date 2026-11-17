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
import { useFlash, ErrorAlert, EmulatorNote, Copyable } from "../../common";
import { cfn, cfnAll, crumbs, St, fmt, enc } from "./lib";

export interface StackRow {
  StackId: string;
  StackName: string;
  Description?: string;
  CreationTime?: string;
  LastUpdatedTime?: string;
  StackStatus: string;
  StackStatusReason?: string;
}

export default function Stacks() {
  useCrumbs(crumbs({ text: "Stacks" }));
  const flash = useFlash();

  const [deleteTarget, setDeleteTarget] = useState<StackRow | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const loadStacks = async (): Promise<StackRow[]> => {
    try {
      const res = await cfn("DescribeStacks", {});
      const list = res.Stacks || [];
      return list.filter((s: any) => s.StackStatus !== "DELETE_COMPLETE");
    } catch {
      return [];
    }
  };

  const columns: Col<StackRow>[] = [
    {
      id: "name",
      header: "Stack name",
      cell: s => (
        <Link href={`#/cloudformation/stacks/${enc(s.StackName)}`}>
          <b>{s.StackName}</b>
        </Link>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: s => <St s={s.StackStatus} />,
    },
    {
      id: "desc",
      header: "Description",
      cell: s => s.Description || "-",
    },
    {
      id: "created",
      header: "Created time",
      cell: s => fmt(s.CreationTime),
    },
    {
      id: "updated",
      header: "Updated time",
      cell: s => fmt(s.LastUpdatedTime || s.CreationTime),
    },
  ];

  const actions: Action<StackRow>[] = [
    {
      id: "delete",
      text: "Delete stack",
      disabled: sel => sel.length !== 1 || sel[0].StackStatus.endsWith("_IN_PROGRESS"),
      run: sel => {
        setDeleteTarget(sel[0]);
        setConfirmName("");
        setError(null);
      },
    },
  ];

  const handleDelete = async (reload: () => void) => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      await cfn("DeleteStack", { StackName: deleteTarget.StackName });
      flash.notify({ type: "success", content: `Requested deletion of stack ${deleteTarget.StackName}.` });
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
      <ResourcePage<StackRow>
        title="Stacks"
        description="A stack is a collection of AWS resources that you can manage as a single unit using CloudFormation templates."
        load={loadStacks}
        columns={columns}
        trackBy="StackName"
        create={{ text: "Create stack", href: "#/cloudformation/stacks/create" }}
        actions={actions}
        multi={false}
        poll={s => s.StackStatus.endsWith("_IN_PROGRESS")}
        banner={
          <EmulatorNote>
            CloudFormation templates execute and provision real local emulator resources (S3 buckets, DynamoDB tables, SQS queues, Lambda functions, etc.) with dependency graph ordering.
          </EmulatorNote>
        }
      />

      {deleteTarget && (
        <Modal
          visible={true}
          onDismiss={() => setDeleteTarget(null)}
          header={`Delete stack: ${deleteTarget.StackName}`}
          footer={
            <Box float="right">
              <SpaceBetween direction="horizontal" size="xs">
                <Button variant="link" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  loading={deleting}
                  disabled={confirmName !== deleteTarget.StackName}
                  onClick={() => handleDelete(() => window.location.reload())}
                >
                  Delete stack
                </Button>
              </SpaceBetween>
            </Box>
          }
        >
          <SpaceBetween size="m">
            <Box>
              Are you sure you want to delete stack <b>{deleteTarget.StackName}</b>?
              All resources provisioned by this stack will be deleted.
            </Box>
            <FormField label={`To confirm deletion, type "${deleteTarget.StackName}" in the field below:`}>
              <Input
                value={confirmName}
                placeholder={deleteTarget.StackName}
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
