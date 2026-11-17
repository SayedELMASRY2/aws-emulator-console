import { useState } from "react";
import Link from "@cloudscape-design/components/link";
import Modal from "@cloudscape-design/components/modal";
import Box from "@cloudscape-design/components/box";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Button from "@cloudscape-design/components/button";
import Badge from "@cloudscape-design/components/badge";
import { ResourcePage, type Col, type Action } from "../ec2/ResourcePage";
import { useCrumbs } from "../../App";
import { useFlash, ErrorAlert, Copyable } from "../../common";
import { iam, iamAll, crumbs, fmt, enc } from "./lib";

export interface PolicyRow {
  PolicyName: string;
  PolicyId: string;
  Arn: string;
  Path: string;
  DefaultVersionId: string;
  AttachmentCount?: number;
  PermissionsBoundaryUsageCount?: number;
  IsAttachable: boolean;
  Description?: string;
  CreateDate: string;
  UpdateDate: string;
}

export default function Policies() {
  useCrumbs(crumbs({ text: "Policies" }));
  const flash = useFlash();

  const [deleteTarget, setDeleteTarget] = useState<PolicyRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const loadPolicies = async (): Promise<PolicyRow[]> => {
    const list = await iamAll("ListPolicies", "Policies", { Scope: "All" });
    return list || [];
  };

  const columns: Col<PolicyRow>[] = [
    {
      id: "name",
      header: "Policy name",
      cell: p => (
        <Link href={`#/iam/policies/${enc(p.Arn)}`}>
          <b>{p.PolicyName}</b>
        </Link>
      ),
    },
    {
      id: "type",
      header: "Type",
      cell: p => (p.Arn.includes(":aws:policy") ? <Badge color="grey">AWS managed</Badge> : <Badge color="blue">Customer managed</Badge>),
    },
    {
      id: "desc",
      header: "Description",
      cell: p => p.Description || "-",
    },
    {
      id: "attached",
      header: "Attached entities",
      cell: p => p.AttachmentCount ?? 0,
    },
    {
      id: "arn",
      header: "ARN",
      cell: p => (
        <SpaceBetween direction="horizontal" size="xxs">
          <code>{p.Arn.slice(0, 28)}...</code>
          <Copyable text={p.Arn} iconOnly />
        </SpaceBetween>
      ),
    },
  ];

  const actions: Action<PolicyRow>[] = [
    {
      id: "delete",
      text: "Delete policy",
      disabled: sel => sel.length !== 1 || sel[0].Arn.includes(":aws:policy"),
      disabledReason: "AWS managed policies cannot be deleted.",
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
      await iam("DeletePolicy", { PolicyArn: deleteTarget.Arn });
      flash.notify({ type: "success", content: `Deleted policy ${deleteTarget.PolicyName}.` });
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
      <ResourcePage<PolicyRow>
        title="Policies"
        description="An IAM policy is an object in AWS that, when associated with an identity or resource, defines their permissions."
        load={loadPolicies}
        columns={columns}
        trackBy="Arn"
        create={{ text: "Create policy", href: "#/iam/policies/create" }}
        actions={actions}
        multi={false}
      />

      {deleteTarget && (
        <Modal
          visible={true}
          onDismiss={() => setDeleteTarget(null)}
          header={`Delete policy ${deleteTarget.PolicyName}`}
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
              Are you sure you want to delete policy <b>{deleteTarget.PolicyName}</b>?
            </Box>
            <ErrorAlert error={error} />
          </SpaceBetween>
        </Modal>
      )}
    </>
  );
}
