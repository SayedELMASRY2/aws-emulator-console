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
import { iam, iamAll, crumbs, fmt, parseTrustPrincipals, enc } from "./lib";

export interface RoleRow {
  RoleName: string;
  RoleId: string;
  Arn: string;
  CreateDate: string;
  AssumeRolePolicyDocument?: string;
  Description?: string;
}

export default function Roles() {
  useCrumbs(crumbs({ text: "Roles" }));
  const flash = useFlash();

  const [deleteTarget, setDeleteTarget] = useState<RoleRow | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const loadRoles = async (): Promise<RoleRow[]> => {
    const list = await iamAll("ListRoles", "Roles");
    return list || [];
  };

  const columns: Col<RoleRow>[] = [
    {
      id: "name",
      header: "Role name",
      cell: r => (
        <Link href={`#/iam/roles/${enc(r.RoleName)}`}>
          <b>{r.RoleName}</b>
        </Link>
      ),
    },
    {
      id: "trust",
      header: "Trusted entities",
      cell: r => parseTrustPrincipals(r.AssumeRolePolicyDocument),
    },
    {
      id: "desc",
      header: "Description",
      cell: r => r.Description || "-",
    },
    {
      id: "arn",
      header: "ARN",
      cell: r => (
        <SpaceBetween direction="horizontal" size="xxs">
          <code>{r.Arn.slice(0, 28)}...</code>
          <Copyable text={r.Arn} iconOnly />
        </SpaceBetween>
      ),
    },
    {
      id: "created",
      header: "Created at",
      cell: r => fmt(r.CreateDate),
    },
  ];

  const actions: Action<RoleRow>[] = [
    {
      id: "delete",
      text: "Delete role",
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
      // Detach any attached policies first
      try {
        const att = await iam("ListAttachedRolePolicies", { RoleName: deleteTarget.RoleName });
        for (const p of att.AttachedPolicies || []) {
          await iam("DetachRolePolicy", { RoleName: deleteTarget.RoleName, PolicyArn: p.PolicyArn });
        }
      } catch {}

      await iam("DeleteRole", { RoleName: deleteTarget.RoleName });
      flash.notify({ type: "success", content: `Deleted role ${deleteTarget.RoleName}.` });
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
      <ResourcePage<RoleRow>
        title="Roles"
        description="An IAM role is an identity you can create that has specific permissions with credentials valid for short durations."
        load={loadRoles}
        columns={columns}
        trackBy="RoleName"
        create={{ text: "Create role", href: "#/iam/roles/create" }}
        actions={actions}
        multi={false}
      />

      {deleteTarget && (
        <Modal
          visible={true}
          onDismiss={() => setDeleteTarget(null)}
          header={`Delete role: ${deleteTarget.RoleName}`}
          footer={
            <Box float="right">
              <SpaceBetween direction="horizontal" size="xs">
                <Button variant="link" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  loading={deleting}
                  disabled={confirmName !== deleteTarget.RoleName}
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
              Are you sure you want to delete role <b>{deleteTarget.RoleName}</b>?
              Any applications or services assuming this role will lose permissions.
            </Box>
            <FormField label={`To confirm deletion, type "${deleteTarget.RoleName}" in the field below:`}>
              <Input
                value={confirmName}
                placeholder={deleteTarget.RoleName}
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
