import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Link from "@cloudscape-design/components/link";
import Modal from "@cloudscape-design/components/modal";
import Box from "@cloudscape-design/components/box";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Button from "@cloudscape-design/components/button";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Badge from "@cloudscape-design/components/badge";
import { ResourcePage, type Col, type Action } from "../ec2/ResourcePage";
import { useCrumbs } from "../../App";
import { useFlash, ErrorAlert, EmulatorNote } from "../../common";
import { ssm, ssmAll, crumbs, fmt, enc } from "./lib";

export interface ParameterMetadata {
  Name: string;
  Type: string;
  KeyId?: string;
  LastModifiedDate?: string;
  LastModifiedUser?: string;
  Description?: string;
  Version: number;
  Tier?: string;
  Policies?: any[];
  DataType?: string;
  ARN?: string;
}

export default function Parameters() {
  useCrumbs(crumbs({ text: "Parameters" }));
  const nav = useNavigate();
  const flash = useFlash();

  const [deleteTarget, setDeleteTarget] = useState<ParameterMetadata | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const loadParameters = async (): Promise<ParameterMetadata[]> => {
    const list = await ssmAll("DescribeParameters", "Parameters");
    return list || [];
  };

  const typeBadge = (type: string) => {
    if (type === "SecureString") return <Badge color="green">SecureString</Badge>;
    if (type === "StringList") return <Badge color="blue">StringList</Badge>;
    return <Badge color="grey">String</Badge>;
  };

  const columns: Col<ParameterMetadata>[] = [
    {
      id: "name",
      header: "Name",
      minWidth: 340,
      cell: p => (
        <Link href={`#/ssm/parameters/${enc(p.Name)}`}>
          <code>{p.Name}</code>
        </Link>
      ),
    },
    {
      id: "type",
      header: "Type",
      cell: p => typeBadge(p.Type),
    },
    {
      id: "tier",
      header: "Tier",
      cell: p => p.Tier || "Standard",
    },
    {
      id: "version",
      header: "Version",
      cell: p => p.Version,
    },
    {
      id: "desc",
      header: "Description",
      cell: p => p.Description || "-",
    },
    {
      id: "modified",
      header: "Last modified",
      cell: p => fmt(p.LastModifiedDate),
    },
  ];

  const actions: Action<ParameterMetadata>[] = [
    {
      id: "edit",
      text: "Edit parameter",
      disabled: sel => sel.length !== 1,
      run: sel => {
        nav(`/ssm/parameters/${enc(sel[0].Name)}/edit`);
      },
    },
    {
      id: "delete",
      text: "Delete parameter",
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
      await ssm("DeleteParameter", { Name: deleteTarget.Name });
      flash.notify({ type: "success", content: `Deleted parameter ${deleteTarget.Name}.` });
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
      <ResourcePage<ParameterMetadata>
        title="Parameters"
        description="Parameter Store, a capability of AWS Systems Manager, provides secure, hierarchical storage for configuration data and secrets management."
        load={loadParameters}
        columns={columns}
        trackBy="Name"
        create={{ text: "Create parameter", href: "#/ssm/parameters/create" }}
        actions={actions}
        multi={false}
        banner={
          <EmulatorNote>
            The emulator supports Parameter Store hierarchical paths (e.g. <code>/app/production/database</code>) and automatic in-memory encryption/decryption for <code>SecureString</code> parameters.
          </EmulatorNote>
        }
      />

      {deleteTarget && (
        <Modal
          visible={true}
          onDismiss={() => setDeleteTarget(null)}
          header={`Delete parameter: ${deleteTarget.Name}`}
          footer={
            <Box float="right">
              <SpaceBetween direction="horizontal" size="xs">
                <Button variant="link" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  loading={deleting}
                  disabled={confirmName !== deleteTarget.Name}
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
              Are you sure you want to delete parameter <code>{deleteTarget.Name}</code>?
              All historical versions of this parameter will also be deleted.
            </Box>
            <FormField label={`To confirm deletion, type "${deleteTarget.Name}" in the field below:`}>
              <Input
                value={confirmName}
                placeholder={deleteTarget.Name}
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
