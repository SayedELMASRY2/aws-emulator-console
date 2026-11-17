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
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Textarea from "@cloudscape-design/components/textarea";
import Badge from "@cloudscape-design/components/badge";
import { useCrumbs } from "../../App";
import { useAsync, useFlash, ErrorAlert, ValueWithLabel, Copyable } from "../../common";
import { iam, crumbs, fmt, enc } from "./lib";

export default function PolicyDetail() {
  const { policyArn = "" } = useParams();
  const nav = useNavigate();
  const flash = useFlash();

  const policyData = useAsync(async () => {
    const res = await iam("GetPolicy", { PolicyArn: policyArn });
    return res.Policy;
  }, [policyArn]);

  const p = policyData.data;
  const name = p?.PolicyName || policyArn.split("/").pop() || "Policy";
  const isAwsManaged = policyArn.includes(":aws:policy");

  useCrumbs(
    crumbs(
      { text: "Policies", href: "#/iam/policies" },
      { text: name }
    )
  );

  const versionData = useAsync(async () => {
    if (!p?.DefaultVersionId) return null;
    try {
      const res = await iam("GetPolicyVersion", {
        PolicyArn: policyArn,
        VersionId: p.DefaultVersionId,
      });
      return res.PolicyVersion;
    } catch {
      return null;
    }
  }, [policyArn, p?.DefaultVersionId]);

  const entitiesData = useAsync(async () => {
    try {
      const res = await iam("ListEntitiesForPolicy", { PolicyArn: policyArn });
      return [
        ...(res.PolicyRoles || []).map((r: any) => ({ name: r.RoleName, type: "Role" })),
        ...(res.PolicyUsers || []).map((u: any) => ({ name: u.UserName, type: "User" })),
        ...(res.PolicyGroups || []).map((g: any) => ({ name: g.GroupName, type: "Group" })),
      ];
    } catch {
      return [];
    }
  }, [policyArn]);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await iam("DeletePolicy", { PolicyArn: policyArn });
      flash.notify({ type: "success", content: `Deleted policy ${name}.` });
      nav("/iam/policies");
    } catch (e) {
      setError(e);
    } finally {
      setDeleting(false);
    }
  };

  let policyJson = "";
  if (versionData.data?.Document) {
    const doc = versionData.data.Document;
    policyJson = typeof doc === "string" ? doc : JSON.stringify(doc, null, 2);
  }

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          info={isAwsManaged ? <Badge color="grey">AWS managed</Badge> : <Badge color="blue">Customer managed</Badge>}
          actions={
            !isAwsManaged && (
              <Button onClick={() => setDeleteOpen(true)}>
                Delete policy
              </Button>
            )
          }
        >
          {name}
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Policy overview</Header>}>
          <ColumnLayout columns={4} variant="text-grid">
            <ValueWithLabel label="Policy name">{p?.PolicyName}</ValueWithLabel>
            <ValueWithLabel label="Type">{isAwsManaged ? "AWS managed policy" : "Customer managed policy"}</ValueWithLabel>
            <ValueWithLabel label="Description">{p?.Description || "-"}</ValueWithLabel>
            <ValueWithLabel label="Default version">{p?.DefaultVersionId || "v1"}</ValueWithLabel>
            <ValueWithLabel label="Attached entities">{p?.AttachmentCount ?? 0}</ValueWithLabel>
            <ValueWithLabel label="Created at">{fmt(p?.CreateDate)}</ValueWithLabel>
            <ValueWithLabel label="Updated at">{fmt(p?.UpdateDate)}</ValueWithLabel>
            <ValueWithLabel label="ARN">
              {p?.Arn ? <Copyable text={p.Arn} /> : "-"}
            </ValueWithLabel>
          </ColumnLayout>
        </Container>

        <Tabs
          tabs={[
            {
              id: "permissions",
              label: "Permissions",
              content: (
                <Container header={<Header variant="h2">Policy document</Header>}>
                  <div className="code-editor">
                    <Textarea value={policyJson || "Loading policy..."} rows={16} readOnly />
                  </div>
                </Container>
              ),
            },
            {
              id: "entities",
              label: `Entities attached (${entitiesData.data?.length ?? 0})`,
              content: (
                <Table
                  items={entitiesData.data || []}
                  loading={entitiesData.loading}
                  columnDefinitions={[
                    { id: "name", header: "Entity name", cell: (e: any) => <b>{e.name}</b> },
                    { id: "type", header: "Type", cell: (e: any) => <Badge color="grey">{e.type}</Badge> },
                  ]}
                  empty="No identities attached to this policy."
                />
              ),
            },
          ]}
        />

        {deleteOpen && (
          <Modal
            visible={true}
            onDismiss={() => setDeleteOpen(false)}
            header={`Delete policy ${name}`}
            footer={
              <Box float="right">
                <SpaceBetween direction="horizontal" size="xs">
                  <Button variant="link" onClick={() => setDeleteOpen(false)} disabled={deleting}>
                    Cancel
                  </Button>
                  <Button variant="primary" loading={deleting} onClick={handleDelete}>
                    Delete
                  </Button>
                </SpaceBetween>
              </Box>
            }
          >
            <SpaceBetween size="m">
              <Box>
                Are you sure you want to delete policy <b>{name}</b>?
              </Box>
              <ErrorAlert error={error} />
            </SpaceBetween>
          </Modal>
        )}
      </SpaceBetween>
    </ContentLayout>
  );
}
