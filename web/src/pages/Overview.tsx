import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import Cards from "@cloudscape-design/components/cards";
import Link from "@cloudscape-design/components/link";
import Badge from "@cloudscape-design/components/badge";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import { api } from "../api";
import { useAsync } from "../common";
import { SERVICES } from "../services";
import { useCrumbs } from "../App";

export default function Overview() {
  useCrumbs([]);
  const health = useAsync(() => api.health(), []);
  return (
    <ContentLayout header={<Header variant="h1" description="A local console for AWS Emulator. Everything here runs on your machine.">Console Home</Header>}>
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Emulator</Header>}>
          {health.loading ? <StatusIndicator type="loading">Checking</StatusIndicator>
            : health.data?.up ? <StatusIndicator type="success">Running at {health.data.endpoint} · us-east-1 · account 000000000000</StatusIndicator>
            : <SpaceBetween size="xs"><StatusIndicator type="error">Not running</StatusIndicator><Box>Start it with <Box variant="code">aws-emulator</Box>, or run <Box variant="code">./start.sh</Box>.</Box></SpaceBetween>}
          <Box variant="p" color="text-body-secondary" margin={{ top: "s" }}>
            Resources live in the emulator's memory. Stopping it wipes everything, and a restart begins empty.
          </Box>
        </Container>
        <Cards
          header={<Header variant="h2" counter={`(${SERVICES.length})`} description="Services marked basic still use the first-version pages. They move to full console pages one at a time.">Services</Header>}
          items={SERVICES}
          trackBy="id"
          cardsPerRow={[{ cards: 1 }, { minWidth: 500, cards: 2 }, { minWidth: 900, cards: 3 }]}
          cardDefinition={{
            header: s => <Link href={s.href} fontSize="heading-m">{s.name}</Link>,
            sections: [
              { id: "d", content: s => s.description },
              { id: "g", content: s => <SpaceBetween direction="horizontal" size="xs"><Badge>{s.group}</Badge>{s.legacy ? <Badge color="grey">basic</Badge> : <Badge color="green">full console</Badge>}</SpaceBetween> },
            ],
          }}
        />
      </SpaceBetween>
    </ContentLayout>
  );
}
