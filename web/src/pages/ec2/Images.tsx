import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Table from "@cloudscape-design/components/table";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import SegmentedControl from "@cloudscape-design/components/segmented-control";
import Box from "@cloudscape-design/components/box";
import Cards from "@cloudscape-design/components/cards";
import Header from "@cloudscape-design/components/header";
import Button from "@cloudscape-design/components/button";
import TextFilter from "@cloudscape-design/components/text-filter";
import SpaceBetween from "@cloudscape-design/components/space-between";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Badge from "@cloudscape-design/components/badge";
import { useCrumbs } from "../../App";
import { useAsync, useFlash, ValueWithLabel } from "../../common";
import { ec2, State, fmt, nameOf } from "./lib";
import { ResourcePage, ActionModal, useModal } from "./ResourcePage";
import { TagsModal } from "./InstanceActions";

export function Amis() {
  useCrumbs([{ text: "EC2", href: "#/ec2/dashboard" }, { text: "AMIs", href: "#" }]);
  const nav = useNavigate();
  const flash = useFlash();
  const [owner, setOwner] = useState("self");
  const m = useModal<any>();
  return <>
    <ResourcePage<any>
      key={owner}
      title="Amazon Machine Images (AMIs)" trackBy="ImageId" deps={[owner]}
      banner={<SegmentedControl selectedId={owner} onChange={e => setOwner(e.detail.selectedId)} options={[{ id: "self", text: "Owned by me" }, { id: "amazon", text: "Public images" }]} />}
      load={async () => ((await ec2("DescribeImages", { Owners: [owner] })).Images || []).sort((a: any, b: any) => String(b.CreationDate).localeCompare(String(a.CreationDate)))}
      columns={[
        { id: "n", header: "Name", cell: a => nameOf(a) || "-" },
        { id: "an", header: "AMI name", cell: a => a.Name },
        { id: "id", header: "AMI ID", cell: a => a.ImageId },
        { id: "src", header: "Source", cell: a => a.ImageLocation || "-", hidden: true },
        { id: "o", header: "Owner", cell: a => a.ImageOwnerAlias || a.OwnerId },
        { id: "v", header: "Visibility", cell: a => a.Public ? "Public" : "Private" },
        { id: "s", header: "Status", cell: a => <State s={a.State} /> },
        { id: "c", header: "Creation date", cell: a => fmt(a.CreationDate) },
        { id: "p", header: "Platform", cell: a => a.PlatformDetails || "Linux/UNIX" },
        { id: "a", header: "Architecture", cell: a => a.Architecture },
        { id: "r", header: "Root device type", cell: a => a.RootDeviceType, hidden: true },
      ]}
      primaryActions={[{ id: "launch", text: "Launch instance from AMI", disabled: s => s.length !== 1, run: s => nav(`/ec2/launch?ami=${s[0].ImageId}`) }]}
      actions={[
        { id: "copy", text: "Copy AMI", disabled: () => true, disabledReason: "CopyImage isn't implemented in AWS Emulator.", run: () => {} },
        { id: "tags", text: "Manage tags", disabled: s => s.length !== 1, run: (s, r) => m.open("tags", s, r) },
        { id: "dereg", text: "Deregister AMI", disabled: s => !s.length || s.some(a => a.ImageOwnerAlias), disabledReason: "You can only deregister AMIs you own.", run: (s, r) => m.open("dereg", s, r) },
      ]}
      detail={a => [
        { id: "d", label: "Details", content: <ColumnLayout columns={4} variant="text-grid">
          <ValueWithLabel label="AMI ID">{a.ImageId}</ValueWithLabel>
          <ValueWithLabel label="Image type">{a.ImageType}</ValueWithLabel>
          <ValueWithLabel label="Platform details">{a.PlatformDetails}</ValueWithLabel>
          <ValueWithLabel label="Root device type">{a.RootDeviceType}</ValueWithLabel>
          <ValueWithLabel label="AMI name">{a.Name}</ValueWithLabel>
          <ValueWithLabel label="Owner account ID">{a.OwnerId}</ValueWithLabel>
          <ValueWithLabel label="Architecture">{a.Architecture}</ValueWithLabel>
          <ValueWithLabel label="Usage operation">{a.UsageOperation || "-"}</ValueWithLabel>
          <ValueWithLabel label="Root device name">{a.RootDeviceName}</ValueWithLabel>
          <ValueWithLabel label="Status">{a.State}</ValueWithLabel>
          <ValueWithLabel label="Virtualization type">{a.VirtualizationType}</ValueWithLabel>
          <ValueWithLabel label="Boot mode">{a.BootMode || "-"}</ValueWithLabel>
          <ValueWithLabel label="Creation date">{fmt(a.CreationDate)}</ValueWithLabel>
          <ValueWithLabel label="Deprecation time">{a.DeprecationTime ? fmt(a.DeprecationTime) : "-"}</ValueWithLabel>
          <ValueWithLabel label="ENA support">{String(a.EnaSupport ?? "-")}</ValueWithLabel>
          <ValueWithLabel label="Description">{a.Description || "-"}</ValueWithLabel>
        </ColumnLayout> },
        { id: "s", label: "Storage", content: <Table variant="embedded" items={a.BlockDeviceMappings || []} columnDefinitions={[
          { id: "d", header: "Device name", cell: (b: any) => b.DeviceName },
          { id: "s", header: "Snapshot", cell: (b: any) => b.Ebs?.SnapshotId || "-" },
          { id: "z", header: "Size (GiB)", cell: (b: any) => b.Ebs?.VolumeSize ?? "-" },
          { id: "t", header: "Volume type", cell: (b: any) => b.Ebs?.VolumeType ?? (b.VirtualName ? "ephemeral" : "-") },
          { id: "del", header: "Delete on termination", cell: (b: any) => String(b.Ebs?.DeleteOnTermination ?? "-") },
          { id: "e", header: "Encrypted", cell: (b: any) => String(b.Ebs?.Encrypted ?? "-") },
        ]} /> },
        { id: "t", label: "Tags", content: <Table variant="embedded" items={a.Tags || []} empty={<Box color="text-body-secondary">No tags</Box>} columnDefinitions={[{ id: "k", header: "Key", cell: (t: any) => t.Key }, { id: "v", header: "Value", cell: (t: any) => t.Value }]} /> },
      ]}
    />
    {m.is("tags") && <TagsModal id={m.rows[0].ImageId} tags={m.rows[0].Tags} close={m.close} done={() => { m.close(); m.reload(); }} />}
    <ActionModal visible={m.is("dereg")} onDismiss={m.close} header="Deregister AMI" ok="Deregister AMI" danger onOk={async () => {
      for (const a of m.rows) await ec2("DeregisterImage", { ImageId: a.ImageId });
      flash.notify({ type: "success", content: `Deregistered ${m.rows.map(a => a.ImageId).join(", ")}.` }); m.reload();
    }}><Box>Deregistering an AMI doesn't delete its snapshots. You can't launch new instances from it afterwards.</Box></ActionModal>
  </>;
}

const OS = [
  { id: "al", label: "Amazon Linux", re: /al2023|amzn/i }, { id: "ubuntu", label: "Ubuntu", re: /ubuntu/i }, { id: "windows", label: "Windows", re: /windows/i },
  { id: "rhel", label: "Red Hat", re: /rhel|red ?hat/i }, { id: "suse", label: "SUSE Linux", re: /suse|sles/i }, { id: "debian", label: "Debian", re: /debian/i },
];
export function AmiCatalog() {
  useCrumbs([{ text: "EC2", href: "#/ec2/dashboard" }, { text: "AMI Catalog", href: "#" }]);
  const nav = useNavigate();
  const [tab, setTab] = useState("quick");
  const [q, setQ] = useState("");
  const amis = useAsync(async () => (await ec2("DescribeImages", { Owners: tab === "mine" ? ["self"] : ["amazon"] })).Images || [], [tab]);
  const list = (amis.data || []).filter((a: any) => `${a.Name} ${a.Description || ""} ${a.ImageId}`.toLowerCase().includes(q.toLowerCase()));
  const quick = tab === "quick" ? OS.map(o => ({ ...o, ami: list.filter((a: any) => o.re.test(`${a.Name} ${a.Description || ""}`)).sort((a: any, b: any) => String(b.CreationDate).localeCompare(String(a.CreationDate)))[0] })).filter(o => o.ami).map(o => o.ami) : list;
  return (
    <ContentLayout header={<Header variant="h1" description="Find and launch the AMI you need.">AMI Catalog</Header>}>
      <SpaceBetween size="l">
        <SegmentedControl selectedId={tab} onChange={e => setTab(e.detail.selectedId)} options={[{ id: "quick", text: "Quickstart AMIs" }, { id: "all", text: "Community AMIs" }, { id: "mine", text: "My AMIs" }]} />
        <Cards
          loading={amis.loading} items={quick} trackBy="ImageId"
          cardsPerRow={[{ cards: 1 }, { minWidth: 700, cards: 2 }]}
          filter={<TextFilter filteringText={q} onChange={e => setQ(e.detail.filteringText)} filteringPlaceholder="Search the AMI catalog" />}
          header={<Header counter={`(${quick.length})`}>{tab === "quick" ? "Quickstart AMIs" : tab === "mine" ? "My AMIs" : "Community AMIs"}</Header>}
          empty={<Box textAlign="center" color="inherit">No AMIs found</Box>}
          cardDefinition={{
            header: (a: any) => a.Name,
            sections: [
              { id: "d", content: (a: any) => <Box color="text-body-secondary">{a.Description || "-"}</Box> },
              { id: "m", content: (a: any) => <SpaceBetween direction="horizontal" size="xs"><Badge>{a.ImageId}</Badge><Badge color="grey">{a.Architecture}</Badge><Badge color="grey">{a.PlatformDetails || "Linux/UNIX"}</Badge>{a.ImageOwnerAlias === "amazon" && <Badge color="blue">Verified provider</Badge>}</SpaceBetween> },
              { id: "a", content: (a: any) => <Button onClick={() => nav(`/ec2/launch?ami=${a.ImageId}`)}>Select</Button> },
            ],
          }}
        />
      </SpaceBetween>
    </ContentLayout>
  );
}
