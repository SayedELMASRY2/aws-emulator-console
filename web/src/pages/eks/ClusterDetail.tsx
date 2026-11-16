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
import Modal from "@cloudscape-design/components/modal";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import { useCrumbs } from "../../App";
import { useAsync, useFlash, ErrorAlert, ValueWithLabel, Copyable, EmulatorNote } from "../../common";
import { eks, eksAll, crumbs, St, fmt, kubeconfigCmd, enc } from "./lib";

export default function ClusterDetail() {
  const { cluster = "" } = useParams();
  const nav = useNavigate();
  const flash = useFlash();

  useCrumbs(
    crumbs(
      { text: "Clusters", href: "#/eks/clusters" },
      { text: cluster }
    )
  );

  // Load cluster
  const clusterData = useAsync(async () => {
    const res = await eks("DescribeCluster", { name: cluster });
    const c = res.cluster;
    if (!c) throw new Error(`Cluster ${cluster} not found`);
    return c;
  }, [cluster]);

  // Load node groups
  const nodeGroupsData = useAsync(async () => {
    try {
      const names: string[] = await eksAll("ListNodegroups", "nodegroups", { clusterName: cluster });
      if (!names.length) return [];
      const details = await Promise.all(
        names.map(async ngName => {
          try {
            const r = await eks("DescribeNodegroup", { clusterName: cluster, nodegroupName: ngName });
            return r.nodegroup;
          } catch {
            return null;
          }
        })
      );
      return details.filter(Boolean);
    } catch {
      return [];
    }
  }, [cluster]);

  // Load add-ons
  const addonsData = useAsync(async () => {
    try {
      const names: string[] = await eksAll("ListAddons", "addons", { clusterName: cluster });
      if (!names.length) return [];
      const details = await Promise.all(
        names.map(async addonName => {
          try {
            const r = await eks("DescribeAddon", { clusterName: cluster, addonName });
            return r.addon;
          } catch {
            return null;
          }
        })
      );
      return details.filter(Boolean);
    } catch {
      return [];
    }
  }, [cluster]);

  // Delete modal state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const cl = clusterData.data;

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await eks("DeleteCluster", { name: cluster });
      flash.notify({ type: "success", content: `Deleted cluster ${cluster}.` });
      nav("/eks/clusters");
    } catch (e) {
      setError(e);
    } finally {
      setDeleting(false);
    }
  };

  const kubeCmd = kubeconfigCmd(cluster);

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
                  if (e.detail.id === "delete") {
                    setConfirmName("");
                    setDeleteOpen(true);
                  }
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
        <Container header={<Header variant="h2">Cluster details</Header>}>
          <ColumnLayout columns={4} variant="text-grid">
            <ValueWithLabel label="Status">
              <St s={cl?.status} />
            </ValueWithLabel>
            <ValueWithLabel label="Kubernetes version">{cl?.version || "-"}</ValueWithLabel>
            <ValueWithLabel label="API server endpoint">
              {cl?.endpoint ? (
                <SpaceBetween direction="horizontal" size="xxs">
                  <span>{cl.endpoint}</span>
                  <Copyable text={cl.endpoint} iconOnly />
                </SpaceBetween>
              ) : (
                <i>Pending</i>
              )}
            </ValueWithLabel>
            <ValueWithLabel label="Created at">{fmt(cl?.createdAt)}</ValueWithLabel>
            <ValueWithLabel label="Cluster role ARN">
              {cl?.roleArn ? <Copyable text={cl.roleArn} /> : "-"}
            </ValueWithLabel>
            <ValueWithLabel label="Cluster ARN">
              {cl?.arn ? <Copyable text={cl.arn} /> : "-"}
            </ValueWithLabel>
          </ColumnLayout>
        </Container>

        <Container header={<Header variant="h2">Connect to cluster</Header>}>
          <SpaceBetween size="s">
            <Box variant="p" color="text-body-secondary">
              Use the following AWS CLI command to generate or update your local <code>kubeconfig</code> file:
            </Box>
            <div
              style={{
                background: "#f2f3f3",
                padding: "10px 14px",
                borderRadius: "4px",
                fontFamily: "monospace",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>{kubeCmd}</span>
              <Copyable text={kubeCmd} iconOnly />
            </div>
          </SpaceBetween>
        </Container>

        <Tabs
          tabs={[
            {
              id: "overview",
              label: "Overview",
              content: (
                <Container header={<Header variant="h2">Networking & security</Header>}>
                  <ColumnLayout columns={3} variant="text-grid">
                    <ValueWithLabel label="VPC ID">
                      {cl?.resourcesVpcConfig?.vpcId || "-"}
                    </ValueWithLabel>
                    <ValueWithLabel label="Subnets">
                      {(cl?.resourcesVpcConfig?.subnetIds || []).join(", ") || "-"}
                    </ValueWithLabel>
                    <ValueWithLabel label="Cluster security group">
                      {cl?.resourcesVpcConfig?.clusterSecurityGroupId || "-"}
                    </ValueWithLabel>
                    <ValueWithLabel label="Endpoint public access">
                      {cl?.resourcesVpcConfig?.endpointPublicAccess ? "Enabled" : "Disabled"}
                    </ValueWithLabel>
                    <ValueWithLabel label="Endpoint private access">
                      {cl?.resourcesVpcConfig?.endpointPrivateAccess ? "Enabled" : "Disabled"}
                    </ValueWithLabel>
                    <ValueWithLabel label="OIDC issuer">
                      {cl?.identity?.oidc?.issuer || "-"}
                    </ValueWithLabel>
                  </ColumnLayout>
                </Container>
              ),
            },
            {
              id: "compute",
              label: `Compute (${nodeGroupsData.data?.length ?? 0})`,
              content: (
                <SpaceBetween size="l">
                  <Table
                    items={nodeGroupsData.data || []}
                    loading={nodeGroupsData.loading}
                    header={
                      <Header
                        variant="h2"
                        actions={
                          <Button
                            variant="primary"
                            href={`#/eks/clusters/${enc(cluster)}/nodegroups/create`}
                          >
                            Add node group
                          </Button>
                        }
                      >
                        Node groups
                      </Header>
                    }
                    columnDefinitions={[
                      { id: "name", header: "Name", cell: (ng: any) => <b>{ng.nodegroupName}</b> },
                      { id: "status", header: "Status", cell: (ng: any) => <St s={ng.status} /> },
                      {
                        id: "scaling",
                        header: "Scaling (Min/Max/Desired)",
                        cell: (ng: any) =>
                          `${ng.scalingConfig?.minSize ?? "-"}/${ng.scalingConfig?.maxSize ?? "-"}/${ng.scalingConfig?.desiredSize ?? "-"}`,
                      },
                      { id: "capacity", header: "Capacity type", cell: (ng: any) => ng.capacityType || "ON_DEMAND" },
                      { id: "instances", header: "Instance types", cell: (ng: any) => (ng.instanceTypes || []).join(", ") || "t3.medium" },
                    ]}
                    empty={
                      <Box textAlign="center" color="inherit">
                        <b>No node groups</b>
                        <Box variant="p" color="text-body-secondary">
                          Node groups provide compute capacity by managing EC2 instances in an Auto Scaling group.
                        </Box>
                      </Box>
                    }
                  />

                  <Container header={<Header variant="h2">Fargate profiles</Header>}>
                    <EmulatorNote>
                      ListFargateProfiles is scaffolded but not implemented in the emulator (returns 501 NotImplemented). Use EC2 managed node groups for compute.
                    </EmulatorNote>
                  </Container>
                </SpaceBetween>
              ),
            },
            {
              id: "addons",
              label: `Add-ons (${addonsData.data?.length ?? 0})`,
              content: (
                <Table
                  items={addonsData.data || []}
                  loading={addonsData.loading}
                  header={
                    <Header
                      variant="h2"
                      actions={
                        <Button
                          variant="primary"
                          href={`#/eks/clusters/${enc(cluster)}/addons/create`}
                        >
                          Get more add-ons
                        </Button>
                      }
                    >
                      Installed add-ons
                    </Header>
                  }
                  columnDefinitions={[
                    { id: "name", header: "Add-on name", cell: (a: any) => <b>{a.addonName}</b> },
                    { id: "version", header: "Version", cell: (a: any) => a.addonVersion || "-" },
                    { id: "status", header: "Status", cell: (a: any) => <St s={a.status} /> },
                    { id: "modified", header: "Modified at", cell: (a: any) => fmt(a.modifiedAt) },
                  ]}
                  empty={
                    <Box textAlign="center" color="inherit">
                      <b>No add-ons installed</b>
                      <Box variant="p" color="text-body-secondary">
                        EKS add-ons provide operational capabilities such as VPC networking (VPC CNI), CoreDNS, and kube-proxy.
                      </Box>
                    </Box>
                  }
                />
              ),
            },
          ]}
        />

        {/* Delete Cluster Modal */}
        {deleteOpen && (
          <Modal
            visible={true}
            onDismiss={() => setDeleteOpen(false)}
            header={`Delete cluster: ${cluster}`}
            footer={
              <Box float="right">
                <SpaceBetween direction="horizontal" size="xs">
                  <Button variant="link" onClick={() => setDeleteOpen(false)} disabled={deleting}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    loading={deleting}
                    disabled={confirmName !== cluster}
                    onClick={handleDelete}
                  >
                    Delete
                  </Button>
                </SpaceBetween>
              </Box>
            }
          >
            <SpaceBetween size="m">
              <Box>
                Are you sure you want to delete cluster <b>{cluster}</b>?
                This will delete the Kubernetes control plane and stop all associated networking endpoints.
              </Box>
              <FormField label={`To confirm deletion, type "${cluster}" in the field below:`}>
                <Input
                  value={confirmName}
                  placeholder={cluster}
                  onChange={e => setConfirmName(e.detail.value)}
                />
              </FormField>
              <ErrorAlert error={error} />
            </SpaceBetween>
          </Modal>
        )}
      </SpaceBetween>
    </ContentLayout>
  );
}
