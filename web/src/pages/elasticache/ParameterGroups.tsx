import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Select from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Modal from "@cloudscape-design/components/modal";
import { ResourcePage, type Col, type Action } from "../ec2/ResourcePage";
import { useCrumbs } from "../../App";
import { useFlash, ErrorAlert } from "../../common";
import { ec, ecAll, crumbs } from "./lib";

export interface ParamGroupRow {
  CacheParameterGroupName: string;
  CacheParameterGroupFamily: string;
  Description?: string;
  IsGlobal?: boolean;
  ARN?: string;
}

const FAMILIES = [
  { value: "redis7", label: "redis7 (Redis 7.x)" },
  { value: "redis6.x", label: "redis6.x (Redis 6.x)" },
  { value: "valkey7", label: "valkey7 (Valkey 7.x)" },
  { value: "valkey8", label: "valkey8 (Valkey 8.x)" },
  { value: "memcached1.6", label: "memcached1.6 (Memcached 1.6.x)" },
];

export default function ParameterGroups() {
  useCrumbs(crumbs({ text: "Parameter groups" }));
  const flash = useFlash();

  const [deleteTarget, setDeleteTarget] = useState<ParamGroupRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const loadParamGroups = async (): Promise<ParamGroupRow[]> => {
    const list = await ecAll("DescribeCacheParameterGroups", "CacheParameterGroups");
    return list || [];
  };

  const columns: Col<ParamGroupRow>[] = [
    {
      id: "name",
      header: "Name",
      cell: p => <b>{p.CacheParameterGroupName}</b>,
    },
    {
      id: "family",
      header: "Family",
      cell: p => p.CacheParameterGroupFamily,
    },
    {
      id: "desc",
      header: "Description",
      cell: p => p.Description || "-",
    },
  ];

  const actions: Action<ParamGroupRow>[] = [
    {
      id: "delete",
      text: "Delete",
      disabled: sel => sel.length !== 1 || sel[0].CacheParameterGroupName.startsWith("default."),
      disabledReason: "Default parameter groups cannot be deleted.",
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
      await ec("DeleteCacheParameterGroup", {
        CacheParameterGroupName: deleteTarget.CacheParameterGroupName,
      });
      flash.notify({ type: "success", content: `Deleted parameter group ${deleteTarget.CacheParameterGroupName}.` });
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
      <ResourcePage<ParamGroupRow>
        title="Parameter groups"
        description="A cache parameter group acts as a container for engine configuration values that can be applied to one or more clusters."
        load={loadParamGroups}
        columns={columns}
        trackBy="CacheParameterGroupName"
        create={{ text: "Create parameter group", href: "#/elasticache/parameter-groups/create" }}
        actions={actions}
        multi={false}
      />

      {deleteTarget && (
        <Modal
          visible={true}
          onDismiss={() => setDeleteTarget(null)}
          header={`Delete parameter group ${deleteTarget.CacheParameterGroupName}`}
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
              Are you sure you want to delete parameter group <b>{deleteTarget.CacheParameterGroupName}</b>?
            </Box>
            <ErrorAlert error={error} />
          </SpaceBetween>
        </Modal>
      )}
    </>
  );
}

export function CreateParameterGroup() {
  const nav = useNavigate();
  const flash = useFlash();

  useCrumbs(
    crumbs(
      { text: "Parameter groups", href: "#/elasticache/parameter-groups" },
      { text: "Create parameter group" }
    )
  );

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [family, setFamily] = useState(FAMILIES[0]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await ec("CreateCacheParameterGroup", {
        CacheParameterGroupName: name.trim(),
        CacheParameterGroupFamily: family.value,
        Description: description.trim() || name.trim(),
      });

      flash.notify({ type: "success", content: `Created parameter group ${name}.` });
      nav("/elasticache/parameter-groups");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ContentLayout
      header={
        <Header variant="h1" description="Create a custom parameter group for your cache engine.">
          Create parameter group
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Parameter group details</Header>}>
          <SpaceBetween size="m">
            <FormField label="Family">
              <Select
                selectedOption={family}
                onChange={e => setFamily(e.detail.selectedOption as any)}
                options={FAMILIES}
              />
            </FormField>

            <FormField label="Name" constraintText="Required">
              <Input
                value={name}
                placeholder="custom-redis-params"
                onChange={e => setName(e.detail.value)}
              />
            </FormField>

            <FormField label="Description">
              <Input
                value={description}
                placeholder="Custom parameter overrides for caching"
                onChange={e => setDescription(e.detail.value)}
              />
            </FormField>
          </SpaceBetween>
        </Container>

        <ErrorAlert error={error} />

        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={() => nav(-1)}>
              Cancel
            </Button>
            <Button variant="primary" loading={busy} disabled={!name.trim()} onClick={submit}>
              Create
            </Button>
          </SpaceBetween>
        </Box>
      </SpaceBetween>
    </ContentLayout>
  );
}
