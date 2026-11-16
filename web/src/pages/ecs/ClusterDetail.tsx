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
import ColumnLayout from "@cloudscape-design/components/column-layout";
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import { useAsync, useFlash, ErrorAlert, EmulatorNote, ValueWithLabel, Copyable } from "../../common";
import { useCrumbs } from "../../App";
import { ecs, ecsAll, crumbs, St, fmt, arnName, tdShort, enc } from "./lib";

export default function ClusterDetail() {
  const { cluster = "" } = useParams();
  const nav = useNavigate();
  const flash = useFlash();

  useCrumbs(crumbs({ text: "Clusters", href: "#/ecs/clusters" }, { text: cluster }));

  // Load cluster metadata
  const clusterData = useAsync(async () => {
    const res = await ecs("DescribeClusters", {
      clusters: [cluster],
      include: ["STATISTICS", "SETTINGS"],
    });
    const c = (res.clusters || [])[0];
    if (!c) throw new Error(`Cluster ${cluster} not found`);
    return c;
  }, [cluster]);

  // Load services
  const servicesData = useAsync(async () => {
    const arns: string[] = await ecsAll("ListServices", "serviceArns", { cluster });
    if (!arns.length) return [];
    const out: any[] = [];
    for (let i = 0; i < arns.length; i += 10) {
      const chunk = arns.slice(i, i + 10);
      const res = await ecs("DescribeServices", { cluster, services: chunk });
      out.push(...(res.services || []));
    }
    return out;
  }, [cluster]);

  // Load tasks
  const tasksData = useAsync(async () => {
    const [runningArns, stoppedArns] = await Promise.all([
      ecsAll("ListTasks", "taskArns", { cluster }),
      ecsAll("ListTasks", "taskArns", { cluster, desiredStatus: "STOPPED" }),
    ]);
    const allArns = Array.from(new Set([...runningArns, ...stoppedArns]));
    if (!allArns.length) return [];
    const out: any[] = [];
    for (let i = 0; i < allArns.length; i += 100) {
      const chunk = allArns.slice(i, i + 100);
      const res = await ecs("DescribeTasks", { cluster, tasks: chunk });
      out.push(...(res.tasks || []));
    }
    return out;
  }, [cluster]);

  // Modals state
  const [deleteClusterModal, setDeleteClusterModal] = useState(false);
  const [deletingCluster, setDeletingCluster] = useState(false);

  const [updateServiceModal, setUpdateServiceModal] = useState<any | null>(null);
  const [newDesiredCount, setNewDesiredCount] = useState<string>("1");
  const [updatingService, setUpdatingService] = useState(false);

  const [deleteServiceModal, setDeleteServiceModal] = useState<any | null>(null);
  const [deletingService, setDeletingService] = useState(false);

  const [stopTaskModal, setStopTaskModal] = useState<any | null>(null);
  const [stoppingTask, setStoppingTask] = useState(false);

  const [selectedServices, setSelectedServices] = useState<any[]>([]);
  const [selectedTasks, setSelectedTasks] = useState<any[]>([]);
  const [actionError, setActionError] = useState<unknown>(null);

  // Cluster deletion
  const handleDeleteCluster = async () => {
    setDeletingCluster(true);
    setActionError(null);
    try {
      await ecs("DeleteCluster", { cluster });
      flash.notify({ type: "success", content: `Deleted cluster ${cluster}.` });
      nav("/ecs/clusters");
    } catch (e) {
      setActionError(e);
    } finally {
      setDeletingCluster(false);
    }
  };

  // Service actions
  const handleUpdateDesiredCount = async () => {
    if (!updateServiceModal) return;
    setUpdatingService(true);
    setActionError(null);
    try {
      await ecs("UpdateService", {
        cluster,
        service: updateServiceModal.serviceName,
        desiredCount: parseInt(newDesiredCount, 10) || 0,
      });
      flash.notify({
        type: "success",
        content: `Updated desired count for service ${updateServiceModal.serviceName} to ${newDesiredCount}.`,
      });
      setUpdateServiceModal(null);
      servicesData.reload();
      clusterData.reload();
    } catch (e) {
      setActionError(e);
    } finally {
      setUpdatingService(false);
    }
  };

  const handleDeleteService = async () => {
    if (!deleteServiceModal) return;
    setDeletingService(true);
    setActionError(null);
    try {
      await ecs("DeleteService", {
        cluster,
        service: deleteServiceModal.serviceName,
        force: true,
      });
      flash.notify({
        type: "success",
        content: `Deleted service ${deleteServiceModal.serviceName}.`,
      });
      setDeleteServiceModal(null);
      servicesData.reload();
      clusterData.reload();
    } catch (e) {
      setActionError(e);
    } finally {
      setDeletingService(false);
    }
  };

  // Task stop
  const handleStopTask = async () => {
    if (!stopTaskModal) return;
    setStoppingTask(true);
    setActionError(null);
    try {
      await ecs("StopTask", {
        cluster,
        task: stopTaskModal.taskArn,
        reason: "Stopped manually via AWS Emulator Console",
      });
      flash.notify({
        type: "success",
        content: `Requested stop for task ${arnName(stopTaskModal.taskArn)}.`,
      });
      setStopTaskModal(null);
      tasksData.reload();
      clusterData.reload();
    } catch (e) {
      setActionError(e);
    } finally {
      setStoppingTask(false);
    }
  };

  const c = clusterData.data;

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <ButtonDropdown
                items={[{ id: "delete", text: "Delete cluster" }]}
                onItemClick={e => {
                  if (e.detail.id === "delete") setDeleteClusterModal(true);
                }}
              >
                Actions
              </ButtonDropdown>
            </SpaceBetween>
          }
        >
          {cluster}
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Overview</Header>}>
          <ColumnLayout columns={4} variant="text-grid">
            <ValueWithLabel label="Status">
              <St s={c?.status} />
            </ValueWithLabel>
            <ValueWithLabel label="Active services">
              {c?.activeServicesCount ?? 0}
            </ValueWithLabel>
            <ValueWithLabel label="Running tasks">
              {c?.runningTasksCount ?? 0}
            </ValueWithLabel>
            <ValueWithLabel label="Pending tasks">
              {c?.pendingTasksCount ?? 0}
            </ValueWithLabel>
            <ValueWithLabel label="Registered instances">
              {c?.registeredContainerInstancesCount ?? 0}
            </ValueWithLabel>
            <ValueWithLabel label="Capacity providers">
              {(c?.capacityProviders || ["FARGATE", "FARGATE_SPOT"]).join(", ")}
            </ValueWithLabel>
            <ValueWithLabel label="Cluster ARN">
              {c?.clusterArn ? <Copyable text={c.clusterArn} /> : "-"}
            </ValueWithLabel>
          </ColumnLayout>
        </Container>

        <Tabs
          tabs={[
            {
              id: "services",
              label: `Services (${servicesData.data?.length ?? 0})`,
              content: (
                <Table
                  items={servicesData.data || []}
                  loading={servicesData.loading}
                  loadingText="Loading services..."
                  selectedItems={selectedServices}
                  onSelectionChange={e => setSelectedServices(e.detail.selectedItems)}
                  selectionType="single"
                  trackBy="serviceArn"
                  header={
                    <Header
                      variant="h2"
                      actions={
                        <SpaceBetween direction="horizontal" size="xs">
                          <ButtonDropdown
                            disabled={!selectedServices.length}
                            items={[
                              { id: "scale", text: "Update desired count" },
                              { id: "delete", text: "Delete service" },
                            ]}
                            onItemClick={e => {
                              const s = selectedServices[0];
                              if (!s) return;
                              if (e.detail.id === "scale") {
                                setUpdateServiceModal(s);
                                setNewDesiredCount(String(s.desiredCount || 1));
                              } else if (e.detail.id === "delete") {
                                setDeleteServiceModal(s);
                              }
                            }}
                          >
                            Actions
                          </ButtonDropdown>
                          <Button
                            variant="primary"
                            href={`#/ecs/clusters/${enc(cluster)}/services/create`}
                          >
                            Create service
                          </Button>
                        </SpaceBetween>
                      }
                    >
                      Services
                    </Header>
                  }
                  columnDefinitions={[
                    {
                      id: "name",
                      header: "Service name",
                      cell: s => (
                        <Link href={`#/ecs/clusters/${enc(cluster)}/services/${enc(s.serviceName)}`}>
                          <b>{s.serviceName}</b>
                        </Link>
                      ),
                    },
                    {
                      id: "status",
                      header: "Status",
                      cell: s => <St s={s.status} />,
                    },
                    {
                      id: "desired",
                      header: "Desired",
                      cell: s => s.desiredCount ?? 0,
                    },
                    {
                      id: "running",
                      header: "Running",
                      cell: s => s.runningCount ?? 0,
                    },
                    {
                      id: "pending",
                      header: "Pending",
                      cell: s => s.pendingCount ?? 0,
                    },
                    {
                      id: "taskDef",
                      header: "Task definition",
                      cell: s => {
                        const td = tdShort(s.taskDefinition);
                        return s.taskDefinition ? <Copyable text={s.taskDefinition} label={td} /> : "-";
                      },
                    },
                    {
                      id: "launchType",
                      header: "Launch type",
                      cell: s =>
                        s.launchType ||
                        (s.capacityProviderStrategy || []).map((x: any) => x.capacityProvider).join(", ") ||
                        "FARGATE",
                    },
                  ]}
                  empty={
                    <Box textAlign="center" color="inherit">
                      <b>No services</b>
                      <Box variant="p" color="text-body-secondary">
                        Create a service to maintain and run copies of task definitions simultaneously.
                      </Box>
                    </Box>
                  }
                />
              ),
            },
            {
              id: "tasks",
              label: `Tasks (${tasksData.data?.length ?? 0})`,
              content: (
                <Table
                  items={tasksData.data || []}
                  loading={tasksData.loading}
                  loadingText="Loading tasks..."
                  selectedItems={selectedTasks}
                  onSelectionChange={e => setSelectedTasks(e.detail.selectedItems)}
                  selectionType="single"
                  trackBy="taskArn"
                  header={
                    <Header
                      variant="h2"
                      actions={
                        <SpaceBetween direction="horizontal" size="xs">
                          <Button
                            disabled={!selectedTasks.length || selectedTasks[0].lastStatus === "STOPPED"}
                            onClick={() => setStopTaskModal(selectedTasks[0])}
                          >
                            Stop task
                          </Button>
                          <Button
                            variant="primary"
                            href={`#/ecs/clusters/${enc(cluster)}/tasks/run`}
                          >
                            Run new task
                          </Button>
                        </SpaceBetween>
                      }
                    >
                      Tasks
                    </Header>
                  }
                  columnDefinitions={[
                    {
                      id: "id",
                      header: "Task ID",
                      cell: t => (
                        <Link href={`#/ecs/clusters/${enc(cluster)}/tasks/${enc(arnName(t.taskArn))}`}>
                          <code>{arnName(t.taskArn)}</code>
                        </Link>
                      ),
                    },
                    {
                      id: "lastStatus",
                      header: "Last status",
                      cell: t => <St s={t.lastStatus} />,
                    },
                    {
                      id: "desiredStatus",
                      header: "Desired status",
                      cell: t => t.desiredStatus || "-",
                    },
                    {
                      id: "taskDef",
                      header: "Task definition",
                      cell: t => tdShort(t.taskDefinitionArn),
                    },
                    {
                      id: "launchType",
                      header: "Launch type",
                      cell: t => t.launchType || "FARGATE",
                    },
                    {
                      id: "started",
                      header: "Started at",
                      cell: t => fmt(t.startedAt || t.createdAt),
                    },
                    {
                      id: "stoppedReason",
                      header: "Stopped reason",
                      cell: t => t.stoppedReason || "-",
                    },
                  ]}
                  empty={
                    <Box textAlign="center" color="inherit">
                      <b>No tasks</b>
                      <Box variant="p" color="text-body-secondary">
                        Run a new task to instantiate a container from a task definition.
                      </Box>
                    </Box>
                  }
                />
              ),
            },
            {
              id: "infrastructure",
              label: "Infrastructure",
              content: (
                <SpaceBetween size="l">
                  <Container header={<Header variant="h2">Capacity providers</Header>}>
                    <Table
                      items={(c?.capacityProviders || ["FARGATE", "FARGATE_SPOT"]).map((name: string) => ({
                        name,
                        status: "ACTIVE",
                        type: name.includes("SPOT") ? "Spot Serverless" : "Serverless",
                      }))}
                      columnDefinitions={[
                        { id: "name", header: "Name", cell: (x: any) => <b>{x.name}</b> },
                        { id: "type", header: "Type", cell: (x: any) => x.type },
                        { id: "status", header: "Status", cell: (x: any) => <St s={x.status} /> },
                      ]}
                    />
                  </Container>
                </SpaceBetween>
              ),
            },
            {
              id: "metrics",
              label: "Metrics",
              content: (
                <Container header={<Header variant="h2">Container Insights</Header>}>
                  <EmulatorNote>
                    The emulator does not publish Amazon CloudWatch metrics for ECS clusters. Task logs and execution outputs can be viewed directly on the task details page.
                  </EmulatorNote>
                </Container>
              ),
            },
          ]}
        />

        {/* Modal: Delete Cluster */}
        {deleteClusterModal && (
          <Modal
            visible={true}
            onDismiss={() => setDeleteClusterModal(false)}
            header={`Delete cluster ${cluster}`}
            footer={
              <Box float="right">
                <SpaceBetween direction="horizontal" size="xs">
                  <Button variant="link" onClick={() => setDeleteClusterModal(false)} disabled={deletingCluster}>
                    Cancel
                  </Button>
                  <Button variant="primary" loading={deletingCluster} onClick={handleDeleteCluster}>
                    Delete
                  </Button>
                </SpaceBetween>
              </Box>
            }
          >
            <SpaceBetween size="m">
              <Box>
                Are you sure you want to delete cluster <b>{cluster}</b>?
              </Box>
              <ErrorAlert error={actionError} />
            </SpaceBetween>
          </Modal>
        )}

        {/* Modal: Update Desired Count */}
        {updateServiceModal && (
          <Modal
            visible={true}
            onDismiss={() => setUpdateServiceModal(null)}
            header={`Update desired tasks: ${updateServiceModal.serviceName}`}
            footer={
              <Box float="right">
                <SpaceBetween direction="horizontal" size="xs">
                  <Button variant="link" onClick={() => setUpdateServiceModal(null)} disabled={updatingService}>
                    Cancel
                  </Button>
                  <Button variant="primary" loading={updatingService} onClick={handleUpdateDesiredCount}>
                    Update
                  </Button>
                </SpaceBetween>
              </Box>
            }
          >
            <SpaceBetween size="m">
              <FormField label="Desired tasks">
                <Input
                  type="number"
                  value={newDesiredCount}
                  onChange={e => setNewDesiredCount(e.detail.value)}
                />
              </FormField>
              <ErrorAlert error={actionError} />
            </SpaceBetween>
          </Modal>
        )}

        {/* Modal: Delete Service */}
        {deleteServiceModal && (
          <Modal
            visible={true}
            onDismiss={() => setDeleteServiceModal(null)}
            header={`Delete service ${deleteServiceModal.serviceName}`}
            footer={
              <Box float="right">
                <SpaceBetween direction="horizontal" size="xs">
                  <Button variant="link" onClick={() => setDeleteServiceModal(null)} disabled={deletingService}>
                    Cancel
                  </Button>
                  <Button variant="primary" loading={deletingService} onClick={handleDeleteService}>
                    Delete
                  </Button>
                </SpaceBetween>
              </Box>
            }
          >
            <SpaceBetween size="m">
              <Box>
                Are you sure you want to delete service <b>{deleteServiceModal.serviceName}</b>?
                All active tasks managed by this service will be terminated.
              </Box>
              <ErrorAlert error={actionError} />
            </SpaceBetween>
          </Modal>
        )}

        {/* Modal: Stop Task */}
        {stopTaskModal && (
          <Modal
            visible={true}
            onDismiss={() => setStopTaskModal(null)}
            header={`Stop task ${arnName(stopTaskModal.taskArn)}`}
            footer={
              <Box float="right">
                <SpaceBetween direction="horizontal" size="xs">
                  <Button variant="link" onClick={() => setStopTaskModal(null)} disabled={stoppingTask}>
                    Cancel
                  </Button>
                  <Button variant="primary" loading={stoppingTask} onClick={handleStopTask}>
                    Stop task
                  </Button>
                </SpaceBetween>
              </Box>
            }
          >
            <SpaceBetween size="m">
              <Box>
                Are you sure you want to stop task <code>{arnName(stopTaskModal.taskArn)}</code>?
              </Box>
              <ErrorAlert error={actionError} />
            </SpaceBetween>
          </Modal>
        )}
      </SpaceBetween>
    </ContentLayout>
  );
}
