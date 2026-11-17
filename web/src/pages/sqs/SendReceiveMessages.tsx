import { useState } from "react";
import { useParams } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import FormField from "@cloudscape-design/components/form-field";
import Textarea from "@cloudscape-design/components/textarea";
import Input from "@cloudscape-design/components/input";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Table from "@cloudscape-design/components/table";
import Modal from "@cloudscape-design/components/modal";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import { useCrumbs } from "../../App";
import { useAsync, useFlash, ErrorAlert, ValueWithLabel, Copyable, fmtBytes } from "../../common";
import { sqs, crumbs, fmt, enc } from "./lib";

export interface ReceivedMessage {
  MessageId: string;
  ReceiptHandle: string;
  MD5OfBody?: string;
  Body: string;
  Attributes?: Record<string, string>;
}

export default function SendReceiveMessages() {
  const { queueName = "" } = useParams();
  const flash = useFlash();

  useCrumbs(
    crumbs(
      { text: "Queues", href: "#/sqs/queues" },
      { text: queueName, href: `#/sqs/queues/${enc(queueName)}` },
      { text: "Send and receive messages" }
    )
  );

  const urlData = useAsync(async () => {
    const res = await sqs("GetQueueUrl", { QueueName: queueName });
    return res.QueueUrl;
  }, [queueName]);

  const queueUrl = urlData.data;
  const isFifo = queueName.endsWith(".fifo");

  // Send message state
  const [messageBody, setMessageBody] = useState('{\n  "orderId": "ORD-101",\n  "status": "PROCESSED",\n  "amount": 99.50\n}');
  const [delaySec, setDelaySec] = useState("0");
  const [groupId, setGroupId] = useState("group-1");
  const [dedupId, setDedupId] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<unknown>(null);

  // Receive message state
  const [messages, setMessages] = useState<ReceivedMessage[]>([]);
  const [polling, setPolling] = useState(false);
  const [receiveError, setReceiveError] = useState<unknown>(null);

  // Inspect message modal
  const [inspectMsg, setInspectMsg] = useState<ReceivedMessage | null>(null);

  const handleSend = async () => {
    if (!queueUrl || !messageBody.trim()) return;
    setSending(true);
    setSendError(null);
    try {
      const p: Record<string, any> = {
        QueueUrl: queueUrl,
        MessageBody: messageBody.trim(),
        DelaySeconds: parseInt(delaySec, 10) || 0,
      };

      if (isFifo) {
        p.MessageGroupId = groupId.trim() || "default";
        if (dedupId.trim()) p.MessageDeduplicationId = dedupId.trim();
      }

      const res = await sqs("SendMessage", p);
      flash.notify({
        type: "success",
        content: `Message sent successfully. Message ID: ${res.MessageId}.`,
      });
      if (!isFifo) {
        setDedupId("");
      }
    } catch (e) {
      setSendError(e);
    } finally {
      setSending(false);
    }
  };

  const handlePoll = async () => {
    if (!queueUrl) return;
    setPolling(true);
    setReceiveError(null);
    try {
      const res = await sqs("ReceiveMessage", {
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 10,
        VisibilityTimeout: 15,
        AttributeNames: ["All"],
      });
      const received = res.Messages || [];
      setMessages(received);
      if (!received.length) {
        flash.notify({ type: "info", content: "No messages returned from queue." });
      }
    } catch (e) {
      setReceiveError(e);
    } finally {
      setPolling(false);
    }
  };

  const handleDeleteMessage = async (msg: ReceivedMessage) => {
    if (!queueUrl) return;
    try {
      await sqs("DeleteMessage", {
        QueueUrl: queueUrl,
        ReceiptHandle: msg.ReceiptHandle,
      });
      flash.notify({ type: "success", content: `Deleted message ${msg.MessageId.slice(0, 8)}...` });
      setMessages(m => m.filter(x => x.MessageId !== msg.MessageId));
      if (inspectMsg?.MessageId === msg.MessageId) {
        setInspectMsg(null);
      }
    } catch (e) {
      flash.error(e, "Delete message failed");
    }
  };

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          description={`Send test messages and poll the queue ${queueName} to verify message ingestion and payload processing.`}
        >
          Send and receive messages
        </Header>
      }
    >
      <SpaceBetween size="l">
        {/* Send Message Container */}
        <Container header={<Header variant="h2">Send message</Header>}>
          <SpaceBetween size="m">
            <FormField label="Message body" constraintText="Required. Plain text or JSON payload.">
              <div className="code-editor">
                <Textarea
                  value={messageBody}
                  rows={8}
                  onChange={e => setMessageBody(e.detail.value)}
                />
              </div>
            </FormField>

            <ColumnLayout columns={isFifo ? 3 : 2}>
              <FormField label="Delivery delay (seconds)">
                <Input
                  type="number"
                  value={delaySec}
                  onChange={e => setDelaySec(e.detail.value)}
                />
              </FormField>

              {isFifo && (
                <>
                  <FormField label="Message group ID" constraintText="Required for FIFO queues">
                    <Input
                      value={groupId}
                      onChange={e => setGroupId(e.detail.value)}
                    />
                  </FormField>
                  <FormField label="Message deduplication ID" description="Optional if content-based deduplication is on">
                    <Input
                      value={dedupId}
                      onChange={e => setDedupId(e.detail.value)}
                    />
                  </FormField>
                </>
              )}
            </ColumnLayout>

            <ErrorAlert error={sendError} />

            <Box float="right">
              <Button
                variant="primary"
                loading={sending}
                disabled={!messageBody.trim()}
                onClick={handleSend}
              >
                Send message
              </Button>
            </Box>
          </SpaceBetween>
        </Container>

        {/* Receive Messages Container */}
        <Container
          header={
            <Header
              variant="h2"
              actions={
                <Button
                  variant="primary"
                  loading={polling}
                  iconName="refresh"
                  onClick={handlePoll}
                >
                  Poll for messages
                </Button>
              }
            >
              Receive messages ({messages.length})
            </Header>
          }
        >
          <SpaceBetween size="m">
            <ErrorAlert error={receiveError} />

            <Table
              items={messages}
              columnDefinitions={[
                {
                  id: "id",
                  header: "Message ID",
                  cell: m => (
                    <SpaceBetween direction="horizontal" size="xxs">
                      <code>{m.MessageId.slice(0, 12)}...</code>
                      <Copyable text={m.MessageId} iconOnly />
                    </SpaceBetween>
                  ),
                },
                {
                  id: "sent",
                  header: "Sent timestamp",
                  cell: m => fmt(m.Attributes?.SentTimestamp),
                },
                {
                  id: "size",
                  header: "Size",
                  cell: m => fmtBytes(new TextEncoder().encode(m.Body).length),
                },
                {
                  id: "receiveCount",
                  header: "Receive count",
                  cell: m => m.Attributes?.ApproximateReceiveCount || "1",
                },
                {
                  id: "body",
                  header: "Body preview",
                  cell: m => (
                    <span style={{ fontFamily: "monospace", fontSize: "12px" }}>
                      {m.Body.length > 50 ? m.Body.slice(0, 50) + "..." : m.Body}
                    </span>
                  ),
                },
                {
                  id: "actions",
                  header: "Actions",
                  cell: m => (
                    <SpaceBetween direction="horizontal" size="xs">
                      <Button
                        variant="inline-link"
                        onClick={() => setInspectMsg(m)}
                      >
                        Inspect
                      </Button>
                      <Button
                        variant="inline-link"
                        onClick={() => handleDeleteMessage(m)}
                      >
                        Delete
                      </Button>
                    </SpaceBetween>
                  ),
                },
              ]}
              empty={
                <Box textAlign="center" color="inherit">
                  <b>No messages polled yet</b>
                  <Box variant="p" color="text-body-secondary">
                    Choose "Poll for messages" to retrieve available messages from the queue.
                  </Box>
                </Box>
              }
            />
          </SpaceBetween>
        </Container>

        {/* Inspect Message Modal */}
        {inspectMsg && (
          <Modal
            visible={true}
            onDismiss={() => setInspectMsg(null)}
            size="large"
            header={`Message: ${inspectMsg.MessageId}`}
            footer={
              <Box float="right">
                <SpaceBetween direction="horizontal" size="xs">
                  <Button variant="link" onClick={() => setInspectMsg(null)}>
                    Close
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => handleDeleteMessage(inspectMsg)}
                  >
                    Delete message
                  </Button>
                </SpaceBetween>
              </Box>
            }
          >
            <SpaceBetween size="m">
              <ColumnLayout columns={3} variant="text-grid">
                <ValueWithLabel label="Message ID">
                  <Copyable text={inspectMsg.MessageId} />
                </ValueWithLabel>
                <ValueWithLabel label="Sent at">
                  {fmt(inspectMsg.Attributes?.SentTimestamp)}
                </ValueWithLabel>
                <ValueWithLabel label="Receive count">
                  {inspectMsg.Attributes?.ApproximateReceiveCount || "1"}
                </ValueWithLabel>
              </ColumnLayout>

              <FormField label="Full message body">
                <div
                  style={{
                    background: "#f2f3f3",
                    padding: "12px",
                    borderRadius: "4px",
                    fontFamily: "monospace",
                    whiteSpace: "pre-wrap",
                    maxHeight: "300px",
                    overflowY: "auto",
                  }}
                >
                  {inspectMsg.Body}
                </div>
              </FormField>
            </SpaceBetween>
          </Modal>
        )}
      </SpaceBetween>
    </ContentLayout>
  );
}
