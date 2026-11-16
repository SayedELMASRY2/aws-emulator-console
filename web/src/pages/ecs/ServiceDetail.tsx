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
import Input from "@cloudscape-design/components/input";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import { useAsync, useFlash, ErrorAlert, ValueWithLabel, Copyable } from "../../common";
import { useCrumbs } from "../../App";
import { ecs, crumbs, St, fmt, arnName, tdShort, enc } from "./lib";

export default function ServiceDetail() {
  const { cluster = "", service = "" } = useParams();
  const nav = useNavigate();
  const flash = useFlash();

  useCrumbs(
    crumbs(
      { text: "Clusters", href: "#/ecs/clusters" },
      { text: cluster, href: `#/ecs/clusters/${enc(cluster)}` },
      { text: service }
    )
  );

  const data = useAsync(async () => {
    const res = await ecs("DescribeServices", {
      cluster,
      services: [service],
    });
    const s = (res.services || [])[0];
    if (!s) throw new Error(`Service ${service} not found`);
    return s;
  }, [cluster, service]);

  const svc = data.data;

  // Scale modal
  const [scaleModal, setScaleModal] = useState(false);
  const [desiredCount, setDesiredCount] = useState("1");
  const [scaling, setScaling] = useState(false);

  // Delete modal
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);

  const handleScale = async () => {
    setScaling(true);
    setActionError(null);
    try {
      await ecs("UpdateService", {
        cluster,
        service,
        desiredCount: parseInt(desiredCount, 10) || 0,
      });
      flash.notify({
        type: "success",
        content: `Updated desired count for ${service} to ${desiredCount}.`,
      });
      setScaleModal(false);
      data.reload();
    } catch (e) {
      setActionError(e);
    } finally {
      setScaling(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setActionError(null);
    try {
      await ecs("DeleteService", {
        cluster,
        service,
        force: true,
      });
      flash.notify({ type: "success", content: `Deleted service ${service}.` });
      nav(`/ecs/clusters/${enc(cluster)}`);
    } catch (e) {
      setActionError(e);
    } finally {
      setDeleting(false);
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
                  setDesiredCount(String(svc?.desiredCount ?? 1));
                  setScaleModal(true);
                }}
              >
                Update desired count
              </Button>
              <Button onClick={() => setDeleteModal(true)}>
                Delete service
              </Button>
            </SpaceBetween>
          }
        >
          {service}
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Service details</Header>}>
          <ColumnLayout columns={4} variant="text-grid">
            <ValueWithLabel label="Status">
              <St s={svc?.status} />
            </ValueWithLabel>
            <ValueWithLabel label="Cluster">
              <Link href={`#/ecs/clusters/${enc(cluster)}`}>{cluster}</Link>
            </ValueWithLabel>
            <ValueWithLabel label="Desired tasks">{svc?.desiredCount ?? 0}</ValueWithLabel>
            <ValueWithLabel label="Running tasks">{svc?.runningCount ?? 0}</ValueWithLabel>
            <ValueWithLabel label="Pending tasks">{svc?.pendingCount ?? 0}</ValueWithLabel>
            <ValueWithLabel label="Launch type">{svc?.launchType || "FARGATE"}</ValueWithLabel>
            <ValueWithLabel label="Task definition">
              {svc?.taskDefinition ? <Copyable text={svc.taskDefinition} label={tdShort(svc.taskDefinition)} /> : "-"}
            </ValueWithLabel>
            <ValueWithLabel label="Service ARN">
              {svc?.serviceArn ? <Copyable text={svc.serviceArn} /> : "-"}
            </ValueWithLabel>
          </ColumnLayout>
        </Container>

        <Tabs
          tabs={[
            {
              id: "deployments",
              label: "Deployments",
              content: (
                <Table
                  items={svc?.deployments || []}
                  columnDefinitions={[
                    { id: "id", header: "Deployment ID", cell: (d: any) => <code>{d.id}</code> },
                    { id: "status", header: "Status", cell: (d: any) => <St s={d.status} /> },
                    { id: "taskDef", header: "Task definition", cell: (d: any) => tdShort(d.taskDefinition) },
                    { id: "desired", header: "Desired", cell: (d: any) => d.desiredCount },
                    { id: "running", header: "Running", cell: (d: any) => d.runningCount },
                    { id: "pending", header: "Pending", cell: (d: any) => d.pendingCount },
                    { id: "updated", header: "Updated at", cell: (d: any) => fmt(d.updatedAt || d.createdAt) },
                  ]}
                />
              ),
            },
            {
              id: "events",
              label: `Events (${svc?.events?.length || 0})`,
              content: (
                <Table
                  items={svc?.events || []}
                  columnDefinitions={[
                    { id: "timestamp", header: "Timestamp", cell: (e: any) => fmt(e.createdAt) },
                    { id: "message", header: "Message", cell: (e: any) => e.message },
                  ]}
                  empty="No recent service events recorded."
                />
              ),
            },
            {
              id: "networking",
              label: "Networking",
              content: (
                <Container header={<Header variant="h2">Network configuration</Header>}>
                  <ColumnLayout columns={2} variant="text-grid">
                    <ValueWithLabel label="Subnets">
                      {(svc?.networkConfiguration?.awsvpcConfiguration?.subnets || []).join(", ") || "None"}
                    </ValueWithLabel>
                    <ValueWithLabel label="Security groups">
                      {(svc?.networkConfiguration?.awsvpcConfiguration?.securityGroups || []).join(", ") || "Default"}
                    </ValueWithLabel>
                    <ValueWithLabel label="Assign public IP">
                      {svc?.networkConfiguration?.awsvpcConfiguration?.assignPublicIp || "DISABLED"}
                    </ValueWithLabel>
                  </ColumnLayout>
                </Container>
              ),
            },
          ]}
        />

        {/* Modal: Scale */}
        {scaleModal && (
          <Modal
            visible={true}
            onDismiss={() => setScaleModal(false)}
            header={`Update desired tasks: ${service}`}
            footer={
              <Box float="right">
                <SpaceBetween direction="horizontal" size="xs">
                  <Button variant="link" onClick={() => setScaleModal(false)} disabled={scaling}>
                    Cancel
                  </Button>
                  <Button variant="primary" loading={scaling} onClick={handleScale}>
                    Save
                  </Button>
                </SpaceBetween>
              </Box>
            }
          >
            <SpaceBetween size="m">
              <FormField label="Desired tasks">
                <Input
                  type="number"
                  value={desiredCount}
                  onChange={e => setDesiredCount(e.detail.value)}
                />
              </FormField>
              <ErrorAlert error={actionError} />
            </SpaceBetween>
          </Modal>
        )}

        {/* Modal: Delete */}
        {deleteModal && (
          <Modal
            visible={true}
            onDismiss={() => setDeleteModal(false)}
            header={`Delete service ${service}`}
            footer={
              <Box float="right">
                <SpaceBetween direction="horizontal" size="xs">
                  <Button variant="link" onClick={() => setDeleteModal(false)} disabled={deleting}>
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
                Are you sure you want to delete service <b>{service}</b> in cluster <b>{cluster}</b>?
              </Box>
              <ErrorAlert error={actionError} />
            </SpaceBetween>
          </Modal>
        )}
      </SpaceBetween>
    </ContentLayout>
  );
}
