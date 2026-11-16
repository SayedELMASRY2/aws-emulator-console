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
import { eks, eksAll, crumbs, St, fmt, enc } from "./lib";

export interface ClusterRow {
  name: string;
  arn: string;
  createdAt?: string;
  version?: string;
  endpoint?: string;
  roleArn?: string;
  status?: string;
}

export default function Clusters() {
  useCrumbs(crumbs({ text: "Clusters" }));
  const flash = useFlash();

  const [deleteTarget, setDeleteTarget] = useState<ClusterRow | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const loadClusters = async (): Promise<ClusterRow[]> => {
    const names = await eksAll("ListClusters", "clusters");
    if (!names.length) return [];
    const clusters = await Promise.all(
      names.map(async name => {
        try {
          const res = await eks("DescribeCluster", { name });
          return res.cluster;
        } catch {
          return null;
        }
      })
    );
    return clusters.filter(Boolean) as ClusterRow[];
  };

  const columns: Col<ClusterRow>[] = [
    {
      id: "name",
      header: "Cluster name",
      cell: c => (
        <Link href={`#/eks/clusters/${enc(c.name)}`}>
          <b>{c.name}</b>
        </Link>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: c => <St s={c.status} />,
    },
    {
      id: "version",
      header: "Kubernetes version",
      cell: c => c.version || "-",
    },
    {
      id: "endpoint",
      header: "API server endpoint",
      cell: c =>
        c.endpoint ? (
          <SpaceBetween direction="horizontal" size="xxs">
            <span>{c.endpoint}</span>
            <Copyable text={c.endpoint} iconOnly />
          </SpaceBetween>
        ) : (
          <i>Pending</i>
        ),
    },
    {
      id: "createdAt",
      header: "Created at",
      cell: c => fmt(c.createdAt),
    },
  ];

  const actions: Action<ClusterRow>[] = [
    {
      id: "delete",
      text: "Delete cluster",
      disabled: sel => sel.length !== 1 || sel[0].status === "DELETING",
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
      await eks("DeleteCluster", { name: deleteTarget.name });
      flash.notify({
        type: "success",
        content: `Deleted cluster ${deleteTarget.name}.`,
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
      <ResourcePage<ClusterRow>
        title="Clusters"
        description="An Amazon EKS cluster consists of two components: the Amazon EKS control plane and Amazon EKS nodes."
        load={loadClusters}
        columns={columns}
        trackBy="name"
        create={{ text: "Create cluster", href: "#/eks/clusters/create" }}
        actions={actions}
        multi={false}
        poll={c => c.status === "CREATING" || c.status === "DELETING"}
        banner={
          <EmulatorNote>
            The emulator provisions a fully functional Kubernetes control plane locally, generating native CA certificates, API endpoints, and OIDC tokens.
          </EmulatorNote>
        }
      />

      {deleteTarget && (
        <Modal
          visible={true}
          onDismiss={() => setDeleteTarget(null)}
          header={`Delete cluster ${deleteTarget.name}`}
          footer={
            <Box float="right">
              <SpaceBetween direction="horizontal" size="xs">
                <Button variant="link" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  loading={deleting}
                  disabled={confirmName !== deleteTarget.name}
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
              Are you sure you want to delete the cluster <b>{deleteTarget.name}</b>?
              This will terminate the local control plane and any associated node groups.
            </Box>
            <FormField label={`To confirm deletion, type "${deleteTarget.name}" in the field below:`}>
              <Input
                value={confirmName}
                placeholder={deleteTarget.name}
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
