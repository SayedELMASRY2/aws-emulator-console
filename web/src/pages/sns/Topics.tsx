import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Link from "@cloudscape-design/components/link";
import Modal from "@cloudscape-design/components/modal";
import Box from "@cloudscape-design/components/box";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Button from "@cloudscape-design/components/button";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Badge from "@cloudscape-design/components/badge";
import { ResourcePage, type Col, type Action } from "../ec2/ResourcePage";
import { useCrumbs } from "../../App";
import { useFlash, ErrorAlert, EmulatorNote, Copyable } from "../../common";
import { sns, crumbs, topicNameFromArn, isFifoTopic, enc } from "./lib";

export interface TopicRow {
  TopicArn: string;
  name: string;
  isFifo: boolean;
  attributes?: Record<string, string>;
}

export default function Topics() {
  useCrumbs(crumbs({ text: "Topics" }));
  const nav = useNavigate();
  const flash = useFlash();

  const [deleteTarget, setDeleteTarget] = useState<TopicRow | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const loadTopics = async (): Promise<TopicRow[]> => {
    const res = await sns("ListTopics");
    const list = res.Topics || [];
    if (!list.length) return [];

    const details = await Promise.all(
      list.map(async (t: any) => {
        const arn = t.TopicArn;
        const name = topicNameFromArn(arn);
        const isFifo = isFifoTopic(name);
        try {
          const attrRes = await sns("GetTopicAttributes", { TopicArn: arn });
          return {
            TopicArn: arn,
            name,
            isFifo,
            attributes: attrRes.Attributes || {},
          };
        } catch {
          return { TopicArn: arn, name, isFifo };
        }
      })
    );
    return details;
  };

  const columns: Col<TopicRow>[] = [
    {
      id: "name",
      header: "Name",
      cell: t => (
        <Link href={`#/sns/topics/${enc(t.TopicArn)}`}>
          <b>{t.name}</b>
        </Link>
      ),
    },
    {
      id: "type",
      header: "Type",
      cell: t => (t.isFifo ? <Badge color="blue">FIFO</Badge> : <Badge color="grey">Standard</Badge>),
    },
    {
      id: "arn",
      header: "Topic ARN",
      cell: t => (
        <SpaceBetween direction="horizontal" size="xxs">
          <code>{t.TopicArn.slice(0, 30)}...</code>
          <Copyable text={t.TopicArn} iconOnly />
        </SpaceBetween>
      ),
    },
    {
      id: "confirmed",
      header: "Subscriptions",
      cell: t => t.attributes?.SubscriptionsConfirmed ?? "0",
    },
  ];

  const actions: Action<TopicRow>[] = [
    {
      id: "publish",
      text: "Publish message",
      disabled: sel => sel.length !== 1,
      run: sel => {
        nav(`/sns/topics/${enc(sel[0].TopicArn)}/publish`);
      },
    },
    {
      id: "delete",
      text: "Delete",
      disabled: sel => sel.length !== 1,
      run: sel => {
        setDeleteTarget(sel[0]);
        setConfirmName("");
        setError(null);
      },
    },
  ];

  const handleDelete = async (reload: () => void) => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      await sns("DeleteTopic", { TopicArn: deleteTarget.TopicArn });
      flash.notify({ type: "success", content: `Deleted topic ${deleteTarget.name}.` });
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
      <ResourcePage<TopicRow>
        title="Topics"
        description="Amazon Simple Notification Service (Amazon SNS) coordinates and manages the delivery or sending of messages to subscribing endpoints or clients."
        load={loadTopics}
        columns={columns}
        trackBy="TopicArn"
        create={{ text: "Create topic", href: "#/sns/topics/create" }}
        actions={actions}
        multi={false}
        banner={
          <EmulatorNote>
            The emulator coordinates publish/subscribe pubsub delivery locally. Published messages fan out immediately to subscribed SQS queues, Lambdas, and webhook endpoints.
          </EmulatorNote>
        }
      />

      {deleteTarget && (
        <Modal
          visible={true}
          onDismiss={() => setDeleteTarget(null)}
          header={`Delete topic ${deleteTarget.name}`}
          footer={
            <Box float="right">
              <SpaceBetween direction="horizontal" size="xs">
                <Button variant="link" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  loading={deleting}
                  disabled={confirmName !== deleteTarget.name}
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
              Are you sure you want to delete topic <b>{deleteTarget.name}</b>?
              All subscriptions attached to this topic will be removed.
            </Box>
            <FormField label={`To confirm deletion, type "${deleteTarget.name}" in the field below:`}>
              <Input
                value={confirmName}
                placeholder={deleteTarget.name}
                onChange={e => setConfirmName(e.detail.value)}
              />
            </FormField>
            <ErrorAlert error={error} />
          </SpaceBetween>
        </Modal>
      )}
    </>
  );
}
