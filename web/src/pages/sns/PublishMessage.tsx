import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Textarea from "@cloudscape-design/components/textarea";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import { useCrumbs } from "../../App";
import { useFlash, ErrorAlert } from "../../common";
import { sns, crumbs, topicNameFromArn, isFifoTopic, enc } from "./lib";

export default function PublishMessage() {
  const { topicArn = "" } = useParams();
  const nav = useNavigate();
  const flash = useFlash();

  const name = topicNameFromArn(topicArn);
  const isFifo = isFifoTopic(name);

  useCrumbs(
    crumbs(
      { text: "Topics", href: "#/sns/topics" },
      { text: name, href: `#/sns/topics/${enc(topicArn)}` },
      { text: "Publish message" }
    )
  );

  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState('{\n  "event": "ORDER_CREATED",\n  "data": {\n    "id": "1001",\n    "total": 49.99\n  }\n}');
  const [groupId, setGroupId] = useState("group-1");
  const [dedupId, setDedupId] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async () => {
    if (!message.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const p: Record<string, any> = {
        TopicArn: topicArn,
        Message: message.trim(),
      };
      if (subject.trim()) p.Subject = subject.trim();
      if (isFifo) {
        p.MessageGroupId = groupId.trim() || "default";
        if (dedupId.trim()) p.MessageDeduplicationId = dedupId.trim();
      }

      const res = await sns("Publish", p);
      flash.notify({
        type: "success",
        content: `Message published successfully. Message ID: ${res.MessageId}.`,
      });
      nav(`/sns/topics/${enc(topicArn)}`);
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
          description={`Publish a message to topic ${name}. All active subscribers will receive this message.`}
        >
          Publish message
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Message details</Header>}>
          <SpaceBetween size="m">
            <FormField
              label="Subject (optional)"
              description="Included in the subject line of email notifications or message headers."
            >
              <Input
                value={subject}
                placeholder="Order Confirmation"
                onChange={e => setSubject(e.detail.value)}
              />
            </FormField>

            {isFifo && (
              <ColumnLayout columns={2}>
                <FormField label="Message group ID" constraintText="Required for FIFO topics">
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
              </ColumnLayout>
            )}

            <FormField
              label="Message body"
              description="Enter the payload to send to subscribers."
              constraintText="Required"
            >
              <div className="code-editor">
                <Textarea
                  value={message}
                  rows={10}
                  onChange={e => setMessage(e.detail.value)}
                />
              </div>
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
              disabled={!message.trim()}
              onClick={submit}
            >
              Publish message
            </Button>
          </SpaceBetween>
        </Box>
      </SpaceBetween>
    </ContentLayout>
  );
}
