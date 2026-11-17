import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Tiles from "@cloudscape-design/components/tiles";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import { useCrumbs } from "../../App";
import { useFlash, ErrorAlert } from "../../common";
import { sns, crumbs, enc } from "./lib";

export default function CreateTopic() {
  const nav = useNavigate();
  const flash = useFlash();

  useCrumbs(
    crumbs(
      { text: "Topics", href: "#/sns/topics" },
      { text: "Create topic" }
    )
  );

  const [topicType, setTopicType] = useState("standard");
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async () => {
    let finalName = name.trim();
    if (!finalName) return;
    if (topicType === "fifo" && !finalName.endsWith(".fifo")) {
      finalName += ".fifo";
    }

    setBusy(true);
    setError(null);
    try {
      const attributes: Record<string, string> = {};
      if (displayName.trim()) attributes.DisplayName = displayName.trim();
      if (topicType === "fifo") {
        attributes.FifoTopic = "true";
        attributes.ContentBasedDeduplication = "true";
      }

      const res = await sns("CreateTopic", {
        Name: finalName,
        Attributes: Object.keys(attributes).length ? attributes : undefined,
      });

      flash.notify({
        type: "success",
        content: `Created topic ${finalName}.`,
      });
      nav(`/sns/topics/${enc(res.TopicArn)}`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          description="Create a communication channel to send messages to subscribing endpoints."
        >
          Create topic
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Type</Header>}>
          <Tiles
            value={topicType}
            onChange={e => setTopicType(e.detail.value)}
            items={[
              {
                value: "standard",
                label: "Standard",
                description: "Best-effort message ordering, at-least-once message delivery, highest throughput.",
              },
              {
                value: "fifo",
                label: "FIFO",
                description: "Strictly-preserved message ordering, exactly-once message delivery, deduplication.",
              },
            ]}
          />
        </Container>

        <Container header={<Header variant="h2">Details</Header>}>
          <SpaceBetween size="m">
            <FormField
              label="Name"
              description={
                topicType === "fifo"
                  ? "For FIFO topics, the name must end with the .fifo suffix."
                  : "A unique name for your topic."
              }
              constraintText="Required"
            >
              <Input
                value={name}
                placeholder={topicType === "fifo" ? "alerts-topic.fifo" : "alerts-topic"}
                onChange={e => setName(e.detail.value)}
              />
            </FormField>

            <FormField
              label="Display name (optional)"
              description="The display name is included when sending SMS and email messages."
            >
              <Input
                value={displayName}
                placeholder="Alerts"
                onChange={e => setDisplayName(e.detail.value)}
              />
            </FormField>
          </SpaceBetween>
        </Container>

        <ErrorAlert error={error} />

        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={() => nav(-1)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!name.trim()}
              onClick={submit}
            >
              Create topic
            </Button>
          </SpaceBetween>
        </Box>
      </SpaceBetween>
    </ContentLayout>
  );
}
