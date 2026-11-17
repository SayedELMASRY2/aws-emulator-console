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
import { ec, crumbs, St, fmt, redisCliCmd, memcachedTelnetCmd, enc } from "./lib";

export default function ClusterDetail() {
  const { clusterId = "" } = useParams();
  const nav = useNavigate();
  const flash = useFlash();

  useCrumbs(
    crumbs(
      { text: "Dashboard", href: "#/elasticache/dashboard" },
      { text: clusterId }
    )
  );

  const clusterData = useAsync(async () => {
    const res = await ec("DescribeCacheClusters", {
      CacheClusterId: clusterId,
      ShowCacheNodeInfo: true,
    });
    const c = (res.CacheClusters || [])[0];
    if (!c) throw new Error(`Cluster ${clusterId} not found`);
    return c;
  }, [clusterId]);

  const cl = clusterData.data;

  // Actions state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const ep = cl?.ConfigurationEndpoint || cl?.Endpoint;
  const isRedis = cl?.Engine === "redis" || cl?.Engine === "valkey";
  const connectCmd = ep
    ? isRedis
      ? redisCliCmd(ep.Address, ep.Port)
      : memcachedTelnetCmd(ep.Address, ep.Port)
    : "";

  const handleReboot = async () => {
    try {
      await ec("RebootCacheCluster", {
        CacheClusterId: clusterId,
        CacheNodeIdsToReboot: ["0001"],
      });
      flash.notify({ type: "success", content: `Rebooting cluster ${clusterId}.` });
      clusterData.reload();
    } catch (e) {
      flash.error(e, "Reboot failed");
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await ec("DeleteCacheCluster", { CacheClusterId: clusterId });
      flash.notify({ type: "success", content: `Deleted cluster ${clusterId}.` });
      nav(isRedis ? "/elasticache/redis" : "/elasticache/memcached");
    } catch (e) {
      setError(e);
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
                disabled={cl?.CacheClusterStatus !== "available"}
                onClick={handleReboot}
              >
                Reboot cluster
              </Button>
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
          {clusterId}
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Cluster overview</Header>}>
          <ColumnLayout columns={4} variant="text-grid">
            <ValueWithLabel label="Status">
              <St s={cl?.CacheClusterStatus} />
            </ValueWithLabel>
            <ValueWithLabel label="Engine">{cl?.Engine}</ValueWithLabel>
            <ValueWithLabel label="Engine version">{cl?.EngineVersion || "-"}</ValueWithLabel>
            <ValueWithLabel label="Node type">{cl?.CacheNodeType}</ValueWithLabel>
            <ValueWithLabel label="Number of nodes">{cl?.NumCacheNodes ?? 1}</ValueWithLabel>
            <ValueWithLabel label="Subnet group">
              {cl?.CacheSubnetGroupName || "Default"}
            </ValueWithLabel>
            <ValueWithLabel label="Parameter group">
              {cl?.CacheParameterGroup?.CacheParameterGroupName || "Default"}
            </ValueWithLabel>
            <ValueWithLabel label="Created at">{fmt(cl?.CacheClusterCreateTime)}</ValueWithLabel>
            <ValueWithLabel label="Primary endpoint">
              {ep ? (
                <SpaceBetween direction="horizontal" size="xxs">
                  <span>{`${ep.Address}:${ep.Port}`}</span>
                  <Copyable text={`${ep.Address}:${ep.Port}`} iconOnly />
                </SpaceBetween>
              ) : (
                <i>Creating</i>
              )}
            </ValueWithLabel>
            <ValueWithLabel label="Cluster ARN">
              {cl?.ARN ? <Copyable text={cl.ARN} /> : "-"}
            </ValueWithLabel>
          </ColumnLayout>
        </Container>

        {connectCmd && (
          <Container header={<Header variant="h2">Connect to cache</Header>}>
            <SpaceBetween size="s">
              <Box variant="p" color="text-body-secondary">
                The emulator exposes a real in-memory server socket on <code>127.0.0.1:{ep?.Port}</code>. Connect using standard CLI tools:
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
                <span>{connectCmd}</span>
                <Copyable text={connectCmd} iconOnly />
              </div>
            </SpaceBetween>
          </Container>
        )}

        <Tabs
          tabs={[
            {
              id: "nodes",
              label: `Nodes (${cl?.CacheNodes?.length || 1})`,
              content: (
                <Table
                  items={cl?.CacheNodes || (ep ? [{ CacheNodeId: "0001", CacheNodeStatus: cl?.CacheClusterStatus, Endpoint: ep }] : [])}
                  columnDefinitions={[
                    { id: "id", header: "Node ID", cell: (n: any) => <b>{n.CacheNodeId}</b> },
                    { id: "status", header: "Status", cell: (n: any) => <St s={n.CacheNodeStatus} /> },
                    { id: "port", header: "Port", cell: (n: any) => n.Endpoint?.Port || ep?.Port || "-" },
                    { id: "address", header: "Endpoint address", cell: (n: any) => n.Endpoint?.Address || ep?.Address || "-" },
                  ]}
                  empty="No cache nodes found."
                />
              ),
            },
          ]}
        />

        {/* Delete Modal */}
        {deleteOpen && (
          <Modal
            visible={true}
            onDismiss={() => setDeleteOpen(false)}
            header={`Delete cluster ${clusterId}`}
            footer={
              <Box float="right">
                <SpaceBetween direction="horizontal" size="xs">
                  <Button variant="link" onClick={() => setDeleteOpen(false)} disabled={deleting}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    loading={deleting}
                    disabled={confirmName !== clusterId}
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
                Are you sure you want to delete cache cluster <b>{clusterId}</b>?
                All in-memory data will be erased.
              </Box>
              <FormField label={`To confirm deletion, type "${clusterId}" in the field below:`}>
                <Input
                  value={confirmName}
                  placeholder={clusterId}
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
