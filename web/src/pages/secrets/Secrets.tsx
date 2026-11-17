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
import { useFlash, ErrorAlert, EmulatorNote, Copyable } from "../../common";
import { sm, smAll, crumbs, fmt, enc } from "./lib";

export interface SecretRow {
  ARN: string;
  Name: string;
  Description?: string;
  KmsKeyId?: string;
  RotationEnabled?: boolean;
  LastRotatedDate?: string;
  LastChangedDate?: string;
  LastAccessedDate?: string;
  DeletedDate?: string;
}

export default function Secrets() {
  useCrumbs(crumbs({ text: "Secrets" }));
  const flash = useFlash();

  const [deleteTarget, setDeleteTarget] = useState<SecretRow | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const loadSecrets = async (): Promise<SecretRow[]> => {
    const list = await smAll("ListSecrets", "SecretList");
    return list || [];
  };

  const columns: Col<SecretRow>[] = [
    {
      id: "name",
      header: "Secret name",
      cell: s => (
        <Link href={`#/secrets/${enc(s.Name)}`}>
          <b>{s.Name}</b>
        </Link>
      ),
    },
    {
      id: "desc",
      header: "Description",
      cell: s => s.Description || "-",
    },
    {
      id: "changed",
      header: "Last changed",
      cell: s => fmt(s.LastChangedDate),
    },
    {
      id: "accessed",
      header: "Last accessed",
      cell: s => fmt(s.LastAccessedDate),
    },
    {
      id: "arn",
      header: "Secret ARN",
      cell: s => (
        <SpaceBetween direction="horizontal" size="xxs">
          <code>{s.ARN.slice(0, 30)}...</code>
          <Copyable text={s.ARN} iconOnly />
        </SpaceBetween>
      ),
    },
  ];

  const actions: Action<SecretRow>[] = [
    {
      id: "delete",
      text: "Delete secret",
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
      await sm("DeleteSecret", {
        SecretId: deleteTarget.ARN,
        ForceDeleteWithoutRecovery: true,
      });
      flash.notify({ type: "success", content: `Deleted secret ${deleteTarget.Name}.` });
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
      <ResourcePage<SecretRow>
        title="Secrets"
        description="AWS Secrets Manager helps you store, manage, and retrieve database credentials, API keys, and other secrets throughout their lifecycle."
        load={loadSecrets}
        columns={columns}
        trackBy="ARN"
        create={{ text: "Store a new secret", href: "#/secrets/create" }}
        actions={actions}
        multi={false}
        banner={
          <EmulatorNote>
            The emulator stores and encrypts secret values locally. Secret versions, staging labels (AWSCURRENT), and value rotation are supported.
          </EmulatorNote>
        }
      />

      {deleteTarget && (
        <Modal
          visible={true}
          onDismiss={() => setDeleteTarget(null)}
          header={`Delete secret: ${deleteTarget.Name}`}
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
                  Delete immediately
                </Button>
              </SpaceBetween>
            </Box>
          }
        >
          <SpaceBetween size="m">
            <Box>
              Are you sure you want to permanently delete secret <b>{deleteTarget.Name}</b>?
              All secret versions and credentials will be deleted immediately.
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
