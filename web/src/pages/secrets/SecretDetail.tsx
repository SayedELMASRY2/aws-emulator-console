import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import Tabs from "@cloudscape-design/components/tabs";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Table from "@cloudscape-design/components/table";
import Modal from "@cloudscape-design/components/modal";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Textarea from "@cloudscape-design/components/textarea";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import { useCrumbs } from "../../App";
import { useAsync, useFlash, ErrorAlert, ValueWithLabel, Copyable } from "../../common";
import { sm, crumbs, fmt, enc } from "./lib";

export default function SecretDetail() {
  const { secretName = "" } = useParams();
  const nav = useNavigate();
  const flash = useFlash();

  useCrumbs(
    crumbs(
      { text: "Secrets", href: "#/secrets" },
      { text: secretName }
    )
  );

  const secretData = useAsync(async () => {
    const res = await sm("DescribeSecret", { SecretId: secretName });
    return res;
  }, [secretName]);

  const s = secretData.data;

  // Secret value retrieval state
  const [secretValue, setSecretValue] = useState<string | null>(null);
  const [retrieving, setRetrieving] = useState(false);
  const [valueVersionId, setValueVersionId] = useState<string | null>(null);

  // Edit secret value modal
  const [editValueOpen, setEditValueOpen] = useState(false);
  const [editValueText, setEditValueText] = useState("");
  const [updatingValue, setUpdatingValue] = useState(false);

  // Delete modal
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const handleRetrieveValue = async () => {
    setRetrieving(true);
    setError(null);
    try {
      const res = await sm("GetSecretValue", { SecretId: secretName });
      setSecretValue(res.SecretString || "");
      setValueVersionId(res.VersionId || null);
    } catch (e) {
      setError(e);
    } finally {
      setRetrieving(false);
    }
  };

  const handleUpdateValue = async () => {
    if (!editValueText.trim()) return;
    setUpdatingValue(true);
    setError(null);
    try {
      await sm("PutSecretValue", {
        SecretId: secretName,
        SecretString: editValueText.trim(),
      });
      flash.notify({ type: "success", content: `Updated secret value for ${secretName}.` });
      setEditValueOpen(false);
      setSecretValue(editValueText.trim());
      secretData.reload();
    } catch (e) {
      setError(e);
    } finally {
      setUpdatingValue(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await sm("DeleteSecret", {
        SecretId: secretName,
        ForceDeleteWithoutRecovery: true,
      });
      flash.notify({ type: "success", content: `Deleted secret ${secretName}.` });
      nav("/secrets");
    } catch (e) {
      setError(e);
    } finally {
      setDeleting(false);
    }
  };

  let parsedPairs: { key: string; value: string }[] | null = null;
  if (secretValue) {
    try {
      const obj = JSON.parse(secretValue);
      if (typeof obj === "object" && obj !== null && !Array.isArray(obj)) {
        parsedPairs = Object.entries(obj).map(([k, v]) => ({
          key: k,
          value: typeof v === "object" ? JSON.stringify(v) : String(v),
        }));
      }
    } catch {}
  }

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          actions={
            <Button onClick={() => setDeleteOpen(true)}>
              Delete secret
            </Button>
          }
        >
          {secretName}
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Secret overview</Header>}>
          <ColumnLayout columns={4} variant="text-grid">
            <ValueWithLabel label="Secret name">{s?.Name}</ValueWithLabel>
            <ValueWithLabel label="Description">{s?.Description || "-"}</ValueWithLabel>
            <ValueWithLabel label="Last changed">{fmt(s?.LastChangedDate)}</ValueWithLabel>
            <ValueWithLabel label="Last retrieved">{fmt(s?.LastAccessedDate)}</ValueWithLabel>
            <ValueWithLabel label="Encryption key">
              {s?.KmsKeyId || "Default AWS Key (aws/secretsmanager)"}
            </ValueWithLabel>
            <ValueWithLabel label="Secret ARN">
              {s?.ARN ? <Copyable text={s.ARN} /> : "-"}
            </ValueWithLabel>
          </ColumnLayout>
        </Container>

        <Container
          header={
            <Header
              variant="h2"
              actions={
                <SpaceBetween direction="horizontal" size="xs">
                  {secretValue !== null && (
                    <Button
                      onClick={() => {
                        setEditValueText(secretValue);
                        setEditValueOpen(true);
                      }}
                    >
                      Edit secret value
                    </Button>
                  )}
                  <Button
                    variant="primary"
                    loading={retrieving}
                    onClick={handleRetrieveValue}
                  >
                    {secretValue !== null ? "Refresh secret value" : "Retrieve secret value"}
                  </Button>
                </SpaceBetween>
              }
            >
              Secret value
            </Header>
          }
        >
          {secretValue !== null ? (
            <SpaceBetween size="m">
              {valueVersionId && (
                <Box color="text-body-secondary" fontSize="body-s">
                  Version ID: <code>{valueVersionId}</code> (AWSCURRENT)
                </Box>
              )}

              {parsedPairs ? (
                <Tabs
                  tabs={[
                    {
                      id: "table",
                      label: "Key/value",
                      content: (
                        <Table
                          items={parsedPairs}
                          columnDefinitions={[
                            { id: "key", header: "Key", cell: (p: any) => <b>{p.key}</b> },
                            {
                              id: "value",
                              header: "Value",
                              cell: (p: any) => (
                                <SpaceBetween direction="horizontal" size="xxs">
                                  <span>{p.value}</span>
                                  <Copyable text={p.value} iconOnly />
                                </SpaceBetween>
                              ),
                            },
                          ]}
                        />
                      ),
                    },
                    {
                      id: "plaintext",
                      label: "Plaintext",
                      content: (
                        <div
                          style={{
                            background: "#f2f3f3",
                            padding: "12px",
                            borderRadius: "4px",
                            fontFamily: "monospace",
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {secretValue}
                        </div>
                      ),
                    },
                  ]}
                />
              ) : (
                <div
                  style={{
                    background: "#f2f3f3",
                    padding: "12px",
                    borderRadius: "4px",
                    fontFamily: "monospace",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {secretValue}
                </div>
              )}
            </SpaceBetween>
          ) : (
            <Box textAlign="center" color="inherit">
              <b>Secret value is hidden</b>
              <Box variant="p" color="text-body-secondary">
                Choose "Retrieve secret value" to fetch and decrypt the secret string.
              </Box>
            </Box>
          )}
        </Container>

        <Container header={<Header variant="h2">Rotation configuration</Header>}>
          <ColumnLayout columns={2} variant="text-grid">
            <ValueWithLabel label="Automatic rotation">
              {s?.RotationEnabled ? "Enabled" : "Disabled"}
            </ValueWithLabel>
            <ValueWithLabel label="Rotation lambda ARN">
              {s?.RotationLambdaARN || "-"}
            </ValueWithLabel>
          </ColumnLayout>
        </Container>

        <ErrorAlert error={error} />

        {/* Edit Secret Value Modal */}
        {editValueOpen && (
          <Modal
            visible={true}
            onDismiss={() => setEditValueOpen(false)}
            size="large"
            header={`Edit secret value: ${secretName}`}
            footer={
              <Box float="right">
                <SpaceBetween direction="horizontal" size="xs">
                  <Button variant="link" onClick={() => setEditValueOpen(false)} disabled={updatingValue}>
                    Cancel
                  </Button>
                  <Button variant="primary" loading={updatingValue} onClick={handleUpdateValue}>
                    Save as new version
                  </Button>
                </SpaceBetween>
              </Box>
            }
          >
            <SpaceBetween size="m">
              <FormField label="Secret value (plaintext / JSON)">
                <div className="code-editor">
                  <Textarea
                    value={editValueText}
                    rows={12}
                    onChange={e => setEditValueText(e.detail.value)}
                  />
                </div>
              </FormField>
              <ErrorAlert error={error} />
            </SpaceBetween>
          </Modal>
        )}

        {/* Delete Modal */}
        {deleteOpen && (
          <Modal
            visible={true}
            onDismiss={() => setDeleteOpen(false)}
            header={`Delete secret ${secretName}`}
            footer={
              <Box float="right">
                <SpaceBetween direction="horizontal" size="xs">
                  <Button variant="link" onClick={() => setDeleteOpen(false)} disabled={deleting}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    loading={deleting}
                    disabled={confirmName !== secretName}
                    onClick={handleDelete}
                  >
                    Delete immediately
                  </Button>
                </SpaceBetween>
              </Box>
            }
          >
            <SpaceBetween size="m">
              <Box>
                Are you sure you want to delete secret <b>{secretName}</b>?
                This action is immediate and cannot be undone.
              </Box>
              <FormField label={`To confirm deletion, type "${secretName}" in the field below:`}>
                <Input
                  value={confirmName}
                  placeholder={secretName}
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
