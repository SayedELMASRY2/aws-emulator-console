import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Link from "@cloudscape-design/components/link";
import Cards from "@cloudscape-design/components/cards";
import { useCrumbs } from "../../App";
import { useAsync, EmulatorNote, ACCOUNT, REGION } from "../../common";
import { iam, crumbs } from "./lib";

export default function Dashboard() {
  useCrumbs(crumbs({ text: "Dashboard" }));

  const summary = useAsync(async () => {
    try {
      const res = await iam("GetAccountSummary");
      return res.SummaryMap || {};
    } catch {
      return {};
    }
  });

  const m = summary.data || {};

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          description="AWS Identity and Access Management (IAM) securely manages access to AWS services and resources."
        >
          IAM Dashboard
        </Header>
      }
    >
      <SpaceBetween size="l">
        <EmulatorNote>
          The emulator actively validates IAM trust policies and permissions for workloads executed on your behalf (e.g. AWS Glue ETL jobs, RDS snapshot exports to S3, and Lambda executions).
        </EmulatorNote>

        <Container header={<Header variant="h2">IAM resources</Header>}>
          <ColumnLayout columns={4} variant="text-grid">
            <div>
              <Box variant="awsui-key-label">User groups</Box>
              <Link href="#/iam/user-groups" fontSize="display-l">
                {m.Groups ?? 0}
              </Link>
            </div>
            <div>
              <Box variant="awsui-key-label">Users</Box>
              <Link href="#/iam/users" fontSize="display-l">
                {m.Users ?? 0}
              </Link>
            </div>
            <div>
              <Box variant="awsui-key-label">Roles</Box>
              <Link href="#/iam/roles" fontSize="display-l">
                {m.Roles ?? 0}
              </Link>
            </div>
            <div>
              <Box variant="awsui-key-label">Customer managed policies</Box>
              <Link href="#/iam/policies" fontSize="display-l">
                {m.Policies ?? 0}
              </Link>
            </div>
          </ColumnLayout>
        </Container>

        <Container header={<Header variant="h2">Account details</Header>}>
          <ColumnLayout columns={3} variant="text-grid">
            <div>
              <Box variant="awsui-key-label">AWS Account ID</Box>
              <code>{ACCOUNT}</code>
            </div>
            <div>
              <Box variant="awsui-key-label">Default Region</Box>
              <code>{REGION}</code>
            </div>
            <div>
              <Box variant="awsui-key-label">Access Keys Quota</Box>
              <span>{m.AccessKeysPerUserQuota ?? 2} keys per user</span>
            </div>
          </ColumnLayout>
        </Container>

        <Container header={<Header variant="h2">Quick actions</Header>}>
          <Cards
            items={[
              {
                title: "Roles",
                desc: "An IAM role is an IAM identity that you can create in your account that has specific permissions.",
                href: "#/iam/roles/create",
                cta: "Create role",
              },
              {
                title: "Policies",
                desc: "An IAM policy is an object in AWS that, when associated with an identity or resource, defines its permissions.",
                href: "#/iam/policies/create",
                cta: "Create policy",
              },
              {
                title: "Users",
                desc: "An IAM user represents a human user or workload that requires AWS access credentials.",
                href: "#/iam/users/create",
                cta: "Create user",
              },
            ]}
            cardDefinition={{
              header: item => <Link href={item.href} fontSize="heading-m"><b>{item.title}</b></Link>,
              sections: [
                {
                  id: "body",
                  content: item => (
                    <SpaceBetween size="m">
                      <Box variant="p" color="text-body-secondary">{item.desc}</Box>
                      <Button href={item.href}>{item.cta}</Button>
                    </SpaceBetween>
                  ),
                },
              ],
            }}
          />
        </Container>
      </SpaceBetween>
    </ContentLayout>
  );
}
