import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { useCrumbs } from "../../App";
import { EmulatorNote } from "../../common";

export default function AccountBpa() {
  useCrumbs([{ text: "Amazon S3", href: "#/s3/buckets" }, { text: "Block Public Access settings for this account", href: "#" }]);
  return (
    <ContentLayout header={<Header variant="h1" description="Public access is granted to buckets and objects through access control lists (ACLs), bucket policies, access point policies, or all. These settings apply account-wide for all current and future buckets and access points.">Block Public Access settings for this account</Header>}>
      <Container>
        <SpaceBetween size="m">
          <EmulatorNote>Account-level Block Public Access is part of the S3 Control API, which can't reach AWS Emulator. Use each bucket's Permissions tab to set Block Public Access per bucket.</EmulatorNote>
        </SpaceBetween>
      </Container>
    </ContentLayout>
  );
}
