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
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Badge from "@cloudscape-design/components/badge";
import { useCrumbs } from "../../App";
import { useAsync, useFlash, ErrorAlert, ValueWithLabel, Copyable } from "../../common";
import { ecr, crumbs, fmt, fmtBytes, pushCommands, enc } from "./lib";

export interface ImageDetail {
  registryId: string;
  repositoryName: string;
  imageDigest: string;
  imageTags?: string[];
  imageSizeInBytes?: number;
  imagePushedAt?: string;
  imageScanStatus?: { status: string; description?: string };
}

export default function RepositoryDetail() {
  const { repo = "" } = useParams();
  const nav = useNavigate();
  const flash = useFlash();

  useCrumbs(
    crumbs(
      { text: "Repositories", href: "#/ecr/repositories" },
      { text: repo }
    )
  );

  // Load repo metadata
  const repoData = useAsync(async () => {
    const res = await ecr("DescribeRepositories", { repositoryNames: [repo] });
    const r = (res.repositories || [])[0];
    if (!r) throw new Error(`Repository ${repo} not found`);
    return r;
  }, [repo]);

  // Load images
  const imagesData = useAsync(async () => {
    try {
      const res = await ecr("DescribeImages", { repositoryName: repo });
      return (res.imageDetails || []) as ImageDetail[];
    } catch {
      return [];
    }
  }, [repo]);

  // Load lifecycle policy
  const lifecycleData = useAsync(async () => {
    try {
      const res = await ecr("GetLifecyclePolicy", { repositoryName: repo });
      return res;
    } catch {
      return null;
    }
  }, [repo]);

  // Modals state
  const [pushCmdsOpen, setPushCmdsOpen] = useState(false);
  const [deleteRepoOpen, setDeleteRepoOpen] = useState(false);
  const [deletingRepo, setDeletingRepo] = useState(false);

  const [deleteImageTarget, setDeleteImageTarget] = useState<ImageDetail | null>(null);
  const [deletingImage, setDeletingImage] = useState(false);

  const [deleteLifecycleOpen, setDeleteLifecycleOpen] = useState(false);
  const [deletingLifecycle, setDeletingLifecycle] = useState(false);

  const [selectedImages, setSelectedImages] = useState<ImageDetail[]>([]);
  const [error, setError] = useState<unknown>(null);

  const r = repoData.data;

  const handleDeleteRepo = async () => {
    setDeletingRepo(true);
    setError(null);
    try {
      await ecr("DeleteRepository", { repositoryName: repo, force: true });
      flash.notify({ type: "success", content: `Deleted repository ${repo}.` });
      nav("/ecr/repositories");
    } catch (e) {
      setError(e);
    } finally {
      setDeletingRepo(false);
    }
  };

  const handleDeleteImage = async () => {
    if (!deleteImageTarget) return;
    setDeletingImage(true);
    setError(null);
    try {
      await ecr("BatchDeleteImage", {
        repositoryName: repo,
        imageIds: [{ imageDigest: deleteImageTarget.imageDigest }],
      });
      flash.notify({
        type: "success",
        content: `Deleted image ${deleteImageTarget.imageTags?.[0] || deleteImageTarget.imageDigest.slice(0, 12)}.`,
      });
      setDeleteImageTarget(null);
      imagesData.reload();
    } catch (e) {
      setError(e);
    } finally {
      setDeletingImage(false);
    }
  };

  const handleDeleteLifecycle = async () => {
    setDeletingLifecycle(true);
    setError(null);
    try {
      await ecr("DeleteLifecyclePolicy", { repositoryName: repo });
      flash.notify({ type: "success", content: `Removed lifecycle policy from ${repo}.` });
      setDeleteLifecycleOpen(false);
      lifecycleData.reload();
    } catch (e) {
      setError(e);
    } finally {
      setDeletingLifecycle(false);
    }
  };

  let parsedRules: any[] = [];
  if (lifecycleData.data?.lifecyclePolicyText) {
    try {
      parsedRules = JSON.parse(lifecycleData.data.lifecyclePolicyText).rules || [];
    } catch {
      parsedRules = [];
    }
  }

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button onClick={() => setPushCmdsOpen(true)}>
                View push commands
              </Button>
              <ButtonDropdown
                items={[{ id: "delete", text: "Delete repository" }]}
                onItemClick={e => {
                  if (e.detail.id === "delete") setDeleteRepoOpen(true);
                }}
              >
                Actions
              </ButtonDropdown>
            </SpaceBetween>
          }
        >
          {repo}
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Repository details</Header>}>
          <ColumnLayout columns={4} variant="text-grid">
            <ValueWithLabel label="Repository name">{r?.repositoryName}</ValueWithLabel>
            <ValueWithLabel label="Tag immutability">
              {r?.imageTagMutability === "IMMUTABLE" ? "Immutable" : "Mutable"}
            </ValueWithLabel>
            <ValueWithLabel label="Scan on push">
              {r?.imageScanningConfiguration?.scanOnPush ? "Enabled" : "Disabled"}
            </ValueWithLabel>
            <ValueWithLabel label="Encryption">
              {r?.encryptionConfiguration?.encryptionType || "AES-256"}
            </ValueWithLabel>
            <ValueWithLabel label="Created at">{fmt(r?.createdAt)}</ValueWithLabel>
            <ValueWithLabel label="URI">
              {r?.repositoryUri ? (
                <SpaceBetween direction="horizontal" size="xxs">
                  <span>{r.repositoryUri}</span>
                  <Copyable text={r.repositoryUri} iconOnly />
                </SpaceBetween>
              ) : (
                "-"
              )}
            </ValueWithLabel>
            <ValueWithLabel label="ARN">
              {r?.repositoryArn ? <Copyable text={r.repositoryArn} /> : "-"}
            </ValueWithLabel>
          </ColumnLayout>
        </Container>

        <Tabs
          tabs={[
            {
              id: "images",
              label: `Images (${imagesData.data?.length ?? 0})`,
              content: (
                <Table
                  items={imagesData.data || []}
                  loading={imagesData.loading}
                  loadingText="Loading images..."
                  selectedItems={selectedImages}
                  onSelectionChange={e => setSelectedImages(e.detail.selectedItems)}
                  selectionType="single"
                  trackBy="imageDigest"
                  header={
                    <Header
                      variant="h2"
                      actions={
                        <SpaceBetween direction="horizontal" size="xs">
                          <Button
                            disabled={!selectedImages.length}
                            onClick={() => setDeleteImageTarget(selectedImages[0])}
                          >
                            Delete image
                          </Button>
                        </SpaceBetween>
                      }
                    >
                      Images
                    </Header>
                  }
                  columnDefinitions={[
                    {
                      id: "tags",
                      header: "Image tags",
                      cell: img =>
                        (img.imageTags && img.imageTags.length) ? (
                          <SpaceBetween direction="horizontal" size="xs">
                            {img.imageTags.map(t => (
                              <Badge key={t} color="blue">
                                {t}
                              </Badge>
                            ))}
                          </SpaceBetween>
                        ) : (
                          <i>&lt;untagged&gt;</i>
                        ),
                    },
                    {
                      id: "digest",
                      header: "Image digest",
                      cell: img => (
                        <SpaceBetween direction="horizontal" size="xxs">
                          <code>{img.imageDigest ? img.imageDigest.slice(0, 19) + "..." : "-"}</code>
                          {img.imageDigest && <Copyable text={img.imageDigest} iconOnly />}
                        </SpaceBetween>
                      ),
                    },
                    {
                      id: "size",
                      header: "Size",
                      cell: img => fmtBytes(img.imageSizeInBytes),
                    },
                    {
                      id: "pushedAt",
                      header: "Pushed at",
                      cell: img => fmt(img.imagePushedAt),
                    },
                  ]}
                  empty={
                    <Box textAlign="center" color="inherit">
                      <b>No images</b>
                      <Box variant="p" color="text-body-secondary">
                        Push images to this repository using the Docker CLI.
                      </Box>
                      <Button onClick={() => setPushCmdsOpen(true)}>
                        View push commands
                      </Button>
                    </Box>
                  }
                />
              ),
            },
            {
              id: "lifecycle",
              label: "Lifecycle policy",
              content: (
                <SpaceBetween size="l">
                  <Container
                    header={
                      <Header
                        variant="h2"
                        actions={
                          <SpaceBetween direction="horizontal" size="xs">
                            {lifecycleData.data?.lifecyclePolicyText && (
                              <Button onClick={() => setDeleteLifecycleOpen(true)}>
                                Delete policy
                              </Button>
                            )}
                            <Button
                              variant="primary"
                              href={`#/ecr/repositories/${enc(repo)}/lifecycle`}
                            >
                              {lifecycleData.data?.lifecyclePolicyText ? "Edit policy" : "Create policy"}
                            </Button>
                          </SpaceBetween>
                        }
                      >
                        Lifecycle policy
                      </Header>
                    }
                  >
                    {lifecycleData.data?.lifecyclePolicyText ? (
                      <Table
                        items={parsedRules}
                        columnDefinitions={[
                          { id: "priority", header: "Priority", cell: (ru: any) => ru.rulePriority },
                          { id: "desc", header: "Description", cell: (ru: any) => ru.description || "-" },
                          {
                            id: "match",
                            header: "Match criteria",
                            cell: (ru: any) =>
                              `${ru.selection?.tagStatus || "any"} (count: ${ru.selection?.countNumber})`,
                          },
                          { id: "action", header: "Action", cell: (ru: any) => ru.action?.type || "expire" },
                        ]}
                      />
                    ) : (
                      <Box textAlign="center" color="inherit">
                        <b>No lifecycle policy configured</b>
                        <Box variant="p" color="text-body-secondary">
                          Lifecycle policies help manage image lifecycle by automatically expiring old or unused images.
                        </Box>
                      </Box>
                    )}
                  </Container>
                </SpaceBetween>
              ),
            },
          ]}
        />

        {/* View Push Commands Modal */}
        {pushCmdsOpen && r && (
          <Modal
            visible={true}
            onDismiss={() => setPushCmdsOpen(false)}
            size="large"
            header={`Push commands for ${r.repositoryName}`}
            footer={
              <Box float="right">
                <Button variant="primary" onClick={() => setPushCmdsOpen(false)}>
                  Close
                </Button>
              </Box>
            }
          >
            <SpaceBetween size="l">
              <Box variant="p" color="text-body-secondary">
                Use these Docker CLI commands to authenticate, build, tag, and push your container images to this repository.
              </Box>

              {pushCommands(r.repositoryUri, r.repositoryName).map((step, idx) => (
                <SpaceBetween size="xxs" key={idx}>
                  <Box variant="strong">{step.title}:</Box>
                  <div
                    style={{
                      background: "#f2f3f3",
                      padding: "8px 12px",
                      borderRadius: "4px",
                      fontFamily: "monospace",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span>{step.cmd}</span>
                    <Copyable text={step.cmd} iconOnly />
                  </div>
                </SpaceBetween>
              ))}
            </SpaceBetween>
          </Modal>
        )}

        {/* Delete Image Modal */}
        {deleteImageTarget && (
          <Modal
            visible={true}
            onDismiss={() => setDeleteImageTarget(null)}
            header="Delete image"
            footer={
              <Box float="right">
                <SpaceBetween direction="horizontal" size="xs">
                  <Button variant="link" onClick={() => setDeleteImageTarget(null)} disabled={deletingImage}>
                    Cancel
                  </Button>
                  <Button variant="primary" loading={deletingImage} onClick={handleDeleteImage}>
                    Delete
                  </Button>
                </SpaceBetween>
              </Box>
            }
          >
            <SpaceBetween size="m">
              <Box>
                Are you sure you want to delete image digest <code>{deleteImageTarget.imageDigest.slice(0, 19)}...</code>?
              </Box>
              <ErrorAlert error={error} />
            </SpaceBetween>
          </Modal>
        )}

        {/* Delete Repo Modal */}
        {deleteRepoOpen && (
          <Modal
            visible={true}
            onDismiss={() => setDeleteRepoOpen(false)}
            header={`Delete repository: ${repo}`}
            footer={
              <Box float="right">
                <SpaceBetween direction="horizontal" size="xs">
                  <Button variant="link" onClick={() => setDeleteRepoOpen(false)} disabled={deletingRepo}>
                    Cancel
                  </Button>
                  <Button variant="primary" loading={deletingRepo} onClick={handleDeleteRepo}>
                    Delete
                  </Button>
                </SpaceBetween>
              </Box>
            }
          >
            <SpaceBetween size="m">
              <Box>
                Are you sure you want to delete repository <b>{repo}</b> and all images stored inside it?
              </Box>
              <ErrorAlert error={error} />
            </SpaceBetween>
          </Modal>
        )}

        {/* Delete Lifecycle Policy Modal */}
        {deleteLifecycleOpen && (
          <Modal
            visible={true}
            onDismiss={() => setDeleteLifecycleOpen(false)}
            header="Delete lifecycle policy"
            footer={
              <Box float="right">
                <SpaceBetween direction="horizontal" size="xs">
                  <Button variant="link" onClick={() => setDeleteLifecycleOpen(false)} disabled={deletingLifecycle}>
                    Cancel
                  </Button>
                  <Button variant="primary" loading={deletingLifecycle} onClick={handleDeleteLifecycle}>
                    Delete
                  </Button>
                </SpaceBetween>
              </Box>
            }
          >
            <SpaceBetween size="m">
              <Box>
                Are you sure you want to remove the lifecycle policy from repository <b>{repo}</b>?
              </Box>
              <ErrorAlert error={error} />
            </SpaceBetween>
          </Modal>
        )}
      </SpaceBetween>
    </ContentLayout>
  );
}
