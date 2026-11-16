import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Button from "@cloudscape-design/components/button";
import Link from "@cloudscape-design/components/link";
import Box from "@cloudscape-design/components/box";
import { useCrumbs } from "../../App";
import { useAsync } from "../../common";
import { ec2, elb, asg, allInstances } from "./lib";

export default function Dashboard() {
  useCrumbs([{ text: "EC2", href: "#/ec2/dashboard" }, { text: "Dashboard", href: "#" }]);
  const d = useAsync(async () => {
    const safe = (p: Promise<number>) => p.catch(() => NaN);
    const [inst, kp, sg, vol, snap, eip, lb, tg, g, lt, pg, eni] = await Promise.all([
      safe(allInstances().then(l => l.filter(i => i.State?.Name !== "terminated").length)),
      safe(ec2("DescribeKeyPairs").then(r => r.KeyPairs.length)), safe(ec2("DescribeSecurityGroups").then(r => r.SecurityGroups.length)),
      safe(ec2("DescribeVolumes").then(r => r.Volumes.length)), safe(ec2("DescribeSnapshots", { OwnerIds: ["self"] }).then(r => r.Snapshots.length)),
      safe(ec2("DescribeAddresses").then(r => r.Addresses.length)), safe(elb("DescribeLoadBalancers").then(r => r.LoadBalancers.length)),
      safe(elb("DescribeTargetGroups").then(r => r.TargetGroups.length)), safe(asg("DescribeAutoScalingGroups").then(r => r.AutoScalingGroups.length)),
      safe(ec2("DescribeLaunchTemplates").then(r => r.LaunchTemplates.length)), safe(ec2("DescribePlacementGroups").then(r => r.PlacementGroups.length)),
      safe(ec2("DescribeNetworkInterfaces").then(r => r.NetworkInterfaces.length)),
    ]);
    return [["Instances (running/stopped)", inst, "instances"], ["Auto Scaling Groups", g, "auto-scaling-groups"], ["Elastic IPs", eip, "elastic-ips"], ["Key pairs", kp, "key-pairs"],
      ["Load balancers", lb, "load-balancers"], ["Target groups", tg, "target-groups"], ["Launch templates", lt, "launch-templates"], ["Placement groups", pg, "placement-groups"],
      ["Security groups", sg, "security-groups"], ["Snapshots", snap, "snapshots"], ["Volumes", vol, "volumes"], ["Network interfaces", eni, "network-interfaces"]] as [string, number, string][];
  }, []);
  return (
    <ContentLayout header={<Header variant="h1">EC2 Dashboard</Header>}>
      <SpaceBetween size="l">
        <Container header={<Header variant="h2" description="You are using the following Amazon EC2 resources in the US East (N. Virginia) Region." actions={<Button iconName="refresh" ariaLabel="Refresh" onClick={() => d.reload()} />}>Resources</Header>}>
          <ColumnLayout columns={4} variant="text-grid">
            {(d.data || []).map(([label, n, path]) => <div key={path}><Box variant="awsui-key-label">{label}</Box><Link href={`#/ec2/${path}`} fontSize="display-l">{isNaN(n) ? "-" : String(n)}</Link></div>)}
          </ColumnLayout>
        </Container>
        <Container header={<Header variant="h2" description="To get started, launch an Amazon EC2 instance, which is a virtual server in the cloud.">Launch instance</Header>}>
          <Button variant="primary" href="#/ec2/launch">Launch instance</Button>
        </Container>
      </SpaceBetween>
    </ContentLayout>
  );
}
