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
import Table from "@cloudscape-design/components/table";
import Modal from "@cloudscape-design/components/modal";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Badge from "@cloudscape-design/components/badge";
import { useCrumbs } from "../../App";
import { useAsync, useFlash, ErrorAlert, ValueWithLabel, Copyable } from "../../common";
import { sns, crumbs, topicNameFromArn, isFifoTopic, enc } from "./lib";

export default function TopicDetail() {
  const { topicArn = "" } = useParams();
  const nav = useNavigate();
  const flash = useFlash();

  const name = topicNameFromArn(topicArn);
  const isFifo = isFifoTopic(name);

  useCrumbs(
    crumbs(
      { text: "Topics", href: "#/sns/topics" },
      { text: name }
    )
  );

  const topicData = useAsync(async () => {
    const attrRes = await sns("GetTopicAttributes", { TopicArn: topicArn });
    return attrRes.Attributes || {};
  }, [topicArn]);

  const subsData = useAsync(async () => {
    try {
      const res = await sns("ListSubscriptionsByTopic", { TopicArn: topicArn });
      return res.Subscriptions || [];
    } catch {
      return [];
    }
  }, [topicArn]);

  const attrs = topicData.data || {};

  // Actions state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);

  const [delSubTarget, setDelSubTarget] = useState<any | null>(null);
  const [deletingSub, setDeletingSub] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const handleDeleteTopic = async () => {
    setDeleting(true);
    setError(null);
    try {
      await sns("DeleteTopic", { TopicArn: topicArn });
      flash.notify({ type: "success", content: `Deleted topic ${name}.` });
      nav("/sns/topics");
    } catch (e) {
      setError(e);
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteSub = async () => {
    if (!delSubTarget) return;
    setDeletingSub(true);
    setError(null);
    try {
      if (delSubTarget.SubscriptionArn && delSubTarget.SubscriptionArn !== "PendingConfirmation") {
        await sns("Unsubscribe", { SubscriptionArn: delSubTarget.SubscriptionArn });
      }
      flash.notify({ type: "success", content: `Removed subscription for ${delSubTarget.Endpoint}.` });
      setDelSubTarget(null);
      subsData.reload();
      topicData.reload();
    } catch (e) {
      setError(e);
    } finally {
      setDeletingSub(false);
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
                href={`#/sns/topics/${enc(topicArn)}/publish`}
              >
                Publish message
              </Button>
              <Button
                href={`#/sns/subscriptions/create?topicArn=${enc(topicArn)}`}
              >
                Create subscription
              </Button>
              <ButtonDropdown
                items={[{ id: "delete", text: "Delete topic" }]}
                onItemClick={e => {
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
          {name}
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Topic details</Header>}>
          <ColumnLayout columns={4} variant="text-grid">
            <ValueWithLabel label="Type">{isFifo ? "FIFO" : "Standard"}</ValueWithLabel>
            <ValueWithLabel label="Display name">{attrs.DisplayName || "-"}</ValueWithLabel>
            <ValueWithLabel label="Subscriptions confirmed">
              {attrs.SubscriptionsConfirmed ?? "0"}
            </ValueWithLabel>
            <ValueWithLabel label="Subscriptions pending">
              {attrs.SubscriptionsPending ?? "0"}
            </ValueWithLabel>
            <ValueWithLabel label="Topic ARN">
              {topicArn ? <Copyable text={topicArn} /> : "-"}
            </ValueWithLabel>
            <ValueWithLabel label="Owner">{attrs.Owner || "000000000000"}</ValueWithLabel>
          </ColumnLayout>
        </Container>

        <Tabs
          tabs={[
            {
              id: "subscriptions",
              label: `Subscriptions (${subsData.data?.length ?? 0})`,
              content: (
                <Table
                  items={subsData.data || []}
                  loading={subsData.loading}
                  columnDefinitions={[
                    {
                      id: "protocol",
                      header: "Protocol",
                      cell: (s: any) => <b>{s.Protocol}</b>,
                    },
                    {
                      id: "endpoint",
                      header: "Endpoint",
                      cell: (s: any) => <code>{s.Endpoint}</code>,
                    },
                    {
                      id: "status",
                      header: "Status",
                      cell: (s: any) =>
                        s.SubscriptionArn === "PendingConfirmation" ? (
                          <Badge color="grey">Pending confirmation</Badge>
                        ) : (
                          <Badge color="green">Confirmed</Badge>
                        ),
                    },
                    {
                      id: "arn",
                      header: "Subscription ARN",
                      cell: (s: any) => (
                        <SpaceBetween direction="horizontal" size="xxs">
                          <span>{s.SubscriptionArn.slice(0, 24)}...</span>
                          <Copyable text={s.SubscriptionArn} iconOnly />
                        </SpaceBetween>
                      ),
                    },
                    {
                      id: "actions",
                      header: "Actions",
                      cell: (s: any) => (
                        <Button
                          variant="inline-link"
                          onClick={() => setDelSubTarget(s)}
                        >
                          Delete
                        </Button>
                      ),
                    },
                  ]}
                  empty={
                    <Box textAlign="center" color="inherit">
                      <b>No subscriptions</b>
                      <Box variant="p" color="text-body-secondary">
                        Create a subscription to receive messages published to this topic.
                      </Box>
                    </Box>
                  }
                />
              ),
            },
            {
              id: "policy",
              label: "Access policy",
              content: (
                <Container header={<Header variant="h2">Topic access policy</Header>}>
                  <div
                    style={{
                      background: "#f2f3f3",
                      padding: "12px",
                      borderRadius: "4px",
                      fontFamily: "monospace",
                      fontSize: "12px",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {attrs.Policy ? JSON.stringify(JSON.parse(attrs.Policy), null, 2) : "Default allow policy"}
                  </div>
                </Container>
              ),
            },
          ]}
        />

        {/* Delete Subscription Modal */}
        {delSubTarget && (
          <Modal
            visible={true}
            onDismiss={() => setDelSubTarget(null)}
            header="Delete subscription"
            footer={
              <Box float="right">
                <SpaceBetween direction="horizontal" size="xs">
                  <Button variant="link" onClick={() => setDelSubTarget(null)} disabled={deletingSub}>
                    Cancel
                  </Button>
                  <Button variant="primary" loading={deletingSub} onClick={handleDeleteSub}>
                    Delete
                  </Button>
                </SpaceBetween>
              </Box>
            }
          >
            <SpaceBetween size="m">
              <Box>
                Are you sure you want to remove the subscription for endpoint <code>{delSubTarget.Endpoint}</code>?
              </Box>
              <ErrorAlert error={error} />
            </SpaceBetween>
          </Modal>
        )}

        {/* Delete Topic Modal */}
        {deleteOpen && (
          <Modal
            visible={true}
            onDismiss={() => setDeleteOpen(false)}
            header={`Delete topic ${name}`}
            footer={
              <Box float="right">
                <SpaceBetween direction="horizontal" size="xs">
                  <Button variant="link" onClick={() => setDeleteOpen(false)} disabled={deleting}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    loading={deleting}
                    disabled={confirmName !== name}
                    onClick={handleDeleteTopic}
                  >
                    Delete
                  </Button>
                </SpaceBetween>
              </Box>
            }
          >
            <SpaceBetween size="m">
              <Box>
                Are you sure you want to delete topic <b>{name}</b>?
              </Box>
              <FormField label={`To confirm deletion, type "${name}" in the field below:`}>
                <Input
                  value={confirmName}
                  placeholder={name}
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
