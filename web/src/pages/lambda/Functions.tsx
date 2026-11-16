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
import { useFlash, ErrorAlert, EmulatorNote } from "../../common";
import { lam, lamAll, crumbs, St, fmt, fmtBytes, enc } from "./lib";

export interface FunctionRow {
  FunctionName: string;
  FunctionArn: string;
  Runtime?: string;
  Role?: string;
  Handler?: string;
  CodeSize?: number;
  Description?: string;
  Timeout?: number;
  MemorySize?: number;
  LastModified?: string;
  State?: string;
}

export default function Functions() {
  useCrumbs(crumbs({ text: "Functions" }));
  const flash = useFlash();

  const [deleteTarget, setDeleteTarget] = useState<FunctionRow | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const loadFunctions = async (): Promise<FunctionRow[]> => {
    const list = await lamAll("ListFunctions", "Functions");
    return list || [];
  };

  const columns: Col<FunctionRow>[] = [
    {
      id: "name",
      header: "Function name",
      cell: f => (
        <Link href={`#/lambda/functions/${enc(f.FunctionName)}`}>
          <b>{f.FunctionName}</b>
        </Link>
      ),
    },
    {
      id: "runtime",
      header: "Runtime",
      cell: f => f.Runtime || "-",
    },
    {
      id: "handler",
      header: "Handler",
      cell: f => <code>{f.Handler || "-"}</code>,
    },
    {
      id: "memory",
      header: "Memory",
      cell: f => (f.MemorySize ? `${f.MemorySize} MB` : "-"),
    },
    {
      id: "timeout",
      header: "Timeout",
      cell: f => (f.Timeout ? `${f.Timeout} s` : "-"),
    },
    {
      id: "state",
      header: "State",
      cell: f => <St s={f.State || "Active"} />,
    },
    {
      id: "codeSize",
      header: "Code size",
      cell: f => fmtBytes(f.CodeSize),
    },
    {
      id: "modified",
      header: "Last modified",
      cell: f => fmt(f.LastModified),
    },
  ];

  const actions: Action<FunctionRow>[] = [
    {
      id: "delete",
      text: "Delete function",
      disabled: sel => sel.length !== 1,
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
      await lam("DeleteFunction", { FunctionName: deleteTarget.FunctionName });
      flash.notify({
        type: "success",
        content: `Deleted function ${deleteTarget.FunctionName}.`,
      });
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
      <ResourcePage<FunctionRow>
        title="Functions"
        description="AWS Lambda runs your code in response to events and automatically manages the underlying compute resources for you."
        load={loadFunctions}
        columns={columns}
        trackBy="FunctionName"
        create={{ text: "Create function", href: "#/lambda/functions/create" }}
        actions={actions}
        multi={false}
        poll={f => f.State === "Pending" || f.State === "Updating"}
        banner={
          <EmulatorNote>
            The emulator executes Lambda functions locally on your machine. Functions execute within a sandboxed runtime and support real input/output payloads and log streaming.
          </EmulatorNote>
        }
      />

      {deleteTarget && (
        <Modal
          visible={true}
          onDismiss={() => setDeleteTarget(null)}
          header={`Delete function: ${deleteTarget.FunctionName}`}
          footer={
            <Box float="right">
              <SpaceBetween direction="horizontal" size="xs">
                <Button variant="link" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  loading={deleting}
                  disabled={confirmName !== deleteTarget.FunctionName}
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
              Are you sure you want to delete function <b>{deleteTarget.FunctionName}</b>?
              This action cannot be undone.
            </Box>
            <FormField label={`To confirm deletion, type "${deleteTarget.FunctionName}" in the field below:`}>
              <Input
                value={confirmName}
                placeholder={deleteTarget.FunctionName}
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
