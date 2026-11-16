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
import { useFlash, ErrorAlert, Copyable } from "../../common";
import { ecr, ecrAll, crumbs, fmt, pushCommands, enc } from "./lib";

export interface RepoRow {
  repositoryArn: string;
  registryId: string;
  repositoryName: string;
  repositoryUri: string;
  createdAt?: string;
  imageTagMutability?: string;
  imageScanningConfiguration?: { scanOnPush: boolean };
  encryptionConfiguration?: { encryptionType: string; kmsKey?: string };
}

export default function Repositories() {
  useCrumbs(crumbs({ text: "Repositories" }));
  const flash = useFlash();

  // Push commands modal state
  const [pushCmdRepo, setPushCmdRepo] = useState<RepoRow | null>(null);

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<RepoRow | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const loadRepos = async (): Promise<RepoRow[]> => {
    const repos = await ecrAll("DescribeRepositories", "repositories");
    return repos || [];
  };

  const columns: Col<RepoRow>[] = [
    {
      id: "name",
      header: "Repository name",
      cell: r => (
        <Link href={`#/ecr/repositories/${enc(r.repositoryName)}`}>
          <b>{r.repositoryName}</b>
        </Link>
      ),
    },
    {
      id: "uri",
      header: "URI",
      cell: r => (
        <SpaceBetween direction="horizontal" size="xs">
          <span>{r.repositoryUri}</span>
          <Copyable text={r.repositoryUri} iconOnly />
        </SpaceBetween>
      ),
    },
    {
      id: "tagMutability",
      header: "Tag immutability",
      cell: r => (r.imageTagMutability === "IMMUTABLE" ? "Immutable" : "Mutable"),
    },
    {
      id: "scanOnPush",
      header: "Scan on push",
      cell: r => (r.imageScanningConfiguration?.scanOnPush ? "Enabled" : "Disabled"),
    },
    {
      id: "encryption",
      header: "Encryption",
      cell: r => r.encryptionConfiguration?.encryptionType || "AES-256",
    },
    {
      id: "createdAt",
      header: "Created at",
      cell: r => fmt(r.createdAt),
    },
  ];

  const actions: Action<RepoRow>[] = [
    {
      id: "view-push",
      text: "View push commands",
      disabled: sel => sel.length !== 1,
      run: sel => {
        setPushCmdRepo(sel[0]);
      },
    },
    {
      id: "delete",
      text: "Delete repository",
      disabled: sel => sel.length !== 1,
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
      await ecr("DeleteRepository", {
        repositoryName: deleteTarget.repositoryName,
        force: true,
      });
      flash.notify({
        type: "success",
        content: `Deleted repository ${deleteTarget.repositoryName}.`,
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
      <ResourcePage<RepoRow>
        title="Repositories"
        description="Amazon ECR repositories are used to store, manage, and deploy Docker and OCI container images."
        load={loadRepos}
        columns={columns}
        trackBy="repositoryName"
        create={{ text: "Create repository", href: "#/ecr/repositories/create" }}
        actions={actions}
        multi={false}
      />

      {/* Push Commands Modal */}
      {pushCmdRepo && (
        <Modal
          visible={true}
          onDismiss={() => setPushCmdRepo(null)}
          size="large"
          header={`Push commands for ${pushCmdRepo.repositoryName}`}
          footer={
            <Box float="right">
              <Button variant="primary" onClick={() => setPushCmdRepo(null)}>
                Close
              </Button>
            </Box>
          }
        >
          <SpaceBetween size="l">
            <Box variant="p" color="text-body-secondary">
              Use these Docker CLI commands to authenticate, build, tag, and push your container images to this repository.
            </Box>

            {pushCommands(pushCmdRepo.repositoryUri, pushCmdRepo.repositoryName).map((step, idx) => (
              <SpaceBetween size="xxs" key={idx}>
                <Box variant="strong">{step.title}:</Box>
                <div style={{ background: "#f2f3f3", padding: "8px 12px", borderRadius: "4px", fontFamily: "monospace", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>{step.cmd}</span>
                  <Copyable text={step.cmd} iconOnly />
                </div>
              </SpaceBetween>
            ))}
          </SpaceBetween>
        </Modal>
      )}

      {/* Delete Repository Modal */}
      {deleteTarget && (
        <Modal
          visible={true}
          onDismiss={() => setDeleteTarget(null)}
          header={`Delete repository: ${deleteTarget.repositoryName}`}
          footer={
            <Box float="right">
              <SpaceBetween direction="horizontal" size="xs">
                <Button variant="link" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  loading={deleting}
                  disabled={confirmName !== deleteTarget.repositoryName}
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
              This action will permanently delete the repository <b>{deleteTarget.repositoryName}</b> and all images stored inside it.
            </Box>
            <FormField label={`To confirm deletion, type "${deleteTarget.repositoryName}" in the field below:`}>
              <Input
                value={confirmName}
                placeholder={deleteTarget.repositoryName}
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
