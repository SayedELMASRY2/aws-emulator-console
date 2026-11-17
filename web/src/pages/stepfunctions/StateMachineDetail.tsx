import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import Tabs from "@cloudscape-design/components/tabs";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Table from "@cloudscape-design/components/table";
import Link from "@cloudscape-design/components/link";
import Modal from "@cloudscape-design/components/modal";
import FormField from "@cloudscape-design/components/form-field";
import Textarea from "@cloudscape-design/components/textarea";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Badge from "@cloudscape-design/components/badge";
import { useCrumbs } from "../../App";
import { useAsync, useFlash, ErrorAlert, ValueWithLabel, Copyable } from "../../common";
import { sfn, crumbs, smNameFromArn, St, fmt, enc } from "./lib";

export default function StateMachineDetail() {
  const { smArn = "" } = useParams();
  const nav = useNavigate();
  const flash = useFlash();

  const name = smNameFromArn(smArn);

  useCrumbs(
    crumbs(
      { text: "State machines", href: "#/stepfunctions/state-machines" },
      { text: name }
    )
  );

  const smData = useAsync(async () => {
    const res = await sfn("DescribeStateMachine", { stateMachineArn: smArn });
    return res;
  }, [smArn]);

  const execData = useAsync(async () => {
    try {
      const res = await sfn("ListExecutions", { stateMachineArn: smArn });
      return res.executions || [];
    } catch {
      return [];
    }
  }, [smArn]);

  const sm = smData.data;

  // Start execution modal
  const [startOpen, setStartOpen] = useState(false);
  const [execInput, setExecInput] = useState('{\n  "comment": "Start execution from console"\n}');
  const [starting, setStarting] = useState(false);

  // Delete modal
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const handleStartExecution = async () => {
    setStarting(true);
    setError(null);
    try {
      try {
        JSON.parse(execInput);
      } catch {
        throw new Error("Invalid JSON in execution input.");
      }

      const res = await sfn("StartExecution", {
        stateMachineArn: smArn,
        input: execInput.trim(),
      });
      flash.notify({
        type: "success",
        content: `Started execution ${res.executionArn.split(":").pop()}.`,
      });
      setStartOpen(false);
      nav(`/stepfunctions/executions/${enc(res.executionArn)}`);
    } catch (e) {
      setError(e);
    } finally {
      setStarting(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await sfn("DeleteStateMachine", { stateMachineArn: smArn });
      flash.notify({ type: "success", content: `Deleted state machine ${name}.` });
      nav("/stepfunctions/state-machines");
    } catch (e) {
      setError(e);
    } finally {
      setDeleting(false);
    }
  };

  let formattedDefinition = "";
  if (sm?.definition) {
    try {
      formattedDefinition = JSON.stringify(JSON.parse(sm.definition), null, 2);
    } catch {
      formattedDefinition = sm.definition;
    }
  }

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          info={sm?.type === "EXPRESS" ? <Badge color="blue">Express</Badge> : <Badge color="grey">Standard</Badge>}
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="primary" onClick={() => setStartOpen(true)}>
                Start execution
              </Button>
              <Button onClick={() => setDeleteOpen(true)}>
                Delete
              </Button>
            </SpaceBetween>
          }
        >
          {name}
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Details</Header>}>
          <ColumnLayout columns={4} variant="text-grid">
            <ValueWithLabel label="Type">{sm?.type || "STANDARD"}</ValueWithLabel>
            <ValueWithLabel label="Created at">{fmt(sm?.creationDate)}</ValueWithLabel>
            <ValueWithLabel label="Role ARN">
              {sm?.roleArn ? <Copyable text={sm.roleArn} /> : "-"}
            </ValueWithLabel>
            <ValueWithLabel label="ARN">
              {sm?.stateMachineArn ? <Copyable text={sm.stateMachineArn} /> : "-"}
            </ValueWithLabel>
          </ColumnLayout>
        </Container>

        <Tabs
          tabs={[
            {
              id: "executions",
              label: `Executions (${execData.data?.length ?? 0})`,
              content: (
                <Table
                  items={execData.data || []}
                  loading={execData.loading}
                  columnDefinitions={[
                    {
                      id: "name",
                      header: "Name",
                      cell: (e: any) => (
                        <Link href={`#/stepfunctions/executions/${enc(e.executionArn)}`}>
                          <b>{e.name}</b>
                        </Link>
                      ),
                    },
                    {
                      id: "status",
                      header: "Status",
                      cell: (e: any) => <St s={e.status} />,
                    },
                    {
                      id: "started",
                      header: "Started",
                      cell: (e: any) => fmt(e.startDate),
                    },
                    {
                      id: "stopped",
                      header: "Stopped",
                      cell: (e: any) => fmt(e.stopDate),
                    },
                  ]}
                  empty={
                    <Box textAlign="center" color="inherit">
                      <b>No executions yet</b>
                      <Box variant="p" color="text-body-secondary">
                        Start an execution to run this state machine workflow.
                      </Box>
                    </Box>
                  }
                />
              ),
            },
            {
              id: "definition",
              label: "Definition",
              content: (
                <Container header={<Header variant="h2">Amazon States Language (ASL)</Header>}>
                  <div className="code-editor">
                    <Textarea value={formattedDefinition} rows={18} readOnly />
                  </div>
                </Container>
              ),
            },
          ]}
        />

        {/* Start Execution Modal */}
        {startOpen && (
          <Modal
            visible={true}
            onDismiss={() => setStartOpen(false)}
            size="large"
            header={`Start execution: ${name}`}
            footer={
              <Box float="right">
                <SpaceBetween direction="horizontal" size="xs">
                  <Button variant="link" onClick={() => setStartOpen(false)} disabled={starting}>
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
        {deleteOpen && (
          <Modal
            visible={true}
            onDismiss={() => setDeleteOpen(false)}
            header={`Delete state machine ${name}`}
            footer={
              <Box float="right">
                <SpaceBetween direction="horizontal" size="xs">
                  <Button variant="link" onClick={() => setDeleteOpen(false)} disabled={deleting}>
                    Cancel
                  </Button>
                  <Button variant="primary" loading={deleting} onClick={handleDelete}>
                    Delete
                  </Button>
                </SpaceBetween>
              </Box>
            }
          >
            <SpaceBetween size="m">
              <Box>
                Are you sure you want to delete state machine <b>{name}</b>?
              </Box>
              <ErrorAlert error={error} />
            </SpaceBetween>
          </Modal>
        )}
      </SpaceBetween>
    </ContentLayout>
  );
}
