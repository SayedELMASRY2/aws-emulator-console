import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Select from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import { useCrumbs } from "../../App";
import { useAsync, useFlash, ErrorAlert } from "../../common";
import { sns, crumbs, PROTOCOLS, topicNameFromArn, enc } from "./lib";

export default function CreateSubscription() {
  const [params] = useSearchParams();
  const preTopicArn = params.get("topicArn") || "";
  const nav = useNavigate();
  const flash = useFlash();

  useCrumbs(
    crumbs(
      { text: "Subscriptions", href: "#/sns/subscriptions" },
      { text: "Create subscription" }
    )
  );

  const topicsData = useAsync(async () => {
    const res = await sns("ListTopics");
    return (res.Topics || []).map((t: any) => ({
      value: t.TopicArn,
      label: `${topicNameFromArn(t.TopicArn)} (${t.TopicArn})`,
    }));
  });

  const [selectedTopic, setSelectedTopic] = useState<any | null>(null);
  const [protocol, setProtocol] = useState(PROTOCOLS[0]);
  const [endpoint, setEndpoint] = useState("");

  useEffect(() => {
    if (preTopicArn) {
      setSelectedTopic({
        value: preTopicArn,
        label: `${topicNameFromArn(preTopicArn)} (${preTopicArn})`,
      });
    } else if (topicsData.data?.length && !selectedTopic) {
      setSelectedTopic(topicsData.data[0]);
    }
  }, [preTopicArn, topicsData.data, selectedTopic]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async () => {
    if (!selectedTopic?.value || !endpoint.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await sns("Subscribe", {
        TopicArn: selectedTopic.value,
        Protocol: protocol.value,
        Endpoint: endpoint.trim(),
      });

      flash.notify({
        type: "success",
        content: `Created subscription for ${endpoint}.`,
      });
      nav(`/sns/topics/${enc(selectedTopic.value)}`);
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
          description="Subscribe an endpoint to an Amazon SNS topic to receive messages."
        >
          Create subscription
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Details</Header>}>
          <SpaceBetween size="m">
            <FormField
              label="Topic ARN"
              description="The topic to subscribe to."
              constraintText="Required"
            >
              <Select
                selectedOption={selectedTopic}
                onChange={e => setSelectedTopic(e.detail.selectedOption)}
                options={topicsData.data || []}
                placeholder="Select an SNS topic"
                loadingText="Loading topics..."
                empty="No SNS topics found"
              />
            </FormField>

            <FormField label="Protocol">
              <Select
                selectedOption={protocol}
                onChange={e => setProtocol(e.detail.selectedOption as any)}
                options={PROTOCOLS}
              />
            </FormField>

            <FormField
              label="Endpoint"
              description={
                protocol.value === "email"
                  ? "Email address (e.g. user@example.com)"
                  : protocol.value === "sqs"
                  ? "SQS queue ARN or URL"
                  : protocol.value === "lambda"
                  ? "Lambda function ARN"
                  : "HTTP/HTTPS endpoint URL"
              }
              constraintText="Required"
            >
              <Input
                value={endpoint}
                placeholder={protocol.value === "email" ? "dev@example.com" : "arn:aws:..."}
                onChange={e => setEndpoint(e.detail.value)}
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
              disabled={!selectedTopic?.value || !endpoint.trim()}
              onClick={submit}
            >
              Create subscription
            </Button>
          </SpaceBetween>
        </Box>
      </SpaceBetween>
    </ContentLayout>
  );
}
