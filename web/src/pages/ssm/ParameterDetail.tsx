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
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Badge from "@cloudscape-design/components/badge";
import { useCrumbs } from "../../App";
import { useAsync, useFlash, ErrorAlert, ValueWithLabel, Copyable } from "../../common";
import { ssm, crumbs, fmt, enc } from "./lib";

export default function ParameterDetail() {
  const { paramName = "" } = useParams();
  const nav = useNavigate();
  const flash = useFlash();

  useCrumbs(
    crumbs(
      { text: "Parameters", href: "#/ssm/parameters" },
      { text: paramName }
    )
  );

  const [decrypt, setDecrypt] = useState(false);

  // Load parameter detail
  const paramData = useAsync(async () => {
    const res = await ssm("GetParameter", {
      Name: paramName,
      WithDecryption: decrypt,
    });
    return res.Parameter;
  }, [paramName, decrypt]);

  // Load parameter metadata from DescribeParameters
  const metaData = useAsync(async () => {
    try {
      const res = await ssm("DescribeParameters", {
        Filters: [{ Key: "Name", Values: [paramName] }],
      });
      return (res.Parameters || [])[0] || null;
    } catch {
      return null;
    }
  }, [paramName]);

  // Load history
  const historyData = useAsync(async () => {
    try {
      const res = await ssm("GetParameterHistory", {
        Name: paramName,
        WithDecryption: decrypt,
      });
      return (res.Parameters || []).sort((a: any, b: any) => b.Version - a.Version);
    } catch {
      return [];
    }
  }, [paramName, decrypt]);

  // Load tags
  const tagsData = useAsync(async () => {
    try {
      const res = await ssm("ListTagsForResource", {
        ResourceType: "Parameter",
        ResourceId: paramName,
      });
      return res.TagList || [];
    } catch {
      return [];
    }
  }, [paramName]);

  const p = paramData.data;
  const meta = metaData.data;
  const isSecure = p?.Type === "SecureString" || meta?.Type === "SecureString";

  // Delete modal state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await ssm("DeleteParameter", { Name: paramName });
      flash.notify({ type: "success", content: `Deleted parameter ${paramName}.` });
      nav("/ssm/parameters");
    } catch (e) {
      setError(e);
    } finally {
      setDeleting(false);
    }
  };

  const typeBadge = (type?: string) => {
    if (type === "SecureString") return <Badge color="green">SecureString</Badge>;
    if (type === "StringList") return <Badge color="blue">StringList</Badge>;
    return <Badge color="grey">String</Badge>;
  };

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          info={typeBadge(p?.Type || meta?.Type)}
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button href={`#/ssm/parameters/${enc(paramName)}/edit`}>
                Edit parameter
              </Button>
              <Button onClick={() => setDeleteOpen(true)}>
                Delete parameter
              </Button>
            </SpaceBetween>
          }
        >
          {paramName}
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Overview</Header>}>
          <ColumnLayout columns={4} variant="text-grid">
            <ValueWithLabel label="Name">
              <code>{p?.Name || paramName}</code>
            </ValueWithLabel>
            <ValueWithLabel label="Type">{p?.Type || meta?.Type || "-"}</ValueWithLabel>
            <ValueWithLabel label="Tier">{meta?.Tier || "Standard"}</ValueWithLabel>
            <ValueWithLabel label="Version">
              <Badge color="blue">{String(p?.Version ?? meta?.Version ?? 1)}</Badge>
            </ValueWithLabel>
            <ValueWithLabel label="Description">{meta?.Description || "-"}</ValueWithLabel>
            <ValueWithLabel label="Last modified">{fmt(p?.LastModifiedDate || meta?.LastModifiedDate)}</ValueWithLabel>
            <ValueWithLabel label="Last modified user">{meta?.LastModifiedUser || "-"}</ValueWithLabel>
            <ValueWithLabel label="KMS Key ID">{meta?.KeyId || (isSecure ? "alias/aws/ssm" : "-")}</ValueWithLabel>
            <ValueWithLabel label="ARN">
              {p?.ARN ? <Copyable text={p.ARN} /> : "-"}
            </ValueWithLabel>
          </ColumnLayout>
        </Container>

        <Container
          header={
            <Header
              variant="h2"
              actions={
                isSecure ? (
                  <Button
                    onClick={() => {
                      setDecrypt(!decrypt);
                    }}
                  >
                    {decrypt ? "Show encrypted value" : "Show decrypted value"}
                  </Button>
                ) : undefined
              }
            >
              Value
            </Header>
          }
        >
          <SpaceBetween size="m">
            <div
              style={{
                background: "#f2f3f3",
                padding: "12px",
                borderRadius: "4px",
                fontFamily: "monospace",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <span>{p?.Value || "-"}</span>
              {p?.Value && <Copyable text={p.Value} iconOnly />}
            </div>

            {isSecure && !decrypt && (
              <Box color="text-body-secondary" fontSize="body-s">
                This is an encrypted <code>SecureString</code>. Choose "Show decrypted value" to decrypt and view plaintext.
              </Box>
            )}
          </SpaceBetween>
        </Container>

        <Tabs
          tabs={[
            {
              id: "history",
              label: `History (${historyData.data?.length ?? 0})`,
              content: (
                <Table
                  items={historyData.data || []}
                  loading={historyData.loading}
                  columnDefinitions={[
                    {
                      id: "version",
                      header: "Version",
                      cell: (h: any) => <b>{h.Version}</b>,
                    },
                    {
                      id: "type",
                      header: "Type",
                      cell: (h: any) => typeBadge(h.Type),
                    },
                    {
                      id: "value",
                      header: "Value",
                      cell: (h: any) => (
                        <span style={{ fontFamily: "monospace", fontSize: "12px" }}>
                          {h.Value && h.Value.length > 60 ? h.Value.slice(0, 60) + "..." : h.Value || "-"}
                        </span>
                      ),
                    },
                    {
                      id: "modified",
                      header: "Last modified",
                      cell: (h: any) => fmt(h.LastModifiedDate),
                    },
                    {
                      id: "user",
                      header: "Modified user",
                      cell: (h: any) => h.LastModifiedUser || "-",
                    },
                  ]}
                  empty="No history records available."
                />
              ),
            },
            {
              id: "tags",
              label: `Tags (${tagsData.data?.length ?? 0})`,
              content: (
                <Table
                  items={tagsData.data || []}
                  loading={tagsData.loading}
                  columnDefinitions={[
                    { id: "key", header: "Key", cell: (t: any) => <b>{t.Key}</b> },
                    { id: "value", header: "Value", cell: (t: any) => t.Value || "-" },
                  ]}
                  empty="No tags attached to this parameter."
                />
              ),
            },
          ]}
        />

        {deleteOpen && (
          <Modal
            visible={true}
            onDismiss={() => setDeleteOpen(false)}
            header={`Delete parameter: ${paramName}`}
            footer={
              <Box float="right">
                <SpaceBetween direction="horizontal" size="xs">
                  <Button variant="link" onClick={() => setDeleteOpen(false)} disabled={deleting}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    loading={deleting}
                    disabled={confirmName !== paramName}
                    onClick={handleDelete}
                  >
                    Delete parameter
                  </Button>
                </SpaceBetween>
              </Box>
            }
          >
            <SpaceBetween size="m">
              <Box>
                Are you sure you want to delete parameter <code>{paramName}</code>?
                This action is permanent and cannot be undone.
              </Box>
              <FormField label={`To confirm deletion, type "${paramName}" in the field below:`}>
                <Input
                  value={confirmName}
                  placeholder={paramName}
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
