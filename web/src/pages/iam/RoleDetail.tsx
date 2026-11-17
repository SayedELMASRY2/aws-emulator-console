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
import Link from "@cloudscape-design/components/link";
import Modal from "@cloudscape-design/components/modal";
import Select from "@cloudscape-design/components/select";
import FormField from "@cloudscape-design/components/form-field";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Textarea from "@cloudscape-design/components/textarea";
import { useCrumbs } from "../../App";
import { useAsync, useFlash, ErrorAlert, ValueWithLabel, Copyable } from "../../common";
import { iam, iamAll, crumbs, fmt, enc } from "./lib";

export default function RoleDetail() {
  const { roleName = "" } = useParams();
  const nav = useNavigate();
  const flash = useFlash();

  useCrumbs(
    crumbs(
      { text: "Roles", href: "#/iam/roles" },
      { text: roleName }
    )
  );

  const roleData = useAsync(async () => {
    const res = await iam("GetRole", { RoleName: roleName });
    return res.Role;
  }, [roleName]);

  const attachedData = useAsync(async () => {
    try {
      const res = await iam("ListAttachedRolePolicies", { RoleName: roleName });
      return res.AttachedPolicies || [];
    } catch {
      return [];
    }
  }, [roleName]);

  const allPoliciesData = useAsync(async () => {
    try {
      const res = await iam("ListPolicies", { Scope: "All" });
      return (res.Policies || []).map((p: any) => ({
        value: p.Arn,
        label: `${p.PolicyName} (${p.Arn})`,
        name: p.PolicyName,
      }));
    } catch {
      return [];
    }
  });

  const r = roleData.data;

  // Attach policy modal
  const [attachOpen, setAttachOpen] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<any | null>(null);
  const [attaching, setAttaching] = useState(false);

  // Detach policy modal
  const [detachTarget, setDetachTarget] = useState<any | null>(null);
  const [detaching, setDetaching] = useState(false);

  // Delete modal
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const handleAttach = async () => {
    if (!selectedPolicy?.value) return;
    setAttaching(true);
    setError(null);
    try {
      await iam("AttachRolePolicy", {
        RoleName: roleName,
        PolicyArn: selectedPolicy.value,
      });
      flash.notify({ type: "success", content: `Attached policy ${selectedPolicy.name} to ${roleName}.` });
      setAttachOpen(false);
      setSelectedPolicy(null);
      attachedData.reload();
    } catch (e) {
      setError(e);
    } finally {
      setAttaching(false);
    }
  };

  const handleDetach = async () => {
    if (!detachTarget) return;
    setDetaching(true);
    setError(null);
    try {
      await iam("DetachRolePolicy", {
        RoleName: roleName,
        PolicyArn: detachTarget.PolicyArn,
      });
      flash.notify({ type: "success", content: `Detached policy ${detachTarget.PolicyName}.` });
      setDetachTarget(null);
      attachedData.reload();
    } catch (e) {
      setError(e);
    } finally {
      setDetaching(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      // Detach any attached policies first
      for (const p of attachedData.data || []) {
        await iam("DetachRolePolicy", { RoleName: roleName, PolicyArn: p.PolicyArn }).catch(() => {});
      }
      await iam("DeleteRole", { RoleName: roleName });
      flash.notify({ type: "success", content: `Deleted role ${roleName}.` });
      nav("/iam/roles");
    } catch (e) {
      setError(e);
    } finally {
      setDeleting(false);
    }
  };

  let trustJson = "";
  if (r?.AssumeRolePolicyDocument) {
    try {
      const raw = typeof r.AssumeRolePolicyDocument === "string"
        ? decodeURIComponent(r.AssumeRolePolicyDocument)
        : r.AssumeRolePolicyDocument;
      trustJson = JSON.stringify(typeof raw === "string" ? JSON.parse(raw) : raw, null, 2);
    } catch {
      trustJson = String(r.AssumeRolePolicyDocument);
    }
  }

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          actions={
            <Button onClick={() => setDeleteOpen(true)}>
              Delete role
            </Button>
          }
        >
          {roleName}
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Role overview</Header>}>
          <ColumnLayout columns={4} variant="text-grid">
            <ValueWithLabel label="Role name">{r?.RoleName}</ValueWithLabel>
            <ValueWithLabel label="Created at">{fmt(r?.CreateDate)}</ValueWithLabel>
            <ValueWithLabel label="Description">{r?.Description || "-"}</ValueWithLabel>
            <ValueWithLabel label="ARN">
              {r?.Arn ? <Copyable text={r.Arn} /> : "-"}
            </ValueWithLabel>
          </ColumnLayout>
        </Container>

        <Tabs
          tabs={[
            {
              id: "permissions",
              label: `Permissions (${attachedData.data?.length ?? 0})`,
              content: (
                <Table
                  items={attachedData.data || []}
                  loading={attachedData.loading}
                  header={
                    <Header
                      variant="h2"
                      actions={
                        <Button variant="primary" onClick={() => setAttachOpen(true)}>
                          Attach policies
                        </Button>
                      }
                    >
                      Attached policies
                    </Header>
                  }
                  columnDefinitions={[
                    {
                      id: "name",
                      header: "Policy name",
                      cell: (p: any) => (
                        <Link href={`#/iam/policies/${enc(p.PolicyArn)}`}>
                          <b>{p.PolicyName}</b>
                        </Link>
                      ),
                    },
                    {
                      id: "arn",
                      header: "Policy ARN",
                      cell: (p: any) => (
                        <SpaceBetween direction="horizontal" size="xxs">
                          <span>{p.PolicyArn}</span>
                          <Copyable text={p.PolicyArn} iconOnly />
                        </SpaceBetween>
                      ),
                    },
                    {
                      id: "actions",
                      header: "Actions",
                      cell: (p: any) => (
                        <Button
                          variant="inline-link"
                          onClick={() => setDetachTarget(p)}
                        >
                          Detach
                        </Button>
                      ),
                    },
                  ]}
                  empty="No permissions policies attached to this role."
                />
              ),
            },
            {
              id: "trust",
              label: "Trust relationships",
              content: (
                <Container header={<Header variant="h2">Trust policy</Header>}>
                  <SpaceBetween size="s">
                    <Box variant="p" color="text-body-secondary">
                      Entities that are trusted to assume this role:
                    </Box>
                    <div className="code-editor">
                      <Textarea value={trustJson} rows={12} readOnly />
                    </div>
                  </SpaceBetween>
                </Container>
              ),
            },
          ]}
        />

        {/* Attach Policy Modal */}
        {attachOpen && (
          <Modal
            visible={true}
            onDismiss={() => setAttachOpen(false)}
            header={`Attach permissions policy to ${roleName}`}
            footer={
              <Box float="right">
                <SpaceBetween direction="horizontal" size="xs">
                  <Button variant="link" onClick={() => setAttachOpen(false)} disabled={attaching}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    loading={attaching}
                    disabled={!selectedPolicy}
                    onClick={handleAttach}
                  >
                    Attach policy
                  </Button>
                </SpaceBetween>
              </Box>
            }
          >
            <SpaceBetween size="m">
              <FormField label="Choose policy to attach">
                <Select
                  selectedOption={selectedPolicy}
                  onChange={e => setSelectedPolicy(e.detail.selectedOption)}
                  options={allPoliciesData.data || []}
                  placeholder="Select a policy"
                  loadingText="Loading policies..."
                  filteringType="auto"
                />
              </FormField>
              <ErrorAlert error={error} />
            </SpaceBetween>
          </Modal>
        )}

        {/* Detach Policy Modal */}
        {detachTarget && (
          <Modal
            visible={true}
            onDismiss={() => setDetachTarget(null)}
            header={`Detach ${detachTarget.PolicyName}`}
            footer={
              <Box float="right">
                <SpaceBetween direction="horizontal" size="xs">
                  <Button variant="link" onClick={() => setDetachTarget(null)} disabled={detaching}>
                    Cancel
                  </Button>
                  <Button variant="primary" loading={detaching} onClick={handleDetach}>
                    Detach
                  </Button>
                </SpaceBetween>
              </Box>
            }
          >
            <SpaceBetween size="m">
              <Box>
                Are you sure you want to detach policy <b>{detachTarget.PolicyName}</b> from this role?
              </Box>
              <ErrorAlert error={error} />
            </SpaceBetween>
          </Modal>
        )}

        {/* Delete Role Modal */}
        {deleteOpen && (
          <Modal
            visible={true}
            onDismiss={() => setDeleteOpen(false)}
            header={`Delete role: ${roleName}`}
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
                Are you sure you want to delete role <b>{roleName}</b>?
              </Box>
              <ErrorAlert error={error} />
            </SpaceBetween>
          </Modal>
        )}
      </SpaceBetween>
    </ContentLayout>
  );
}
