import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Table from "@cloudscape-design/components/table";
import Link from "@cloudscape-design/components/link";
import Modal from "@cloudscape-design/components/modal";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import { useAsync, useFlash, ErrorAlert, ValueWithLabel, Copyable } from "../../common";
import { useCrumbs } from "../../App";
import { ecs, crumbs, St, fmt, arnName, tdShort, enc } from "./lib";

export default function TaskDetail() {
  const { cluster = "", taskId = "" } = useParams();
  const nav = useNavigate();
  const flash = useFlash();

  useCrumbs(
    crumbs(
      { text: "Clusters", href: "#/ecs/clusters" },
      { text: cluster, href: `#/ecs/clusters/${enc(cluster)}` },
      { text: taskId }
    )
  );

  const data = useAsync(async () => {
    const res = await ecs("DescribeTasks", {
      cluster,
      tasks: [taskId],
    });
    const t = (res.tasks || [])[0];
    if (!t) throw new Error(`Task ${taskId} not found in cluster ${cluster}`);
    return t;
  }, [cluster, taskId]);

  const task = data.data;

  const [stopModal, setStopModal] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const handleStop = async () => {
    setStopping(true);
    setError(null);
    try {
      await ecs("StopTask", {
        cluster,
        task: task.taskArn,
        reason: "Stopped manually via AWS Emulator Console",
      });
      flash.notify({
        type: "success",
        content: `Stopped task ${taskId}.`,
      });
      setStopModal(false);
      data.reload();
    } catch (e) {
      setError(e);
    } finally {
      setStopping(false);
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
                disabled={task?.lastStatus === "STOPPED"}
                onClick={() => setStopModal(true)}
              >
                Stop task
              </Button>
            </SpaceBetween>
          }
        >
          Task: {taskId}
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Task details</Header>}>
          <ColumnLayout columns={4} variant="text-grid">
            <ValueWithLabel label="Last status">
              <St s={task?.lastStatus} />
            </ValueWithLabel>
            <ValueWithLabel label="Desired status">
              {task?.desiredStatus || "-"}
            </ValueWithLabel>
            <ValueWithLabel label="Task definition">
              {task?.taskDefinitionArn ? (
                <Copyable text={task.taskDefinitionArn} label={tdShort(task.taskDefinitionArn)} />
              ) : (
                "-"
              )}
            </ValueWithLabel>
            <ValueWithLabel label="Cluster">
              <Link href={`#/ecs/clusters/${enc(cluster)}`}>{cluster}</Link>
            </ValueWithLabel>
            <ValueWithLabel label="Launch type">{task?.launchType || "FARGATE"}</ValueWithLabel>
            <ValueWithLabel label="Started at">{fmt(task?.startedAt || task?.createdAt)}</ValueWithLabel>
            <ValueWithLabel label="Stopped at">{fmt(task?.stoppedAt)}</ValueWithLabel>
            <ValueWithLabel label="Stopped reason">{task?.stoppedReason || "-"}</ValueWithLabel>
            <ValueWithLabel label="Task ARN">
              {task?.taskArn ? <Copyable text={task.taskArn} /> : "-"}
            </ValueWithLabel>
          </ColumnLayout>
        </Container>

        <Container
          header={
            <Header variant="h2" counter={`(${task?.containers?.length || 0})`}>
              Containers
            </Header>
          }
        >
          <Table
            items={task?.containers || []}
            columnDefinitions={[
              { id: "name", header: "Name", cell: (c: any) => <b>{c.name}</b> },
              { id: "image", header: "Image", cell: (c: any) => c.image },
              { id: "status", header: "Status", cell: (c: any) => <St s={c.lastStatus} /> },
              { id: "exitCode", header: "Exit code", cell: (c: any) => (c.exitCode !== undefined ? c.exitCode : "-") },
              {
                id: "network",
                header: "Network bindings",
                cell: (c: any) =>
                  (c.networkBindings || [])
                    .map((b: any) => `${b.bindIP || "0.0.0.0"}:${b.hostPort} -> ${b.containerPort}/${b.protocol}`)
                    .join(", ") || "-",
              },
              { id: "reason", header: "Reason", cell: (c: any) => c.reason || "-" },
            ]}
          />
        </Container>

        {stopModal && (
          <Modal
            visible={true}
            onDismiss={() => setStopModal(false)}
            header={`Stop task ${taskId}`}
            footer={
              <Box float="right">
                <SpaceBetween direction="horizontal" size="xs">
                  <Button variant="link" onClick={() => setStopModal(false)} disabled={stopping}>
                    Cancel
                  </Button>
                  <Button variant="primary" loading={stopping} onClick={handleStop}>
                    Stop task
                  </Button>
                </SpaceBetween>
              </Box>
            }
          >
            <SpaceBetween size="m">
              <Box>
                Are you sure you want to stop task <code>{taskId}</code> in cluster <b>{cluster}</b>?
              </Box>
              <ErrorAlert error={error} />
            </SpaceBetween>
          </Modal>
        )}
      </SpaceBetween>
    </ContentLayout>
  );
}
