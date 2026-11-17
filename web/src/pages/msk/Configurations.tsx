import { useState } from "react";
import Modal from "@cloudscape-design/components/modal";
import Box from "@cloudscape-design/components/box";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Button from "@cloudscape-design/components/button";
import Textarea from "@cloudscape-design/components/textarea";
import { ResourcePage, type Col, type Action } from "../ec2/ResourcePage";
import { useCrumbs } from "../../App";
import { useFlash, ErrorAlert, Copyable } from "../../common";
import { msk, mskAll, crumbs, St } from "./lib";

export interface MskConfigRow {
  Arn: string;
  Name: string;
  Description?: string;
  State?: string;
  LatestRevision?: { Revision?: number };
  KafkaVersions?: string[];
}

export default function Configurations() {
  useCrumbs(crumbs({ text: "Cluster configurations" }));
  const flash = useFlash();

  const [inspectTarget, setInspectTarget] = useState<any | null>(null);
  const [inspectProps, setInspectProps] = useState<string>("");
  const [loadingProps, setLoadingProps] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<MskConfigRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const loadConfigs = async (): Promise<MskConfigRow[]> => {
    const list = await mskAll("ListConfigurations", "Configurations");
    return list || [];
  };

  const columns: Col<MskConfigRow>[] = [
    {
      id: "name",
      header: "Configuration name",
      cell: c => <b>{c.Name}</b>,
    },
    {
      id: "state",
      header: "State",
      cell: c => <St s={c.State} />,
    },
    {
      id: "revision",
      header: "Latest revision",
      cell: c => c.LatestRevision?.Revision ?? 1,
    },
    {
      id: "kafkaVersions",
      header: "Compatible versions",
      cell: c => (c.KafkaVersions || []).join(", ") || "Any",
    },
    {
      id: "description",
      header: "Description",
      cell: c => c.Description || "-",
    },
    {
      id: "arn",
      header: "ARN",
      cell: c => (
        <SpaceBetween direction="horizontal" size="xxs">
          <code>{c.Arn.slice(0, 24)}...</code>
          <Copyable text={c.Arn} iconOnly />
        </SpaceBetween>
      ),
    },
  ];

  const actions: Action<MskConfigRow>[] = [
    {
      id: "view",
      text: "View properties",
      disabled: sel => sel.length !== 1,
      run: async sel => {
        const item = sel[0];
        setInspectTarget(item);
        setLoadingProps(true);
        try {
          const rev = item.LatestRevision?.Revision || 1;
          const r = await msk("DescribeConfigurationRevision", {
            Arn: item.Arn,
            Revision: rev,
          });
          const raw = r.ServerProperties;
          if (typeof raw === "string") {
            setInspectProps(raw);
          } else if (raw?.__base64__) {
            setInspectProps(atob(raw.__base64__));
          } else {
            setInspectProps(JSON.stringify(raw, null, 2));
          }
        } catch {
          setInspectProps("# Could not load properties for this configuration revision");
        } finally {
          setLoadingProps(false);
        }
      },
    },
    {
      id: "delete",
      text: "Delete configuration",
      disabled: sel => sel.length !== 1,
      run: sel => {
        setDeleteTarget(sel[0]);
        setError(null);
      },
    },
  ];

  const handleDelete = async (reload: () => void) => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      await msk("DeleteConfiguration", { Arn: deleteTarget.Arn });
      flash.notify({ type: "success", content: `Deleted configuration ${deleteTarget.Name}.` });
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
      <ResourcePage<MskConfigRow>
        title="Cluster configurations"
        description="An Amazon MSK configuration contains the Apache Kafka configuration properties (server.properties) for your cluster."
        load={loadConfigs}
        columns={columns}
        trackBy="Arn"
        create={{ text: "Create configuration", href: "#/msk/configurations/create" }}
        actions={actions}
        multi={false}
      />

      {/* View properties modal */}
      {inspectTarget && (
        <Modal
          visible={true}
          onDismiss={() => setInspectTarget(null)}
          size="large"
          header={`Configuration: ${inspectTarget.Name}`}
          footer={
            <Box float="right">
              <Button variant="primary" onClick={() => setInspectTarget(null)}>
                Close
              </Button>
            </Box>
          }
        >
          <SpaceBetween size="m">
            <Box variant="p" color="text-body-secondary">
              <code>server.properties</code> for revision {inspectTarget.LatestRevision?.Revision || 1}:
            </Box>
            <div className="code-editor">
              <Textarea
                value={loadingProps ? "Loading properties..." : inspectProps}
                rows={12}
                readOnly
              />
            </div>
          </SpaceBetween>
        </Modal>
      )}

      {/* Delete modal */}
      {deleteTarget && (
        <Modal
          visible={true}
          onDismiss={() => setDeleteTarget(null)}
          header={`Delete configuration ${deleteTarget.Name}`}
          footer={
            <Box float="right">
              <SpaceBetween direction="horizontal" size="xs">
                <Button variant="link" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                  Cancel
                </Button>
                <Button variant="primary" loading={deleting} onClick={() => handleDelete(() => window.location.reload())}>
                  Delete
                </Button>
              </SpaceBetween>
            </Box>
          }
        >
          <SpaceBetween size="m">
            <Box>
              Are you sure you want to delete configuration <b>{deleteTarget.Name}</b>?
            </Box>
            <ErrorAlert error={error} />
          </SpaceBetween>
        </Modal>
      )}
    </>
  );
}
