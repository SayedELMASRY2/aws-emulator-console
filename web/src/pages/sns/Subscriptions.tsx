import { useState } from "react";
import Link from "@cloudscape-design/components/link";
import Modal from "@cloudscape-design/components/modal";
import Box from "@cloudscape-design/components/box";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Button from "@cloudscape-design/components/button";
import Badge from "@cloudscape-design/components/badge";
import { ResourcePage, type Col, type Action } from "../ec2/ResourcePage";
import { useCrumbs } from "../../App";
import { useFlash, ErrorAlert, Copyable } from "../../common";
import { sns, crumbs, topicNameFromArn, enc } from "./lib";

export interface SubscriptionRow {
  SubscriptionArn: string;
  Owner?: string;
  Protocol: string;
  Endpoint: string;
  TopicArn: string;
}

export default function Subscriptions() {
  useCrumbs(crumbs({ text: "Subscriptions" }));
  const flash = useFlash();

  const [deleteTarget, setDeleteTarget] = useState<SubscriptionRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const loadSubscriptions = async (): Promise<SubscriptionRow[]> => {
    const res = await sns("ListSubscriptions");
    return res.Subscriptions || [];
  };

  const columns: Col<SubscriptionRow>[] = [
    {
      id: "endpoint",
      header: "Endpoint",
      cell: s => <code>{s.Endpoint}</code>,
    },
    {
      id: "protocol",
      header: "Protocol",
      cell: s => <b>{s.Protocol}</b>,
    },
    {
      id: "status",
      header: "Status",
      cell: s =>
        s.SubscriptionArn === "PendingConfirmation" ? (
          <Badge color="grey">Pending confirmation</Badge>
        ) : (
          <Badge color="green">Confirmed</Badge>
        ),
    },
    {
      id: "topic",
      header: "Topic",
      cell: s => (
        <Link href={`#/sns/topics/${enc(s.TopicArn)}`}>
          {topicNameFromArn(s.TopicArn)}
        </Link>
      ),
    },
    {
      id: "arn",
      header: "Subscription ARN",
      cell: s => (
        <SpaceBetween direction="horizontal" size="xxs">
          <span>{s.SubscriptionArn.slice(0, 24)}...</span>
          {s.SubscriptionArn !== "PendingConfirmation" && (
            <Copyable text={s.SubscriptionArn} iconOnly />
          )}
        </SpaceBetween>
      ),
    },
  ];

  const actions: Action<SubscriptionRow>[] = [
    {
      id: "delete",
      text: "Delete subscription",
      disabled: sel => sel.length !== 1 || sel[0].SubscriptionArn === "PendingConfirmation",
      run: sel => {
        setDeleteTarget(sel[0]);
        setError(null);
      },
    },
  ];

  const handleDelete = async (reload: () => void) => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      await sns("Unsubscribe", { SubscriptionArn: deleteTarget.SubscriptionArn });
      flash.notify({ type: "success", content: `Deleted subscription for ${deleteTarget.Endpoint}.` });
      setDeleteTarget(null);
      reload();
    } catch (e) {
      setError(e);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <ResourcePage<SubscriptionRow>
        title="Subscriptions"
        description="A subscription connects an endpoint to an Amazon SNS topic to receive messages."
        load={loadSubscriptions}
        columns={columns}
        trackBy="SubscriptionArn"
        create={{ text: "Create subscription", href: "#/sns/subscriptions/create" }}
        actions={actions}
        multi={false}
      />

      {deleteTarget && (
        <Modal
          visible={true}
          onDismiss={() => setDeleteTarget(null)}
          header="Delete subscription"
          footer={
            <Box float="right">
              <SpaceBetween direction="horizontal" size="xs">
                <Button variant="link" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  loading={deleting}
                  onClick={() => handleDelete(() => window.location.reload())}
                >
                  Delete
                </Button>
              </SpaceBetween>
            </Box>
          }
        >
          <SpaceBetween size="m">
            <Box>
              Are you sure you want to delete the subscription for endpoint <code>{deleteTarget.Endpoint}</code>?
            </Box>
            <ErrorAlert error={error} />
          </SpaceBetween>
        </Modal>
      )}
    </>
  );
}
