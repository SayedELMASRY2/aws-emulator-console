import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import Tabs from "@cloudscape-design/components/tabs";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ButtonDropdown from "@cloudscape-design/components/button-dropdown";
import Modal from "@cloudscape-design/components/modal";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Badge from "@cloudscape-design/components/badge";
import { useCrumbs } from "../../App";
import { useAsync, useFlash, ErrorAlert, ValueWithLabel, Copyable, fmtBytes } from "../../common";
import { sqs, crumbs, fmt, fmtDuration, enc } from "./lib";

export default function QueueDetail() {
  const { queueName = "" } = useParams();
  const nav = useNavigate();
  const flash = useFlash();

  useCrumbs(
    crumbs(
      { text: "Queues", href: "#/sqs/queues" },
      { text: queueName }
    )
  );

  const queueData = useAsync(async () => {
    const urlRes = await sqs("GetQueueUrl", { QueueName: queueName });
    const url = urlRes.QueueUrl;
    const attrRes = await sqs("GetQueueAttributes", {
      QueueUrl: url,
      AttributeNames: ["All"],
    });
    return {
      url,
      attributes: attrRes.Attributes || {},
    };
  }, [queueName]);

  const q = queueData.data;
  const attrs = q?.attributes || {};
  const isFifo = queueName.endsWith(".fifo");

  // Actions state
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [purging, setPurging] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const handlePurge = async () => {
    if (!q) return;
    setPurging(true);
    setError(null);
    try {
      await sqs("PurgeQueue", { QueueUrl: q.url });
      flash.notify({ type: "success", content: `Purged all messages from ${queueName}.` });
      setPurgeOpen(false);
      queueData.reload();
    } catch (e) {
      setError(e);
    } finally {
      setPurging(false);
    }
  };

  const handleDelete = async () => {
    if (!q) return;
    setDeleting(true);
    setError(null);
    try {
      await sqs("DeleteQueue", { QueueUrl: q.url });
      flash.notify({ type: "success", content: `Deleted queue ${queueName}.` });
      nav("/sqs/queues");
    } catch (e) {
      setError(e);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          info={isFifo ? <Badge color="blue">FIFO</Badge> : <Badge color="grey">Standard</Badge>}
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button
                variant="primary"
                href={`#/sqs/queues/${enc(queueName)}/send-receive`}
              >
                Send and receive messages
              </Button>
              <ButtonDropdown
                items={[
                  { id: "purge", text: "Purge queue" },
                  { id: "delete", text: "Delete queue" },
                ]}
                onItemClick={e => {
                  if (e.detail.id === "purge") setPurgeOpen(true);
                  if (e.detail.id === "delete") {
                    setConfirmName("");
                    setDeleteOpen(true);
                  }
                }}
              >
                Actions
              </ButtonDropdown>
            </SpaceBetween>
          }
        >
          {queueName}
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Queue overview</Header>}>
          <ColumnLayout columns={4} variant="text-grid">
            <ValueWithLabel label="Type">{isFifo ? "FIFO" : "Standard"}</ValueWithLabel>
            <ValueWithLabel label="Messages available">
              {attrs.ApproximateNumberOfMessages ?? "0"}
            </ValueWithLabel>
            <ValueWithLabel label="Messages in flight">
              {attrs.ApproximateNumberOfMessagesNotVisible ?? "0"}
            </ValueWithLabel>
            <ValueWithLabel label="Messages delayed">
              {attrs.ApproximateNumberOfMessagesDelayed ?? "0"}
            </ValueWithLabel>
            <ValueWithLabel label="Visibility timeout">
              {fmtDuration(attrs.VisibilityTimeout)}
            </ValueWithLabel>
            <ValueWithLabel label="Retention period">
              {fmtDuration(attrs.MessageRetentionPeriod)}
            </ValueWithLabel>
            <ValueWithLabel label="Maximum message size">
              {fmtBytes(Number(attrs.MaximumMessageSize) || 262144)}
            </ValueWithLabel>
            <ValueWithLabel label="Delivery delay">
              {attrs.DelaySeconds ? `${attrs.DelaySeconds} seconds` : "0 seconds"}
            </ValueWithLabel>
            <ValueWithLabel label="Created at">{fmt(attrs.CreatedTimestamp)}</ValueWithLabel>
            <ValueWithLabel label="Queue URL">
              {q?.url ? <Copyable text={q.url} /> : "-"}
            </ValueWithLabel>
            <ValueWithLabel label="Queue ARN">
              {attrs.QueueArn ? <Copyable text={attrs.QueueArn} /> : "-"}
            </ValueWithLabel>
            <ValueWithLabel label="Encryption">
              {attrs.SqsManagedSseEnabled === "true" ? "Enabled (SSE-SQS)" : "Disabled"}
            </ValueWithLabel>
          </ColumnLayout>
        </Container>

        <Tabs
          tabs={[
            {
              id: "config",
              label: "Configuration",
              content: (
                <Container header={<Header variant="h2">Queue settings</Header>}>
                  <ColumnLayout columns={2} variant="text-grid">
                    <ValueWithLabel label="Receive message wait time">
                      {attrs.ReceiveMessageWaitTimeSeconds ? `${attrs.ReceiveMessageWaitTimeSeconds} seconds` : "0 (Short polling)"}
                    </ValueWithLabel>
                    <ValueWithLabel label="Content-based deduplication">
                      {attrs.ContentBasedDeduplication === "true" ? "Enabled" : "Disabled"}
                    </ValueWithLabel>
                    <ValueWithLabel label="Redrive policy (Dead-letter queue)">
                      {attrs.RedrivePolicy ? <code>{attrs.RedrivePolicy}</code> : "None"}
                    </ValueWithLabel>
                  </ColumnLayout>
                </Container>
              ),
            },
            {
              id: "encryption",
              label: "Encryption",
              content: (
                <Container header={<Header variant="h2">Server-side encryption</Header>}>
                  <ColumnLayout columns={2} variant="text-grid">
                    <ValueWithLabel label="Encryption type">
                      Amazon SQS key (SSE-SQS)
                    </ValueWithLabel>
                    <ValueWithLabel label="Status">
                      Enabled
                    </ValueWithLabel>
                  </ColumnLayout>
                </Container>
              ),
            },
          ]}
        />

        {/* Purge Modal */}
        {purgeOpen && (
          <Modal
            visible={true}
            onDismiss={() => setPurgeOpen(false)}
            header={`Purge queue ${queueName}`}
            footer={
              <Box float="right">
                <SpaceBetween direction="horizontal" size="xs">
                  <Button variant="link" onClick={() => setPurgeOpen(false)} disabled={purging}>
                    Cancel
                  </Button>
                  <Button variant="primary" loading={purging} onClick={handlePurge}>
                    Purge
                  </Button>
                </SpaceBetween>
              </Box>
            }
          >
            <SpaceBetween size="m">
              <Box>
                Are you sure you want to purge queue <b>{queueName}</b>?
                All messages in the queue will be deleted.
              </Box>
              <ErrorAlert error={error} />
            </SpaceBetween>
          </Modal>
        )}

        {/* Delete Modal */}
        {deleteOpen && (
          <Modal
            visible={true}
            onDismiss={() => setDeleteOpen(false)}
            header={`Delete queue ${queueName}`}
            footer={
              <Box float="right">
                <SpaceBetween direction="horizontal" size="xs">
                  <Button variant="link" onClick={() => setDeleteOpen(false)} disabled={deleting}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    loading={deleting}
                    disabled={confirmName !== queueName}
                    onClick={handleDelete}
                  >
                    Delete
                  </Button>
                </SpaceBetween>
              </Box>
            }
          >
            <SpaceBetween size="m">
              <Box>
                Are you sure you want to delete queue <b>{queueName}</b>?
              </Box>
              <FormField label={`To confirm deletion, type "${queueName}" in the field below:`}>
                <Input
                  value={confirmName}
                  placeholder={queueName}
                  onChange={e => setConfirmName(e.detail.value)}
                />
              </FormField>
              <ErrorAlert error={error} />
            </SpaceBetween>
          </Modal>
        )}
      </SpaceBetween>
    </ContentLayout>
  );
}
