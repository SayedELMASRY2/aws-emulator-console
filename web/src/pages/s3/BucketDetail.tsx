import { useParams, useSearchParams } from "react-router-dom";
import Tabs from "@cloudscape-design/components/tabs";
import Header from "@cloudscape-design/components/header";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import Box from "@cloudscape-design/components/box";
import { useCrumbs } from "../../App";
import { EmulatorNote } from "../../common";
import ObjectsTab from "./ObjectsTab";
import PropertiesTab from "./PropertiesTab";
import PermissionsTab from "./PermissionsTab";
import MetricsTab from "./MetricsTab";
import ManagementTab from "./ManagementTab";
import { bucketHref } from "./lib";

export default function BucketDetail() {
  const { bucket = "" } = useParams();
  const [sp, setSp] = useSearchParams();
  const tab = sp.get("tab") || "objects";
  const prefix = sp.get("prefix") || "";
  const parts = prefix.split("/").filter(Boolean);
  useCrumbs([
    { text: "Amazon S3", href: "#/s3/buckets" },
    { text: "Buckets", href: "#/s3/buckets" },
    { text: bucket, href: bucketHref(bucket) },
    ...parts.map((p, i) => ({ text: p + "/", href: bucketHref(bucket, "objects", parts.slice(0, i + 1).join("/") + "/") })),
  ]);
  const setTab = (t: string) => setSp(t === "objects" && prefix ? { tab: t, prefix } : { tab: t });

  return (
    <ContentLayout header={<Header variant="h1" info={<Box color="text-body-secondary" variant="small">General purpose bucket</Box>}>{prefix ? prefix : bucket}</Header>}>
      <Tabs
        activeTabId={tab}
        onChange={e => setTab(e.detail.activeTabId)}
        tabs={[
          { id: "objects", label: "Objects", content: <ObjectsTab bucket={bucket} prefix={prefix} /> },
          { id: "metadata", label: "Metadata", content: (
            <Container header={<Header variant="h2" description="S3 Metadata tables give you queryable object metadata in Apache Iceberg tables.">Metadata configuration</Header>}>
              <EmulatorNote>S3 Metadata uses S3 Tables, which AWS Emulator doesn't provide. Object-level metadata is on each object's page.</EmulatorNote>
            </Container>
          ) },
          { id: "properties", label: "Properties", content: <PropertiesTab bucket={bucket} /> },
          { id: "permissions", label: "Permissions", content: <PermissionsTab bucket={bucket} /> },
          { id: "metrics", label: "Metrics", content: <MetricsTab bucket={bucket} /> },
          { id: "management", label: "Management", content: <ManagementTab bucket={bucket} /> },
          { id: "access-points", label: "Access Points", content: (
            <Container header={<Header variant="h2" counter="(0)" description="Access points are named network endpoints attached to buckets that you can use to perform S3 object operations.">Access Points</Header>}>
              <EmulatorNote>Access points are managed through the S3 Control API, which can't reach AWS Emulator. Use the bucket directly instead.</EmulatorNote>
            </Container>
          ) },
        ]}
      />
    </ContentLayout>
  );
}
