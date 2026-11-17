import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Link from "@cloudscape-design/components/link";
import Modal from "@cloudscape-design/components/modal";
import Box from "@cloudscape-design/components/box";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Button from "@cloudscape-design/components/button";
import FormField from "@cloudscape-design/components/form-field";
import Textarea from "@cloudscape-design/components/textarea";
import Badge from "@cloudscape-design/components/badge";
import { ResourcePage, type Col, type Action } from "../ec2/ResourcePage";
import { useCrumbs } from "../../App";
import { useFlash, ErrorAlert, EmulatorNote, Copyable } from "../../common";
import { sfn, crumbs, smNameFromArn, fmt, enc } from "./lib";

export interface StateMachineRow {
  stateMachineArn: string;
  name: string;
  type: string;
  creationDate: string;
}

export default function StateMachines() {
  useCrumbs(crumbs({ text: "State machines" }));
  const nav = useNavigate();
  const flash = useFlash();

  // Start execution modal
  const [execTarget, setExecTarget] = useState<StateMachineRow | null>(null);
  const [execInput, setExecInput] = useState('{\n  "comment": "Start manual execution"\n}');
  const [starting, setStarting] = useState(false);

  // Delete modal
  const [deleteTarget, setDeleteTarget] = useState<StateMachineRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const loadStateMachines = async (): Promise<StateMachineRow[]> => {
    const res = await sfn("ListStateMachines");
    return res.stateMachines || [];
  };

  const columns: Col<StateMachineRow>[] = [
    {
      id: "name",
      header: "Name",
      cell: sm => (
        <Link href={`#/stepfunctions/state-machines/${enc(sm.stateMachineArn)}`}>
          <b>{sm.name}</b>
        </Link>
      ),
    },
    {
      id: "type",
      header: "Type",
      cell: sm => (sm.type === "EXPRESS" ? <Badge color="blue">Express</Badge> : <Badge color="grey">Standard</Badge>),
    },
    {
      id: "arn",
      header: "ARN",
      cell: sm => (
        <SpaceBetween direction="horizontal" size="xxs">
          <code>{sm.stateMachineArn.slice(0, 30)}...</code>
          <Copyable text={sm.stateMachineArn} iconOnly />
        </SpaceBetween>
      ),
    },
    {
      id: "created",
      header: "Created",
      cell: sm => fmt(sm.creationDate),
    },
  ];

  const actions: Action<StateMachineRow>[] = [
    {
      id: "start",
      text: "Start execution",
      disabled: sel => sel.length !== 1,
      run: sel => {
        setExecTarget(sel[0]);
        setError(null);
      },
    },
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

  const handleStartExecution = async () => {
    if (!execTarget) return;
    setStarting(true);
    setError(null);
    try {
      try {
        JSON.parse(execInput);
      } catch {
        throw new Error("Invalid JSON in execution input.");
      }

      const res = await sfn("StartExecution", {
        stateMachineArn: execTarget.stateMachineArn,
        input: execInput.trim(),
      });
      flash.notify({
        type: "success",
        content: `Started execution ${res.executionArn.split(":").pop()}.`,
      });
      setExecTarget(null);
      nav(`/stepfunctions/executions/${enc(res.executionArn)}`);
    } catch (e) {
      setError(e);
    } finally {
      setStarting(false);
    }
  };

  const handleDelete = async (reload: () => void) => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      await sfn("DeleteStateMachine", { stateMachineArn: deleteTarget.stateMachineArn });
      flash.notify({ type: "success", content: `Deleted state machine ${deleteTarget.name}.` });
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
      <ResourcePage<StateMachineRow>
        title="State machines"
        description="AWS Step Functions lets you coordinate multiple AWS services into serverless workflows so you can build and update apps quickly."
        load={loadStateMachines}
        columns={columns}
        trackBy="stateMachineArn"
        create={{ text: "Create state machine", href: "#/stepfunctions/state-machines/create" }}
        actions={actions}
        multi={false}
        banner={
          <EmulatorNote>
            The emulator executes Step Functions workflows locally. States (Pass, Task, Choice, Parallel) progress in real time with event history logging.
          </EmulatorNote>
        }
      />

      {/* Start Execution Modal */}
      {execTarget && (
        <Modal
          visible={true}
          onDismiss={() => setExecTarget(null)}
          size="large"
          header={`Start execution: ${execTarget.name}`}
          footer={
            <Box float="right">
              <SpaceBetween direction="horizontal" size="xs">
                <Button variant="link" onClick={() => setExecTarget(null)} disabled={starting}>
                  Cancel
                </Button>
                <Button variant="primary" loading={starting} onClick={handleStartExecution}>
                  Start execution
                </Button>
              </SpaceBetween>
            </Box>
          }
        >
          <SpaceBetween size="m">
            <FormField label="Execution input (JSON)">
              <div className="code-editor">
                <Textarea
                  value={execInput}
                  rows={8}
                  onChange={e => setExecInput(e.detail.value)}
                />
              </div>
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
          header={`Delete state machine ${deleteTarget.name}`}
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
              Are you sure you want to delete state machine <b>{deleteTarget.name}</b>?
            </Box>
            <ErrorAlert error={error} />
          </SpaceBetween>
        </Modal>
      )}
    </>
  );
}
