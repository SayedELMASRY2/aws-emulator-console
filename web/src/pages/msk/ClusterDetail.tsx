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
import { msk, crumbs, St, fmt, enc } from "./lib";

export default function ClusterDetail() {
  const { arn = "" } = useParams();
  const nav = useNavigate();
  const flash = useFlash();

  // Load cluster
  const clusterData = useAsync(async () => {
    const res = await msk("DescribeClusterV2", { ClusterArn: arn }).catch(async () => {
      const fallback = await msk("DescribeCluster", { ClusterArn: arn });
      return { ClusterInfo: fallback.ClusterInfo };
    });
    const c = res.ClusterInfo;
    if (!c) throw new Error(`Cluster not found: ${arn}`);
    return c;
  }, [arn]);

  const cl = clusterData.data;
  const name = cl?.ClusterName || arn.split("/")[1] || "Cluster";

  useCrumbs(
    crumbs(
      { text: "Clusters", href: "#/msk/clusters" },
      { text: name }
    )
  );

  // Load bootstrap brokers
  const brokerData = useAsync(async () => {
    try {
      const res = await msk("GetBootstrapBrokers", { ClusterArn: arn });
      return res;
    } catch {
      return null;
    }
  }, [arn]);

  // Load nodes
  const nodesData = useAsync(async () => {
    try {
      const res = await msk("ListNodes", { ClusterArn: arn });
      return res.NodeInfoList || [];
    } catch {
      return [];
    }
  }, [arn]);

  // Load operations
  const opsData = useAsync(async () => {
    try {
      const res = await msk("ListClusterOperationsV2", { ClusterArn: arn }).catch(async () => {
        return msk("ListClusterOperations", { ClusterArn: arn });
      });
      return res.ClusterOperationInfoList || [];
    } catch {
      return [];
    }
  }, [arn]);

  // Delete modal state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await msk("DeleteCluster", { ClusterArn: arn });
      flash.notify({ type: "success", content: `Requested deletion for cluster ${name}.` });
      nav("/msk/clusters");
    } catch (e) {
      setError(e);
    } finally {
      setDeleting(false);
    }
  };

  const p = cl?.Provisioned;

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
          {name}
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Cluster details</Header>}>
          <ColumnLayout columns={4} variant="text-grid">
            <ValueWithLabel label="Status">
              <St s={cl?.State} />
            </ValueWithLabel>
            <ValueWithLabel label="Cluster type">
              {cl?.ClusterType === "SERVERLESS" ? "Serverless" : "Provisioned"}
            </ValueWithLabel>
            <ValueWithLabel label="Kafka version">
              {p?.CurrentBrokerSoftwareInfo?.KafkaVersion || (cl?.ClusterType === "SERVERLESS" ? "Serverless" : "-")}
            </ValueWithLabel>
            <ValueWithLabel label="Brokers count">{p?.NumberOfBrokerNodes ?? "-"}</ValueWithLabel>
            <ValueWithLabel label="Broker instance type">
              {p?.BrokerNodeGroupInfo?.InstanceType || "-"}
            </ValueWithLabel>
            <ValueWithLabel label="Storage per broker">
              {p?.BrokerNodeGroupInfo?.StorageInfo?.EbsStorageInfo?.VolumeSize
                ? `${p.BrokerNodeGroupInfo.StorageInfo.EbsStorageInfo.VolumeSize} GiB`
                : "-"}
            </ValueWithLabel>
            <ValueWithLabel label="Created at">{fmt(cl?.CreationTime)}</ValueWithLabel>
            <ValueWithLabel label="Cluster ARN">
              {cl?.ClusterArn ? <Copyable text={cl.ClusterArn} /> : "-"}
            </ValueWithLabel>
          </ColumnLayout>
        </Container>

        <Container header={<Header variant="h2">Bootstrap brokers</Header>}>
          <SpaceBetween size="m">
            <EmulatorNote>
              These broker addresses follow AWS DNS naming conventions and are not resolvable on a local loopback network. The emulator covers the MSK management APIs.
            </EmulatorNote>

            {brokerData.data ? (
              <SpaceBetween size="s">
                {brokerData.data.BootstrapBrokerString && (
                  <div>
                    <Box variant="awsui-key-label">Plaintext</Box>
                    <div style={{ background: "#f2f3f3", padding: "8px 12px", borderRadius: "4px", fontFamily: "monospace", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span>{brokerData.data.BootstrapBrokerString}</span>
                      <Copyable text={brokerData.data.BootstrapBrokerString} iconOnly />
                    </div>
                  </div>
                )}
                {brokerData.data.BootstrapBrokerStringTls && (
                  <div>
                    <Box variant="awsui-key-label">TLS</Box>
                    <div style={{ background: "#f2f3f3", padding: "8px 12px", borderRadius: "4px", fontFamily: "monospace", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span>{brokerData.data.BootstrapBrokerStringTls}</span>
                      <Copyable text={brokerData.data.BootstrapBrokerStringTls} iconOnly />
                    </div>
                  </div>
                )}
                {brokerData.data.BootstrapBrokerStringSaslIam && (
                  <div>
                    <Box variant="awsui-key-label">SASL / IAM</Box>
                    <div style={{ background: "#f2f3f3", padding: "8px 12px", borderRadius: "4px", fontFamily: "monospace", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span>{brokerData.data.BootstrapBrokerStringSaslIam}</span>
                      <Copyable text={brokerData.data.BootstrapBrokerStringSaslIam} iconOnly />
                    </div>
                  </div>
                )}
              </SpaceBetween>
            ) : (
              <Box color="text-body-secondary">
                No bootstrap brokers available yet (the cluster may be creating or provisioned in serverless mode).
              </Box>
            )}
          </SpaceBetween>
        </Container>

        <Tabs
          tabs={[
            {
              id: "properties",
              label: "Properties & networking",
              content: (
                <Container header={<Header variant="h2">Networking configuration</Header>}>
                  <ColumnLayout columns={3} variant="text-grid">
                    <ValueWithLabel label="Client subnets">
                      {(p?.BrokerNodeGroupInfo?.ClientSubnets || cl?.Serverless?.VpcConfigs?.[0]?.SubnetIds || []).join(", ") || "-"}
                    </ValueWithLabel>
                    <ValueWithLabel label="Security groups">
                      {(p?.BrokerNodeGroupInfo?.SecurityGroups || cl?.Serverless?.VpcConfigs?.[0]?.SecurityGroupIds || []).join(", ") || "Default"}
                    </ValueWithLabel>
                    <ValueWithLabel label="Zookeeper connect string">
                      {p?.ZookeeperConnectString ? <Copyable text={p.ZookeeperConnectString} /> : "KRaft mode (no Zookeeper)"}
                    </ValueWithLabel>
                  </ColumnLayout>
                </Container>
              ),
            },
            {
              id: "nodes",
              label: `Broker nodes (${nodesData.data?.length ?? 0})`,
              content: (
                <Table
                  items={nodesData.data || []}
                  loading={nodesData.loading}
                  columnDefinitions={[
                    { id: "id", header: "Broker ID", cell: (n: any) => <b>{n.BrokerNodeInfo?.BrokerId ?? "-"}</b> },
                    { id: "instanceType", header: "Instance type", cell: (n: any) => n.InstanceType || "-" },
                    { id: "subnet", header: "Subnet", cell: (n: any) => n.BrokerNodeInfo?.ClientSubnet || "-" },
                    { id: "ip", header: "Client IP", cell: (n: any) => n.BrokerNodeInfo?.ClientVpcIpAddress || "-" },
                    {
                      id: "endpoints",
                      header: "Endpoints",
                      cell: (n: any) => (n.BrokerNodeInfo?.Endpoints || []).join(", ") || "-",
                    },
                  ]}
                  empty={
                    <Box textAlign="center" color="inherit">
                      <b>No broker nodes listed</b>
                    </Box>
                  }
                />
              ),
            },
            {
              id: "operations",
              label: `Cluster operations (${opsData.data?.length ?? 0})`,
              content: (
                <Table
                  items={opsData.data || []}
                  loading={opsData.loading}
                  columnDefinitions={[
                    { id: "type", header: "Operation type", cell: (o: any) => <b>{o.OperationType}</b> },
                    { id: "state", header: "State", cell: (o: any) => <St s={o.OperationState} /> },
                    { id: "started", header: "Started at", cell: (o: any) => fmt(o.CreationTime) },
                    { id: "ended", header: "Ended at", cell: (o: any) => fmt(o.EndTime) },
                  ]}
                  empty="No recent cluster operations."
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
            header={`Delete cluster: ${name}`}
            footer={
              <Box float="right">
                <SpaceBetween direction="horizontal" size="xs">
                  <Button variant="link" onClick={() => setDeleteOpen(false)} disabled={deleting}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    loading={deleting}
                    disabled={confirmName !== name}
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
                Are you sure you want to delete MSK cluster <b>{name}</b>?
              </Box>
              <FormField label={`To confirm deletion, type "${name}" in the field below:`}>
                <Input
                  value={confirmName}
                  placeholder={name}
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
