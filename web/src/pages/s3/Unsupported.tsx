import { useParams } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import Box from "@cloudscape-design/components/box";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Link from "@cloudscape-design/components/link";
import { useCrumbs } from "../../App";
import { EmulatorNote } from "../../common";

const FEATURES: Record<string, { title: string; what: string; why: string }> = {
  "access-points": { title: "Access Points", what: "Named network endpoints with their own policies, attached to buckets.", why: "Access points are managed through the S3 Control API, which can't reach AWS Emulator." },
  "object-lambda": { title: "Object Lambda Access Points", what: "Transform objects with a Lambda function as they're retrieved.", why: "Needs S3 Control access points, which AWS Emulator doesn't serve." },
  mrap: { title: "Multi-Region Access Points", what: "One global endpoint that routes to buckets in several Regions.", why: "The emulator runs a single Region, and these use the S3 Control API." },
  "access-grants": { title: "Access Grants", what: "Map identities in a directory to S3 datasets.", why: "Access Grants use the S3 Control API, which can't reach AWS Emulator." },
  "access-analyzer": { title: "IAM Access Analyzer for S3", what: "Findings about buckets shared outside your account.", why: "The emulator doesn't evaluate IAM or resource policies, so there's nothing to analyze." },
  "batch-operations": { title: "Batch Operations", what: "Run one operation across billions of objects from a manifest.", why: "Batch Operations jobs use the S3 Control API, which can't reach AWS Emulator. Use the Objects tab actions (copy, move, edit) on selections instead." },
  "storage-lens": { title: "Storage Lens dashboards", what: "Organization-wide storage usage and activity metrics.", why: "Storage Lens uses the S3 Control API. The bucket Metrics tab and the account snapshot on the bucket list compute similar numbers live." },
  "storage-lens-groups": { title: "Storage Lens groups", what: "Custom object groupings for Storage Lens.", why: "Storage Lens uses the S3 Control API, which can't reach AWS Emulator." },
  "table-buckets": { title: "Table buckets", what: "Buckets optimized for Apache Iceberg tables (S3 Tables).", why: "S3 Tables isn't covered by this console yet. Try it from the API Explorer to see if the emulator supports it." },
  "vector-buckets": { title: "Vector buckets", what: "Buckets for storing and querying vector embeddings (S3 Vectors).", why: "S3 Vectors isn't covered by this console yet. Try it from the API Explorer to see if the emulator supports it." },
};

export default function Unsupported() {
  const { feature = "" } = useParams();
  const f = FEATURES[feature] || { title: feature, what: "", why: "This feature isn't available in AWS Emulator." };
  useCrumbs([{ text: "Amazon S3", href: "#/s3/buckets" }, { text: f.title, href: "#" }]);
  return (
    <ContentLayout header={<Header variant="h1" description={f.what}>{f.title}</Header>}>
      <Container>
        <SpaceBetween size="m">
          <EmulatorNote>{f.why}</EmulatorNote>
          <Box>Back to <Link href="#/s3/buckets">General purpose buckets</Link>, or try any operation in the <Link href="/legacy/#/explorer" external>API Explorer</Link>.</Box>
        </SpaceBetween>
      </Container>
    </ContentLayout>
  );
}
