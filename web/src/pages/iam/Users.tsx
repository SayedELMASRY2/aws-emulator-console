import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Modal from "@cloudscape-design/components/modal";
import Box from "@cloudscape-design/components/box";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Button from "@cloudscape-design/components/button";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Checkbox from "@cloudscape-design/components/checkbox";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import { ResourcePage, type Col, type Action } from "../ec2/ResourcePage";
import { useCrumbs } from "../../App";
import { useFlash, ErrorAlert, Copyable } from "../../common";
import { iam, iamAll, crumbs, fmt } from "./lib";

export interface UserRow {
  UserName: string;
  UserId: string;
  Arn: string;
  CreateDate: string;
}

export default function Users() {
  useCrumbs(crumbs({ text: "Users" }));
  const flash = useFlash();

  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const loadUsers = async (): Promise<UserRow[]> => {
    const list = await iamAll("ListUsers", "Users");
    return list || [];
  };

  const columns: Col<UserRow>[] = [
    {
      id: "name",
      header: "User name",
      cell: u => <b>{u.UserName}</b>,
    },
    {
      id: "arn",
      header: "ARN",
      cell: u => (
        <SpaceBetween direction="horizontal" size="xxs">
          <span>{u.Arn}</span>
          <Copyable text={u.Arn} iconOnly />
        </SpaceBetween>
      ),
    },
    {
      id: "created",
      header: "Created at",
      cell: u => fmt(u.CreateDate),
    },
  ];

  const actions: Action<UserRow>[] = [
    {
      id: "delete",
      text: "Delete user",
      disabled: sel => sel.length !== 1,
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
      // Delete any access keys first
      try {
        const keys = await iam("ListAccessKeys", { UserName: deleteTarget.UserName });
        for (const k of keys.AccessKeyMetadata || []) {
          await iam("DeleteAccessKey", { UserName: deleteTarget.UserName, AccessKeyId: k.AccessKeyId });
        }
      } catch {}

      await iam("DeleteUser", { UserName: deleteTarget.UserName });
      flash.notify({ type: "success", content: `Deleted user ${deleteTarget.UserName}.` });
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
      <ResourcePage<UserRow>
        title="Users"
        description="IAM users represent individuals or service accounts with permissions to interact with AWS resources."
        load={loadUsers}
        columns={columns}
        trackBy="UserName"
        create={{ text: "Create user", href: "#/iam/users/create" }}
        actions={actions}
        multi={false}
      />

      {deleteTarget && (
        <Modal
          visible={true}
          onDismiss={() => setDeleteTarget(null)}
          header={`Delete user ${deleteTarget.UserName}`}
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
              Are you sure you want to delete user <b>{deleteTarget.UserName}</b>?
            </Box>
            <ErrorAlert error={error} />
          </SpaceBetween>
        </Modal>
      )}
    </>
  );
}

export function CreateUser() {
  const nav = useNavigate();
  const flash = useFlash();

  useCrumbs(
    crumbs(
      { text: "Users", href: "#/iam/users" },
      { text: "Create user" }
    )
  );

  const [userName, setUserName] = useState("");
  const [createAccessKey, setCreateAccessKey] = useState(true);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [credentialsModal, setCredentialsModal] = useState<{ keyId: string; secret: string } | null>(null);

  const submit = async () => {
    if (!userName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await iam("CreateUser", { UserName: userName.trim() });

      let creds: { keyId: string; secret: string } | null = null;
      if (createAccessKey) {
        const keyRes = await iam("CreateAccessKey", { UserName: userName.trim() });
        const k = keyRes.AccessKey;
        creds = { keyId: k.AccessKeyId, secret: k.SecretAccessKey };
      }

      flash.notify({ type: "success", content: `Created user ${userName}.` });

      if (creds) {
        setCredentialsModal(creds);
      } else {
        nav("/iam/users");
      }
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ContentLayout
      header={
        <Header variant="h1" description="Create an IAM user for programmatic access.">
          Create user
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">User details</Header>}>
          <SpaceBetween size="m">
            <FormField label="User name" constraintText="Required">
              <Input
                value={userName}
                placeholder="developer-app"
                onChange={e => setUserName(e.detail.value)}
              />
            </FormField>

            <Checkbox
              checked={createAccessKey}
              onChange={e => setCreateAccessKey(e.detail.checked)}
            >
              Generate access key for programmatic access (AWS CLI, SDKs)
            </Checkbox>
          </SpaceBetween>
        </Container>

        <ErrorAlert error={error} />

        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={() => nav(-1)}>
              Cancel
            </Button>
            <Button variant="primary" loading={busy} disabled={!userName.trim()} onClick={submit}>
              Create user
            </Button>
          </SpaceBetween>
        </Box>
      </SpaceBetween>

      {/* Generated Access Keys Modal */}
      {credentialsModal && (
        <Modal
          visible={true}
          onDismiss={() => {
            setCredentialsModal(null);
            nav("/iam/users");
          }}
          header="Security credentials generated"
          footer={
            <Box float="right">
              <Button
                variant="primary"
                onClick={() => {
                  setCredentialsModal(null);
                  nav("/iam/users");
                }}
              >
                Done
              </Button>
            </Box>
          }
        >
          <SpaceBetween size="m">
            <Box variant="p" color="text-body-secondary">
              Save these security credentials now. You will not be able to view the secret access key again.
            </Box>
            <FormField label="Access Key ID">
              <SpaceBetween direction="horizontal" size="xs">
                <code>{credentialsModal.keyId}</code>
                <Copyable text={credentialsModal.keyId} iconOnly />
              </SpaceBetween>
            </FormField>
            <FormField label="Secret Access Key">
              <SpaceBetween direction="horizontal" size="xs">
                <code>{credentialsModal.secret}</code>
                <Copyable text={credentialsModal.secret} iconOnly />
              </SpaceBetween>
            </FormField>
          </SpaceBetween>
        </Modal>
      )}
    </ContentLayout>
  );
}
