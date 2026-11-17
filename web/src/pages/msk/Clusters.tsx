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
import { useFlash, ErrorAlert, EmulatorNote } from "../../common";
import { msk, mskAll, crumbs, St, fmt, enc } from "./lib";

export interface ClusterInfo {
  ClusterArn: string;
  ClusterName: string;
  ClusterType?: string;
  State?: string;
  CreationTime?: string;
  CurrentVersion?: string;
  Provisioned?: {
    NumberOfBrokerNodes?: number;
    CurrentBrokerSoftwareInfo?: { KafkaVersion?: string };
    BrokerNodeGroupInfo?: {
      InstanceType?: string;
      ClientSubnets?: string[];
      StorageInfo?: { EbsStorageInfo?: { VolumeSize?: number } };
    };
  };
  Serverless?: {
    VpcConfigs?: { SubnetIds?: string[]; SecurityGroupIds?: string[] }[];
  };
}

export default function Clusters() {
  useCrumbs(crumbs({ text: "Clusters" }));
  const flash = useFlash();

  const [deleteTarget, setDeleteTarget] = useState<ClusterInfo | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const loadClusters = async (): Promise<ClusterInfo[]> => {
    const list = await mskAll("ListClustersV2", "ClusterInfoList");
    return list || [];
  };

  const columns: Col<ClusterInfo>[] = [
    {
      id: "name",
      header: "Cluster name",
      cell: c => (
        <Link href={`#/msk/clusters/${enc(c.ClusterArn)}`}>
          <b>{c.ClusterName}</b>
        </Link>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: c => <St s={c.State} />,
    },
    {
      id: "type",
      header: "Cluster type",
      cell: c => (c.ClusterType === "SERVERLESS" ? "Serverless" : "Provisioned"),
    },
    {
      id: "version",
      header: "Kafka version",
      cell: c =>
        c.Provisioned?.CurrentBrokerSoftwareInfo?.KafkaVersion ||
        (c.ClusterType === "SERVERLESS" ? "Serverless" : "-"),
    },
    {
      id: "brokers",
      header: "Brokers",
      cell: c => c.Provisioned?.NumberOfBrokerNodes ?? "-",
    },
    {
      id: "instanceType",
      header: "Broker type",
      cell: c => c.Provisioned?.BrokerNodeGroupInfo?.InstanceType || "-",
    },
    {
      id: "createdAt",
      header: "Created at",
      cell: c => fmt(c.CreationTime),
    },
  ];

  const actions: Action<ClusterInfo>[] = [
    {
      id: "delete",
      text: "Delete cluster",
      disabled: sel => sel.length !== 1 || sel[0].State === "DELETING",
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
      await msk("DeleteCluster", { ClusterArn: deleteTarget.ClusterArn });
      flash.notify({
        type: "success",
        content: `Requested deletion for MSK cluster ${deleteTarget.ClusterName}.`,
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
      <ResourcePage<ClusterInfo>
        title="Clusters"
        description="Amazon Managed Streaming for Apache Kafka (Amazon MSK) is a fully managed service that enables you to build and run applications that use Apache Kafka to process streaming data."
        load={loadClusters}
        columns={columns}
        trackBy="ClusterArn"
        create={{ text: "Create cluster", href: "#/msk/clusters/create" }}
        actions={actions}
        multi={false}
        poll={c => ["CREATING", "DELETING", "UPDATING", "REBOOTING_BROKER"].includes(c.State || "")}
        banner={
          <EmulatorNote>
            The emulator implements the Amazon MSK management and cluster provisioning control plane. The generated broker hostnames follow AWS DNS conventions and are not resolvable on a local loopback network.
          </EmulatorNote>
        }
      />

      {deleteTarget && (
        <Modal
          visible={true}
          onDismiss={() => setDeleteTarget(null)}
          header={`Delete cluster ${deleteTarget.ClusterName}`}
          footer={
            <Box float="right">
              <SpaceBetween direction="horizontal" size="xs">
                <Button variant="link" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  loading={deleting}
                  disabled={confirmName !== deleteTarget.ClusterName}
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
              Are you sure you want to delete the MSK cluster <b>{deleteTarget.ClusterName}</b>?
              All topics and message streams will be deleted.
            </Box>
            <FormField label={`To confirm deletion, type "${deleteTarget.ClusterName}" in the field below:`}>
              <Input
                value={confirmName}
                placeholder={deleteTarget.ClusterName}
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
