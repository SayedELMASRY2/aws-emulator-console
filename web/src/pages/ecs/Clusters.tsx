import { useState } from "react";
import Link from "@cloudscape-design/components/link";
import Modal from "@cloudscape-design/components/modal";
import Box from "@cloudscape-design/components/box";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Button from "@cloudscape-design/components/button";
import { ResourcePage, type Col, type Action } from "../ec2/ResourcePage";
import { useFlash, ErrorAlert, EmulatorNote } from "../../common";
import { useCrumbs } from "../../App";
import { ecs, ecsAll, crumbs, St, enc } from "./lib";

export interface ClusterRow {
  clusterArn: string;
  clusterName: string;
  status: string;
  registeredContainerInstancesCount: number;
  runningTasksCount: number;
  pendingTasksCount: number;
  activeServicesCount: number;
  capacityProviders?: string[];
  settings?: { name: string; value: string }[];
}

export default function Clusters() {
  useCrumbs(crumbs({ text: "Clusters" }));
  const flash = useFlash();

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<ClusterRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<unknown>(null);

  const loadClusters = async (): Promise<ClusterRow[]> => {
    const arns: string[] = await ecsAll("ListClusters", "clusterArns");
    if (!arns.length) return [];
    const res = await ecs("DescribeClusters", {
      clusters: arns,
      include: ["STATISTICS", "SETTINGS"],
    });
    return res.clusters || [];
  };

  const columns: Col<ClusterRow>[] = [
    {
      id: "name",
      header: "Cluster name",
      cell: c => (
        <Link href={`#/ecs/clusters/${enc(c.clusterName)}`}>
          <b>{c.clusterName}</b>
        </Link>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: c => <St s={c.status} />,
    },
    {
      id: "services",
      header: "Services",
      cell: c => c.activeServicesCount ?? 0,
    },
    {
      id: "running",
      header: "Running tasks",
      cell: c => c.runningTasksCount ?? 0,
    },
    {
      id: "pending",
      header: "Pending tasks",
      cell: c => c.pendingTasksCount ?? 0,
    },
    {
      id: "instances",
      header: "Container instances",
      cell: c => c.registeredContainerInstancesCount ?? 0,
    },
  ];

  const actions: Action<ClusterRow>[] = [
    {
      id: "delete",
      text: "Delete cluster",
      disabled: sel => sel.length !== 1,
      run: (sel, reload) => {
        setDeleteTarget(sel[0]);
        setDeleteError(null);
      },
    },
  ];

  const confirmDelete = async (reload: () => void) => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await ecs("DeleteCluster", { cluster: deleteTarget.clusterName });
      flash.notify({
        type: "success",
        content: `Deleted cluster ${deleteTarget.clusterName}.`,
      });
      setDeleteTarget(null);
      reload();
    } catch (e) {
      setDeleteError(e);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <ResourcePage<ClusterRow>
        title="Clusters"
        description="An Amazon ECS cluster is a logical grouping of tasks or services. You can use clusters to manage resource isolation."
        load={loadClusters}
        columns={columns}
        trackBy="clusterName"
        create={{ text: "Create cluster", href: "#/ecs/clusters/create" }}
        actions={actions}
        multi={false}
        banner={
          <EmulatorNote>
            The emulator executes container workloads locally. Ensure your machine has network access to pull required images from registries.
          </EmulatorNote>
        }
      />

      {deleteTarget && (
        <Modal
          visible={true}
          onDismiss={() => setDeleteTarget(null)}
          header={`Delete cluster ${deleteTarget.clusterName}`}
          footer={
            <Box float="right">
              <SpaceBetween direction="horizontal" size="xs">
                <Button variant="link" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  loading={deleting}
                  onClick={() => confirmDelete(() => window.location.reload())}
                >
                  Delete
                </Button>
              </SpaceBetween>
            </Box>
          }
        >
          <SpaceBetween size="m">
            <Box>
              Are you sure you want to delete the cluster <b>{deleteTarget.clusterName}</b>?
              All running tasks and services within the cluster will be stopped and removed.
            </Box>
            <ErrorAlert error={deleteError} />
          </SpaceBetween>
        </Modal>
      )}
    </>
  );
}
