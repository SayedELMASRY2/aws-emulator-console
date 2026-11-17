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
import { ec, ecAll, crumbs, St, fmt, redisCliCmd, enc } from "./lib";

export interface CacheClusterRow {
  CacheClusterId: string;
  ConfigurationEndpoint?: { Address: string; Port: number };
  Endpoint?: { Address: string; Port: number };
  ClientDownloadLandingPage?: string;
  CacheNodeType: string;
  Engine: string;
  EngineVersion?: string;
  CacheClusterStatus: string;
  NumCacheNodes?: number;
  PreferredAvailabilityZone?: string;
  CacheClusterCreateTime?: string;
  CacheSecurityGroups?: any[];
  SecurityGroups?: any[];
  CacheParameterGroup?: { CacheParameterGroupName: string };
  CacheSubnetGroupName?: string;
  ARN?: string;
}

function ClustersTable({ engineFilter, title, description }: { engineFilter: (e: string) => boolean; title: string; description: string }) {
  const flash = useFlash();

  const [deleteTarget, setDeleteTarget] = useState<CacheClusterRow | null>(null);
  const [confirmId, setConfirmId] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const loadClusters = async (): Promise<CacheClusterRow[]> => {
    const list = await ecAll("DescribeCacheClusters", "CacheClusters");
    return (list || []).filter((c: any) => engineFilter(c.Engine || ""));
  };

  const columns: Col<CacheClusterRow>[] = [
    {
      id: "id",
      header: "Cluster name",
      cell: c => (
        <Link href={`#/elasticache/clusters/${enc(c.CacheClusterId)}`}>
          <b>{c.CacheClusterId}</b>
        </Link>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: c => <St s={c.CacheClusterStatus} />,
    },
    {
      id: "engine",
      header: "Engine",
      cell: c => `${c.Engine} ${c.EngineVersion || ""}`,
    },
    {
      id: "nodeType",
      header: "Node type",
      cell: c => c.CacheNodeType,
    },
    {
      id: "nodes",
      header: "Nodes",
      cell: c => c.NumCacheNodes ?? 1,
    },
    {
      id: "endpoint",
      header: "Primary endpoint",
      cell: c => {
        const ep = c.ConfigurationEndpoint || c.Endpoint;
        if (!ep) return <i>Creating</i>;
        const hostPort = `${ep.Address}:${ep.Port}`;
        return (
          <SpaceBetween direction="horizontal" size="xxs">
            <span>{hostPort}</span>
            <Copyable text={hostPort} iconOnly />
          </SpaceBetween>
        );
      },
    },
    {
      id: "created",
      header: "Created at",
      cell: c => fmt(c.CacheClusterCreateTime),
    },
  ];

  const actions: Action<CacheClusterRow>[] = [
    {
      id: "reboot",
      text: "Reboot cluster",
      disabled: sel => sel.length !== 1 || sel[0].CacheClusterStatus !== "available",
      run: async (sel, reload) => {
        const item = sel[0];
        await ec("RebootCacheCluster", {
          CacheClusterId: item.CacheClusterId,
          CacheNodeIdsToReboot: ["0001"],
        });
        flash.notify({ type: "success", content: `Rebooting cluster ${item.CacheClusterId}.` });
        reload();
      },
    },
    {
      id: "delete",
      text: "Delete",
      disabled: sel => sel.length !== 1 || sel[0].CacheClusterStatus === "deleting",
      run: sel => {
        setDeleteTarget(sel[0]);
        setConfirmId("");
        setError(null);
      },
    },
  ];

  const handleDelete = async (reload: () => void) => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      await ec("DeleteCacheCluster", { CacheClusterId: deleteTarget.CacheClusterId });
      flash.notify({ type: "success", content: `Deleted cluster ${deleteTarget.CacheClusterId}.` });
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
      <ResourcePage<CacheClusterRow>
        title={title}
        description={description}
        load={loadClusters}
        columns={columns}
        trackBy="CacheClusterId"
        create={{ text: "Create cluster", href: "#/elasticache/clusters/create" }}
        actions={actions}
        multi={false}
        poll={c => ["creating", "modifying", "deleting", "rebooting"].includes(c.CacheClusterStatus || "")}
        banner={
          <EmulatorNote>
            The emulator executes in-memory Redis and Memcached cache instances on <code>127.0.0.1</code>. Connect via <code>redis-cli</code> or native sockets directly.
          </EmulatorNote>
        }
      />

      {deleteTarget && (
        <Modal
          visible={true}
          onDismiss={() => setDeleteTarget(null)}
          header={`Delete cluster ${deleteTarget.CacheClusterId}`}
          footer={
            <Box float="right">
              <SpaceBetween direction="horizontal" size="xs">
                <Button variant="link" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  loading={deleting}
                  disabled={confirmId !== deleteTarget.CacheClusterId}
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
              Are you sure you want to delete cache cluster <b>{deleteTarget.CacheClusterId}</b>?
              All in-memory cached keys and data will be lost.
            </Box>
            <FormField label={`To confirm deletion, type "${deleteTarget.CacheClusterId}" in the field below:`}>
              <Input
                value={confirmId}
                placeholder={deleteTarget.CacheClusterId}
                onChange={e => setConfirmId(e.detail.value)}
              />
            </FormField>
            <ErrorAlert error={error} />
          </SpaceBetween>
        </Modal>
      )}
    </>
  );
}

export function RedisClusters() {
  useCrumbs(crumbs({ text: "Redis clusters" }));
  return (
    <ClustersTable
      engineFilter={e => e === "redis" || e === "valkey"}
      title="Redis clusters"
      description="Amazon ElastiCache for Redis is a fast, in-memory data store providing sub-millisecond latency."
    />
  );
}

export function MemcachedClusters() {
  useCrumbs(crumbs({ text: "Memcached clusters" }));
  return (
    <ClustersTable
      engineFilter={e => e === "memcached"}
      title="Memcached clusters"
      description="Amazon ElastiCache for Memcached is a high-performance in-memory key-value service."
    />
  );
}
