import { useState } from "react";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Table from "@cloudscape-design/components/table";
import Button from "@cloudscape-design/components/button";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Box from "@cloudscape-design/components/box";
import Modal from "@cloudscape-design/components/modal";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Select from "@cloudscape-design/components/select";
import Multiselect from "@cloudscape-design/components/multiselect";
import Checkbox from "@cloudscape-design/components/checkbox";
import { useCrumbs } from "../../App";
import { api } from "../../api";
import { ConfirmModal, ErrorAlert, fmtDate, useAsync, useFlash, EmulatorNote } from "../../common";

const dax = (op: string, p: Record<string, unknown> = {}) => api.call("dax", op, p);
const crumbs = (x: string) => [{ text: "DynamoDB", href: "#/dynamodb/dashboard" }, { text: "DAX", href: "#/dynamodb/dax/clusters" }, { text: x, href: "#" }];
const NOTE = <EmulatorNote>DAX management calls go to the emulator. Creating a subnet group was rejected in testing ("Some input subnets are invalid"), so cluster creation may not work here. No DAX endpoint is served for client traffic.</EmulatorNote>;

export function DaxClusters() {
  useCrumbs(crumbs("Clusters"));
  const flash = useFlash();
  const data = useAsync(async () => (await dax("DescribeClusters")).Clusters || [], []);
  const groups = useAsync(async () => ((await dax("DescribeSubnetGroups")).SubnetGroups || []).map((g: any) => ({ value: g.SubnetGroupName, label: g.SubnetGroupName })), []);
  const [sel, setSel] = useState<any[]>([]);
  const [create, setCreate] = useState(false);
  const [del, setDel] = useState(false);
  const [f, setF] = useState({ name: "", node: { value: "dax.t3.small", label: "dax.t3.small" }, nodes: "3", group: null as any, role: "arn:aws:iam::000000000000:role/DAXServiceRole", enc: true });
  return (
    <ContentLayout>
      <SpaceBetween size="l">
        {NOTE}
        {data.error ? <ErrorAlert error={data.error} /> : null}
        <Table variant="full-page"
          header={<Header variant="awsui-h1-sticky" counter={`(${data.data?.length || 0})`} description="DynamoDB Accelerator (DAX) is an in-memory cache for DynamoDB."
            actions={<SpaceBetween direction="horizontal" size="xs"><Button iconName="refresh" ariaLabel="Refresh" onClick={() => data.reload()} /><Button disabled={!sel.length} onClick={() => setDel(true)}>Delete</Button><Button variant="primary" onClick={() => setCreate(true)}>Create cluster</Button></SpaceBetween>}>Clusters</Header>}
          items={data.data || []} loading={data.loading} trackBy="ClusterName" selectionType="single" selectedItems={sel} onSelectionChange={e => setSel(e.detail.selectedItems)}
          empty={<Box textAlign="center" color="inherit"><b>No clusters</b></Box>}
          columnDefinitions={[
            { id: "n", header: "Cluster name", cell: (c: any) => c.ClusterName },
            { id: "s", header: "Status", cell: (c: any) => c.Status === "available" ? <StatusIndicator type="success">Available</StatusIndicator> : <StatusIndicator type="in-progress">{c.Status}</StatusIndicator> },
            { id: "t", header: "Node type", cell: (c: any) => c.NodeType },
            { id: "c", header: "Nodes", cell: (c: any) => c.TotalNodes },
            { id: "e", header: "Cluster endpoint", cell: (c: any) => c.ClusterDiscoveryEndpoint ? `${c.ClusterDiscoveryEndpoint.Address}:${c.ClusterDiscoveryEndpoint.Port}` : "-" },
          ]}
        />
      </SpaceBetween>
      <Modal visible={create} onDismiss={() => setCreate(false)} header="Create DAX cluster" size="medium"
        footer={<Box float="right"><SpaceBetween direction="horizontal" size="xs"><Button variant="link" onClick={() => setCreate(false)}>Cancel</Button><Button variant="primary" disabled={!f.name || !f.group} onClick={async () => {
          try { await dax("CreateCluster", { ClusterName: f.name, NodeType: f.node.value, ReplicationFactor: Number(f.nodes), SubnetGroupName: f.group.value, IamRoleArn: f.role, SSESpecification: { Enabled: f.enc } }); setCreate(false); data.reload(); }
          catch (e) { flash.error(e); }
        }}>Create cluster</Button></SpaceBetween></Box>}>
        <SpaceBetween size="m">
          <FormField label="Cluster name"><Input value={f.name} onChange={e => setF({ ...f, name: e.detail.value })} /></FormField>
          <FormField label="Node type"><Select selectedOption={f.node} options={["dax.t3.small", "dax.t3.medium", "dax.r5.large", "dax.r5.xlarge"].map(x => ({ value: x, label: x }))} onChange={e => setF({ ...f, node: e.detail.selectedOption as any })} /></FormField>
          <FormField label="Cluster size (nodes)"><Input type="number" value={f.nodes} onChange={e => setF({ ...f, nodes: e.detail.value })} /></FormField>
          <FormField label="Subnet group" description={groups.data && !groups.data.length ? "Create a subnet group first." : undefined}><Select selectedOption={f.group} placeholder="Choose a subnet group" options={groups.data || []} onChange={e => setF({ ...f, group: e.detail.selectedOption })} /></FormField>
          <FormField label="IAM role ARN"><Input value={f.role} onChange={e => setF({ ...f, role: e.detail.value })} /></FormField>
          <Checkbox checked={f.enc} onChange={e => setF({ ...f, enc: e.detail.checked })}>Turn on encryption at rest</Checkbox>
        </SpaceBetween>
      </Modal>
      <ConfirmModal visible={del} onDismiss={() => setDel(false)} header={`Delete cluster ${sel[0]?.ClusterName}`} confirmText="delete"
        onConfirm={async () => { try { await dax("DeleteCluster", { ClusterName: sel[0].ClusterName }); setSel([]); data.reload(); } catch (e) { flash.error(e); } setDel(false); }}>
        <Box>The cluster and its cached data will be deleted.</Box>
      </ConfirmModal>
    </ContentLayout>
  );
}

export function DaxSubnetGroups() {
  useCrumbs(crumbs("Subnet groups"));
  const flash = useFlash();
  const data = useAsync(async () => (await dax("DescribeSubnetGroups")).SubnetGroups || [], []);
  const subnets = useAsync(async () => ((await api.call("ec2", "DescribeSubnets")).Subnets || []).map((s: any) => ({ value: s.SubnetId, label: s.SubnetId, description: `${s.AvailabilityZone} · ${s.CidrBlock}` })), []);
  const [create, setCreate] = useState(false);
  const [name, setName] = useState("");
  const [sel, setSel] = useState<any[]>([]);
  return (
    <ContentLayout>
      <SpaceBetween size="l">
        {NOTE}
        <Table variant="full-page"
          header={<Header variant="awsui-h1-sticky" counter={`(${data.data?.length || 0})`} actions={<Button variant="primary" onClick={() => setCreate(true)}>Create subnet group</Button>}>Subnet groups</Header>}
          items={data.data || []} loading={data.loading}
          empty={<Box textAlign="center" color="inherit"><b>No subnet groups</b></Box>}
          columnDefinitions={[
            { id: "n", header: "Name", cell: (g: any) => g.SubnetGroupName },
            { id: "v", header: "VPC", cell: (g: any) => g.VpcId },
            { id: "s", header: "Subnets", cell: (g: any) => (g.Subnets || []).map((s: any) => s.SubnetIdentifier).join(", ") },
          ]}
        />
      </SpaceBetween>
      <Modal visible={create} onDismiss={() => setCreate(false)} header="Create subnet group"
        footer={<Box float="right"><SpaceBetween direction="horizontal" size="xs"><Button variant="link" onClick={() => setCreate(false)}>Cancel</Button><Button variant="primary" disabled={!name || !sel.length} onClick={async () => {
          try { await dax("CreateSubnetGroup", { SubnetGroupName: name, SubnetIds: sel.map(s => s.value) }); setCreate(false); data.reload(); } catch (e) { flash.error(e); }
        }}>Create</Button></SpaceBetween></Box>}>
        <SpaceBetween size="m">
          <FormField label="Name"><Input value={name} onChange={e => setName(e.detail.value)} /></FormField>
          <FormField label="Subnets"><Multiselect selectedOptions={sel} options={subnets.data || []} onChange={e => setSel(e.detail.selectedOptions as any)} placeholder="Choose subnets" /></FormField>
        </SpaceBetween>
      </Modal>
    </ContentLayout>
  );
}

export function DaxParameterGroups() {
  useCrumbs(crumbs("Parameter groups"));
  const data = useAsync(async () => (await dax("DescribeParameterGroups")).ParameterGroups || [], []);
  return (
    <ContentLayout>
      <Table variant="full-page" header={<Header variant="awsui-h1-sticky" counter={`(${data.data?.length || 0})`}>Parameter groups</Header>}
        items={data.data || []} loading={data.loading} empty={<Box textAlign="center" color="inherit">No parameter groups</Box>}
        columnDefinitions={[{ id: "n", header: "Name", cell: (g: any) => g.ParameterGroupName }, { id: "d", header: "Description", cell: (g: any) => g.Description || "-" }]} />
    </ContentLayout>
  );
}

export function DaxEvents() {
  useCrumbs(crumbs("Events"));
  const data = useAsync(async () => (await dax("DescribeEvents")).Events || [], []);
  return (
    <ContentLayout>
      <Table variant="full-page" header={<Header variant="awsui-h1-sticky" counter={`(${data.data?.length || 0})`}>Events</Header>}
        items={data.data || []} loading={data.loading} empty={<Box textAlign="center" color="inherit">No events</Box>}
        columnDefinitions={[{ id: "s", header: "Source", cell: (e: any) => e.SourceName }, { id: "t", header: "Type", cell: (e: any) => e.SourceType }, { id: "m", header: "Message", cell: (e: any) => e.Message }, { id: "d", header: "Date", cell: (e: any) => fmtDate(e.Date) }]} />
    </ContentLayout>
  );
}
