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
import ColumnLayout from "@cloudscape-design/components/column-layout";
import { useCrumbs } from "../../App";
import { useFlash, ErrorAlert } from "../../common";
import { sqs, crumbs, enc } from "./lib";

export default function CreateQueue() {
  const nav = useNavigate();
  const flash = useFlash();

  useCrumbs(
    crumbs(
      { text: "Queues", href: "#/sqs/queues" },
      { text: "Create queue" }
    )
  );

  const [queueType, setQueueType] = useState("standard");
  const [name, setName] = useState("");
  const [visibilityTimeout, setVisibilityTimeout] = useState("30");
  const [retentionPeriod, setRetentionPeriod] = useState("345600"); // 4 days
  const [delaySeconds, setDelaySeconds] = useState("0");
  const [maxMessageSize, setMaxMessageSize] = useState("262144"); // 256 KB
  const [receiveWaitTime, setReceiveWaitTime] = useState("0");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async () => {
    let finalName = name.trim();
    if (!finalName) return;
    if (queueType === "fifo" && !finalName.endsWith(".fifo")) {
      finalName += ".fifo";
    }

    setBusy(true);
    setError(null);
    try {
      const attributes: Record<string, string> = {
        VisibilityTimeout: visibilityTimeout,
        MessageRetentionPeriod: retentionPeriod,
        DelaySeconds: delaySeconds,
        MaximumMessageSize: maxMessageSize,
        ReceiveMessageWaitTimeSeconds: receiveWaitTime,
        SqsManagedSseEnabled: "true",
      };

      if (queueType === "fifo") {
        attributes.FifoQueue = "true";
        attributes.ContentBasedDeduplication = "true";
      }

      await sqs("CreateQueue", {
        QueueName: finalName,
        Attributes: attributes,
      });

      flash.notify({
        type: "success",
        content: `Created queue ${finalName}.`,
      });
      nav(`/sqs/queues/${enc(finalName)}`);
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
          description="Create a message queue to decouple application components."
        >
          Create queue
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Type</Header>}>
          <Tiles
            value={queueType}
            onChange={e => setQueueType(e.detail.value)}
            items={[
              {
                value: "standard",
                label: "Standard",
                description: "Unlimited throughput, at-least-once delivery, best-effort message ordering.",
              },
              {
                value: "fifo",
                label: "FIFO",
                description: "First-in, first-out delivery, strictly preserved message ordering, exactly-once processing.",
              },
            ]}
          />
        </Container>

        <Container header={<Header variant="h2">Configuration</Header>}>
          <SpaceBetween size="m">
            <FormField
              label="Name"
              description={
                queueType === "fifo"
                  ? "The name of a FIFO queue must end with the .fifo suffix."
                  : "A unique name for your message queue."
              }
              constraintText="Required"
            >
              <Input
                value={name}
                placeholder={queueType === "fifo" ? "orders-queue.fifo" : "orders-queue"}
                onChange={e => setName(e.detail.value)}
              />
            </FormField>

            <ColumnLayout columns={2}>
              <FormField
                label="Visibility timeout (seconds)"
                description="The length of time that a message received from a queue will be invisible to other receiving components."
              >
                <Input
                  type="number"
                  value={visibilityTimeout}
                  onChange={e => setVisibilityTimeout(e.detail.value)}
                />
              </FormField>

              <FormField
                label="Message retention period (seconds)"
                description="The amount of time Amazon SQS retains a message. Default is 4 days."
              >
                <Input
                  type="number"
                  value={retentionPeriod}
                  onChange={e => setRetentionPeriod(e.detail.value)}
                />
              </FormField>

              <FormField
                label="Delivery delay (seconds)"
                description="The time in seconds that the delivery of all messages in the queue will be delayed."
              >
                <Input
                  type="number"
                  value={delaySeconds}
                  onChange={e => setDelaySeconds(e.detail.value)}
                />
              </FormField>

              <FormField
                label="Receive message wait time (seconds)"
                description="Enables long polling. 0 is short polling; up to 20 seconds."
              >
                <Input
                  type="number"
                  value={receiveWaitTime}
                  onChange={e => setReceiveWaitTime(e.detail.value)}
                />
              </FormField>
            </ColumnLayout>
          </SpaceBetween>
        </Container>

        <Container header={<Header variant="h2">Encryption</Header>}>
          <Box variant="p" color="text-body-secondary">
            Server-side encryption is automatically enabled using Amazon SQS-managed encryption keys (SSE-SQS).
          </Box>
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
              Create queue
            </Button>
          </SpaceBetween>
        </Box>
      </SpaceBetween>
    </ContentLayout>
  );
}
