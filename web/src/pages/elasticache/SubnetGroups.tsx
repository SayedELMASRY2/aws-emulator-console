import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Select from "@cloudscape-design/components/select";
import Multiselect from "@cloudscape-design/components/multiselect";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Modal from "@cloudscape-design/components/modal";
import { ResourcePage, type Col, type Action } from "../ec2/ResourcePage";
import { useCrumbs } from "../../App";
import { useFlash, ErrorAlert } from "../../common";
import { ec, ecAll, crumbs } from "./lib";
import { useVpcs, useSubnets } from "../ec2/lib";

export interface SubnetGroupRow {
  CacheSubnetGroupName: string;
  CacheSubnetGroupDescription?: string;
  VpcId?: string;
  Subnets?: { SubnetIdentifier?: string }[];
  ARN?: string;
}

export default function SubnetGroups() {
  useCrumbs(crumbs({ text: "Subnet groups" }));
  const flash = useFlash();

  const [deleteTarget, setDeleteTarget] = useState<SubnetGroupRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const loadSubnetGroups = async (): Promise<SubnetGroupRow[]> => {
    const list = await ecAll("DescribeCacheSubnetGroups", "CacheSubnetGroups");
    return list || [];
  };

  const columns: Col<SubnetGroupRow>[] = [
    {
      id: "name",
      header: "Name",
      cell: g => <b>{g.CacheSubnetGroupName}</b>,
    },
    {
      id: "desc",
      header: "Description",
      cell: g => g.CacheSubnetGroupDescription || "-",
    },
    {
      id: "vpc",
      header: "VPC ID",
      cell: g => g.VpcId || "-",
    },
    {
      id: "subnets",
      header: "Subnets",
      cell: g => g.Subnets?.length ?? 0,
    },
  ];

  const actions: Action<SubnetGroupRow>[] = [
    {
      id: "delete",
      text: "Delete",
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
      await ec("DeleteCacheSubnetGroup", {
        CacheSubnetGroupName: deleteTarget.CacheSubnetGroupName,
      });
      flash.notify({ type: "success", content: `Deleted subnet group ${deleteTarget.CacheSubnetGroupName}.` });
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
      <ResourcePage<SubnetGroupRow>
        title="Subnet groups"
        description="A cache subnet group is a collection of subnets that you designate for your clusters in an Amazon VPC."
        load={loadSubnetGroups}
        columns={columns}
        trackBy="CacheSubnetGroupName"
        create={{ text: "Create subnet group", href: "#/elasticache/subnet-groups/create" }}
        actions={actions}
        multi={false}
      />

      {deleteTarget && (
        <Modal
          visible={true}
          onDismiss={() => setDeleteTarget(null)}
          header={`Delete subnet group ${deleteTarget.CacheSubnetGroupName}`}
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
              Are you sure you want to delete subnet group <b>{deleteTarget.CacheSubnetGroupName}</b>?
            </Box>
            <ErrorAlert error={error} />
          </SpaceBetween>
        </Modal>
      )}
    </>
  );
}

export function CreateSubnetGroup() {
  const nav = useNavigate();
  const flash = useFlash();

  useCrumbs(
    crumbs(
      { text: "Subnet groups", href: "#/elasticache/subnet-groups" },
      { text: "Create subnet group" }
    )
  );

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const vpcs = useVpcs();
  const [selectedVpc, setSelectedVpc] = useState<any | null>(null);
  const subnets = useSubnets(selectedVpc?.value);
  const [selectedSubnets, setSelectedSubnets] = useState<any[]>([]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async () => {
    if (!name.trim()) return;
    const subList = selectedSubnets.map(s => s.value);
    if (!subList.length) {
      setError(new Error("Please select at least one subnet."));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await ec("CreateCacheSubnetGroup", {
        CacheSubnetGroupName: name.trim(),
        CacheSubnetGroupDescription: description.trim() || name.trim(),
        SubnetIds: subList,
      });

      flash.notify({ type: "success", content: `Created subnet group ${name}.` });
      nav("/elasticache/subnet-groups");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ContentLayout
      header={
        <Header variant="h1" description="Create a subnet group for VPC network isolation.">
          Create subnet group
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Subnet group details</Header>}>
          <SpaceBetween size="m">
            <FormField label="Name" constraintText="Required">
              <Input
                value={name}
                placeholder="my-cache-subnets"
                onChange={e => setName(e.detail.value)}
              />
            </FormField>

            <FormField label="Description">
              <Input
                value={description}
                placeholder="Subnet group for caching tier"
                onChange={e => setDescription(e.detail.value)}
              />
            </FormField>

            <FormField label="VPC">
              <Select
                selectedOption={selectedVpc}
                onChange={e => {
                  setSelectedVpc(e.detail.selectedOption);
                  setSelectedSubnets([]);
                }}
                options={vpcs.data || []}
                placeholder="Select a VPC"
                loadingText="Loading VPCs..."
              />
            </FormField>

            <FormField label="Subnets" constraintText="Select subnets in your VPC">
              <Multiselect
                selectedOptions={selectedSubnets}
                onChange={e => setSelectedSubnets(e.detail.selectedOptions as any)}
                options={subnets.data || []}
                placeholder="Select subnets"
                disabled={!selectedVpc}
                empty={selectedVpc ? "No subnets found" : "Select a VPC first"}
                loadingText="Loading subnets..."
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
