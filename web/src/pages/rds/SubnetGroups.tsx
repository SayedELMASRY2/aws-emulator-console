import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import SpaceBetween from "@cloudscape-design/components/space-between";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Select from "@cloudscape-design/components/select";
import Multiselect from "@cloudscape-design/components/multiselect";
import Button from "@cloudscape-design/components/button";
import Box from "@cloudscape-design/components/box";
import Link from "@cloudscape-design/components/link";
import Table from "@cloudscape-design/components/table";
import Spinner from "@cloudscape-design/components/spinner";
import { useCrumbs } from "../../App";
import { ErrorAlert, useAsync, useFlash, ValueWithLabel, Copyable } from "../../common";
import { useVpcs, useSubnets } from "../ec2/lib";
import { ResourcePage, ActionModal } from "../ec2/ResourcePage";
import { rds, rdsAll, crumbs, Status } from "./lib";
import { TagsTab } from "./DatabaseDetail";

const href = (n: string) => `#/rds/subnet-groups/${encodeURIComponent(n)}`;

export function SubnetGroups() {
  useCrumbs(crumbs({ text: "Subnet groups" }));
  const nav = useNavigate();
  const flash = useFlash();
  const [del, setDel] = useState<{ g: any; r: () => void } | null>(null);
  return (
    <>
      <ResourcePage<any> title="Subnet groups" load={() => rdsAll("DescribeDBSubnetGroups", "DBSubnetGroups")} trackBy="DBSubnetGroupName" multi={false}
        primaryActions={[
          { id: "edit", text: "Edit", disabled: s => s.length !== 1, run: s => nav(`/rds/subnet-groups/${encodeURIComponent(s[0].DBSubnetGroupName)}/edit`) },
          { id: "delete", text: "Delete", disabled: s => s.length !== 1 || s[0].DBSubnetGroupName === "default", run: (s, r) => setDel({ g: s[0], r }) },
        ]}
        create={{ text: "Create DB subnet group", href: "#/rds/subnet-groups/create" }}
        columns={[
          { id: "n", header: "Name", cell: g => <Link href={href(g.DBSubnetGroupName)}>{g.DBSubnetGroupName}</Link>, sortingField: "DBSubnetGroupName" },
          { id: "d", header: "Description", cell: g => g.DBSubnetGroupDescription },
          { id: "s", header: "Status", cell: g => <Status s={g.SubnetGroupStatus} /> },
          { id: "v", header: "VPC", cell: g => g.VpcId },
          { id: "c", header: "Subnets", cell: g => (g.Subnets || []).length },
          { id: "t", header: "Supported network types", cell: g => (g.SupportedNetworkTypes || ["IPV4"]).join(", ") },
        ]} />
      {del && <ActionModal visible danger onDismiss={() => setDel(null)} header="Delete DB subnet group" ok="Delete" onOk={async () => {
        await rds("DeleteDBSubnetGroup", { DBSubnetGroupName: del.g.DBSubnetGroupName });
        flash.notify({ type: "success", content: `Deleted subnet group ${del.g.DBSubnetGroupName}.` }); del.r();
      }}><Box>Are you sure you want to delete <b>{del.g.DBSubnetGroupName}</b>?</Box></ActionModal>}
    </>
  );
}

export function EditSubnetGroup() {
  const { name: editName } = useParams();
  const nav = useNavigate();
  const flash = useFlash();
  useCrumbs(crumbs({ text: "Subnet groups", href: "#/rds/subnet-groups" }, ...(editName ? [{ text: editName, href: href(editName) }, { text: "Edit" }] : [{ text: "Create DB subnet group" }])));
  const existing = useAsync(async () => editName ? (await rds("DescribeDBSubnetGroups", { DBSubnetGroupName: editName })).DBSubnetGroups[0] : null, [editName]);
  const vpcs = useVpcs();
  const [name, setName] = useState(editName || "");
  const [desc, setDesc] = useState("");
  const [vpc, setVpc] = useState<any>(null);
  const [azs, setAzs] = useState<any[]>([]);
  const [subs, setSubs] = useState<any[]>([]);
  const subnets = useSubnets(vpc?.value);
  useEffect(() => {
    if (!vpcs.data) return;
    const g = existing.data;
    if (g) { setDesc(g.DBSubnetGroupDescription); setVpc(vpcs.data.find((v: any) => v.value === g.VpcId) || null); }
    else if (!editName && !vpc) setVpc(vpcs.data.find((v: any) => v.raw.IsDefault) || vpcs.data[0] || null);
  }, [vpcs.data, existing.data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const g = existing.data;
    if (!subnets.data) return;
    if (g && !subs.length) {
      const sel = subnets.data.filter((s: any) => (g.Subnets || []).some((x: any) => x.SubnetIdentifier === s.value));
      setSubs(sel); setAzs([...new Set(sel.map((s: any) => s.raw.AvailabilityZone as string))].map(a => ({ value: a, label: a })));
    }
  }, [subnets.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const azOpts = [...new Set((subnets.data || []).map((s: any) => s.raw.AvailabilityZone as string))].sort().map(a => ({ value: a, label: a }));
  const subOpts = (subnets.data || []).filter((s: any) => azs.some(a => a.value === s.raw.AvailabilityZone));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  if (editName && existing.loading) return <Box textAlign="center" padding="xl"><Spinner size="large" /></Box>;
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const p = { DBSubnetGroupName: name, DBSubnetGroupDescription: desc, SubnetIds: subs.map(s => s.value) };
      await rds(editName ? "ModifyDBSubnetGroup" : "CreateDBSubnetGroup", p);
      flash.notify({ type: "success", content: `Successfully ${editName ? "updated" : "created"} ${name}.` });
      nav("/rds/subnet-groups");
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <ContentLayout header={<Header variant="h1" description="To create a new subnet group, give it a name and a description, and choose an existing VPC. You will then be able to add subnets related to that VPC.">{editName ? `Edit ${editName}` : "Create DB subnet group"}</Header>}>
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Subnet group details</Header>}>
          <SpaceBetween size="l">
            <FormField label="Name" constraintText="Must contain from 1 to 255 characters. Alphanumeric characters, spaces, hyphens, underscores, and periods are allowed."><Input value={name} disabled={!!editName} onChange={e => setName(e.detail.value)} /></FormField>
            <FormField label="Description"><Input value={desc} onChange={e => setDesc(e.detail.value)} /></FormField>
            <FormField label="VPC" description="Choose a VPC identifier that corresponds to the subnets you want to use for your DB subnet group. You can't choose a different VPC identifier after your subnet group has been created.">
              <Select selectedOption={vpc} options={vpcs.data || []} disabled={!!editName} onChange={e => { setVpc(e.detail.selectedOption); setAzs([]); setSubs([]); }} />
            </FormField>
          </SpaceBetween>
        </Container>
        <Container header={<Header variant="h2">Add subnets</Header>}>
          <SpaceBetween size="l">
            <FormField label="Availability Zones" description="Choose the Availability Zones that include the subnets you want to add.">
              <Multiselect selectedOptions={azs} options={azOpts as any[]} onChange={e => { const a = e.detail.selectedOptions as any[]; setAzs(a); setSubs(subs.filter(s => a.some(x => x.value === s.raw.AvailabilityZone))); }} placeholder="Choose an availability zone" />
            </FormField>
            <FormField label="Subnets" description="Choose the subnets that you want to add. The list includes the subnets in the selected Availability Zones." constraintText="For Multi-AZ DB clusters, you must select 3 subnets in 3 different Availability Zones.">
              <Multiselect selectedOptions={subs} options={subOpts} onChange={e => setSubs(e.detail.selectedOptions as any)} placeholder="Select subnets" />
            </FormField>
            <Table variant="embedded" header={<Header variant="h3" counter={`(${subs.length})`}>Subnets selected</Header>} items={subs}
              empty={<Box color="text-body-secondary">No subnets selected</Box>}
              columnDefinitions={[{ id: "a", header: "Availability zone", cell: (s: any) => s.raw.AvailabilityZone }, { id: "s", header: "Subnet ID", cell: (s: any) => s.value }, { id: "c", header: "CIDR block", cell: (s: any) => s.raw.CidrBlock }]} />
          </SpaceBetween>
        </Container>
        <ErrorAlert error={err} />
        <Box float="right"><SpaceBetween direction="horizontal" size="xs">
          <Button variant="link" onClick={() => nav(-1)}>Cancel</Button>
          <Button variant="primary" loading={busy} disabled={!name || !desc || subs.length < 1} onClick={submit}>{editName ? "Save" : "Create"}</Button>
        </SpaceBetween></Box>
      </SpaceBetween>
    </ContentLayout>
  );
}

export function SubnetGroupDetail() {
  const { name = "" } = useParams();
  useCrumbs(crumbs({ text: "Subnet groups", href: "#/rds/subnet-groups" }, { text: name }));
  const d = useAsync(async () => (await rds("DescribeDBSubnetGroups", { DBSubnetGroupName: name })).DBSubnetGroups[0], [name]);
  if (d.error) return <ErrorAlert error={d.error} />;
  const g = d.data;
  if (!g) return <Box textAlign="center" padding="xl"><Spinner size="large" /></Box>;
  const V = ValueWithLabel;
  return (
    <ContentLayout header={<Header variant="h1" actions={<Button href={`${href(name)}/edit`}>Edit</Button>}>{name}</Header>}>
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Subnet group details</Header>}>
          <ColumnLayout columns={3} variant="text-grid">
            <V label="VPC ID">{g.VpcId}</V><V label="ARN"><Copyable text={g.DBSubnetGroupArn} /></V><V label="Description">{g.DBSubnetGroupDescription}</V>
            <V label="Status"><Status s={g.SubnetGroupStatus} /></V><V label="Supported network types">{(g.SupportedNetworkTypes || ["IPV4"]).join(", ")}</V>
          </ColumnLayout>
        </Container>
        <Table variant="container" header={<Header variant="h2" counter={`(${(g.Subnets || []).length})`}>Subnets</Header>} items={g.Subnets || []}
          columnDefinitions={[{ id: "a", header: "Availability zone", cell: (s: any) => s.SubnetAvailabilityZone?.Name }, { id: "s", header: "Subnet ID", cell: (s: any) => s.SubnetIdentifier }, { id: "st", header: "Status", cell: (s: any) => s.SubnetStatus }]} />
        <TagsTab arnStr={g.DBSubnetGroupArn} />
      </SpaceBetween>
    </ContentLayout>
  );
}
