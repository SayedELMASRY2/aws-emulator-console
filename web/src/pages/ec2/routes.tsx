import { Fragment, type ReactElement } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { SideNavigationProps } from "@cloudscape-design/components/side-navigation";
import Badge from "@cloudscape-design/components/badge";
import Dashboard from "./Dashboard";
import Instances from "./Instances";
import InstanceDetail from "./InstanceDetail";
import LaunchWizard from "./LaunchWizard";
import { LaunchTemplates, InstanceTypes, SpotRequests, DedicatedHosts, CapacityReservations, Events } from "./Compute";
import { Amis, AmiCatalog } from "./Images";
import { Volumes, Snapshots, LifecycleManager } from "./Ebs";
import { SecurityGroups, SecurityGroupDetail, CreateSecurityGroup, EditRules } from "./SecurityGroups";
import { ElasticIps, KeyPairs, NetworkInterfaces, PlacementGroups } from "./Network";
import { LoadBalancers, CreateLoadBalancer, TargetGroups, CreateTargetGroup } from "./LoadBalancing";
import { AutoScalingGroups, CreateAutoScalingGroup } from "./AutoScaling";
import { Settings, Unsupported } from "./Settings";

const na = <Badge color="grey">n/a</Badge>;
const L = (text: string, path: string, info?: any): SideNavigationProps.Item => ({ type: "link", text, href: `#/ec2/${path}`, info });
export const EC2_NAV: { header: SideNavigationProps.Header; items: SideNavigationProps.Item[] } = {
  header: { text: "EC2", href: "#/ec2/dashboard" },
  items: [
    L("Dashboard", "dashboard"), L("EC2 Global View", "unsupported/global-view", na), L("Events", "events"),
    { type: "section", text: "Instances", defaultExpanded: true, items: [
      L("Instances", "instances"), L("Instance Types", "instance-types"), L("Launch Templates", "launch-templates"), L("Spot Requests", "spot-requests"),
      L("Savings Plans", "unsupported/savings-plans", na), L("Reserved Instances", "unsupported/reserved-instances", na), L("Dedicated Hosts", "dedicated-hosts"), L("Capacity Reservations", "capacity-reservations"),
    ] },
    { type: "section", text: "Images", defaultExpanded: true, items: [L("AMIs", "amis"), L("AMI Catalog", "ami-catalog")] },
    { type: "section", text: "Elastic Block Store", defaultExpanded: true, items: [L("Volumes", "volumes"), L("Snapshots", "snapshots"), L("Lifecycle Manager", "lifecycle-manager")] },
    { type: "section", text: "Network & Security", defaultExpanded: true, items: [
      L("Security Groups", "security-groups"), L("Elastic IPs", "elastic-ips"), L("Placement Groups", "placement-groups"), L("Key Pairs", "key-pairs"), L("Network Interfaces", "network-interfaces"),
    ] },
    { type: "section", text: "Load Balancing", defaultExpanded: true, items: [L("Load Balancers", "load-balancers"), L("Target Groups", "target-groups"), L("Trust Stores", "unsupported/trust-stores", na)] },
    { type: "section", text: "Auto Scaling", defaultExpanded: true, items: [L("Auto Scaling Groups", "auto-scaling-groups")] },
    L("Settings", "settings"),
    { type: "divider" },
    { type: "link", text: "Console home", href: "#/" },
  ],
};

function Fresh({ children }: { children: ReactElement }) {
  const loc = useLocation();
  return <Fragment key={loc.pathname + loc.search}>{children}</Fragment>;
}

export default function Ec2Routes() {
  return (
    <Routes>
      <Route index element={<Navigate to="dashboard" replace />} />
      <Route path="dashboard" element={<Dashboard />} />
      <Route path="events" element={<Events />} />
      <Route path="instances" element={<Instances />} />
      <Route path="instances/:id" element={<Fresh><InstanceDetail /></Fresh>} />
      <Route path="launch" element={<Fresh><LaunchWizard mode="instance" /></Fresh>} />
      <Route path="instance-types" element={<InstanceTypes />} />
      <Route path="launch-templates" element={<LaunchTemplates />} />
      <Route path="launch-templates/create" element={<Fresh><LaunchWizard mode="template" /></Fresh>} />
      <Route path="spot-requests" element={<SpotRequests />} />
      <Route path="dedicated-hosts" element={<DedicatedHosts />} />
      <Route path="capacity-reservations" element={<CapacityReservations />} />
      <Route path="amis" element={<Amis />} />
      <Route path="ami-catalog" element={<AmiCatalog />} />
      <Route path="volumes" element={<Volumes />} />
      <Route path="snapshots" element={<Snapshots />} />
      <Route path="lifecycle-manager" element={<LifecycleManager />} />
      <Route path="security-groups" element={<SecurityGroups />} />
      <Route path="security-groups/create" element={<Fresh><CreateSecurityGroup /></Fresh>} />
      <Route path="security-groups/:id" element={<Fresh><SecurityGroupDetail /></Fresh>} />
      <Route path="security-groups/:id/edit/:dir" element={<Fresh><EditRules /></Fresh>} />
      <Route path="elastic-ips" element={<ElasticIps />} />
      <Route path="placement-groups" element={<PlacementGroups />} />
      <Route path="key-pairs" element={<KeyPairs />} />
      <Route path="network-interfaces" element={<NetworkInterfaces />} />
      <Route path="load-balancers" element={<LoadBalancers />} />
      <Route path="load-balancers/create/:type" element={<Fresh><CreateLoadBalancer /></Fresh>} />
      <Route path="target-groups" element={<TargetGroups />} />
      <Route path="target-groups/create" element={<Fresh><CreateTargetGroup /></Fresh>} />
      <Route path="auto-scaling-groups" element={<AutoScalingGroups />} />
      <Route path="auto-scaling-groups/create" element={<Fresh><CreateAutoScalingGroup /></Fresh>} />
      <Route path="settings" element={<Settings />} />
      <Route path="unsupported/:feature" element={<Unsupported />} />
      <Route path="*" element={<Navigate to="dashboard" replace />} />
    </Routes>
  );
}
