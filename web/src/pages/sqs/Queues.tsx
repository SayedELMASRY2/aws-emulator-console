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
import { useFlash, ErrorAlert, EmulatorNote } from "../../common";
import { sqs, crumbs, queueNameFromUrl, fmt, enc } from "./lib";

export interface QueueRow {
  url: string;
  name: string;
  isFifo: boolean;
  attributes?: Record<string, string>;
}

export default function Queues() {
  useCrumbs(crumbs({ text: "Queues" }));
  const nav = useNavigate();
  const flash = useFlash();

  // Purge modal
  const [purgeTarget, setPurgeTarget] = useState<QueueRow | null>(null);
  const [purging, setPurging] = useState(false);

  // Delete modal
  const [deleteTarget, setDeleteTarget] = useState<QueueRow | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const loadQueues = async (): Promise<QueueRow[]> => {
    const res = await sqs("ListQueues");
    const urls: string[] = res.QueueUrls || [];
    if (!urls.length) return [];

    const details = await Promise.all(
      urls.map(async url => {
        const name = queueNameFromUrl(url);
        const isFifo = name.endsWith(".fifo");
        try {
          const attrRes = await sqs("GetQueueAttributes", {
            QueueUrl: url,
            AttributeNames: ["All"],
          });
          return {
            url,
            name,
            isFifo,
            attributes: attrRes.Attributes || {},
          };
        } catch {
          return { url, name, isFifo };
        }
      })
    );
    return details;
  };

  const columns: Col<QueueRow>[] = [
    {
      id: "name",
      header: "Name",
      cell: q => (
        <Link href={`#/sqs/queues/${enc(q.name)}`}>
          <b>{q.name}</b>
        </Link>
      ),
    },
    {
      id: "type",
      header: "Type",
      cell: q => (q.isFifo ? <Badge color="blue">FIFO</Badge> : <Badge color="grey">Standard</Badge>),
    },
    {
      id: "created",
      header: "Created",
      cell: q => fmt(q.attributes?.CreatedTimestamp),
    },
    {
      id: "messages",
      header: "Messages available",
      cell: q => q.attributes?.ApproximateNumberOfMessages ?? "0",
    },
    {
      id: "inflight",
      header: "Messages in flight",
      cell: q => q.attributes?.ApproximateNumberOfMessagesNotVisible ?? "0",
    },
    {
      id: "delayed",
      header: "Messages delayed",
      cell: q => q.attributes?.ApproximateNumberOfMessagesDelayed ?? "0",
    },
  ];

  const actions: Action<QueueRow>[] = [
    {
      id: "send-receive",
      text: "Send and receive messages",
      disabled: sel => sel.length !== 1,
      run: sel => {
        nav(`/sqs/queues/${enc(sel[0].name)}/send-receive`);
      },
    },
    {
      id: "purge",
      text: "Purge",
      disabled: sel => sel.length !== 1,
      run: sel => {
        setPurgeTarget(sel[0]);
        setError(null);
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

  const handlePurge = async (reload: () => void) => {
    if (!purgeTarget) return;
    setPurging(true);
    setError(null);
    try {
      await sqs("PurgeQueue", { QueueUrl: purgeTarget.url });
      flash.notify({ type: "success", content: `Purged all messages from queue ${purgeTarget.name}.` });
      setPurgeTarget(null);
      reload();
    } catch (e) {
      setError(e);
    } finally {
      setPurging(false);
    }
  };

  const handleDelete = async (reload: () => void) => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      await sqs("DeleteQueue", { QueueUrl: deleteTarget.url });
      flash.notify({ type: "success", content: `Deleted queue ${deleteTarget.name}.` });
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
      <ResourcePage<QueueRow>
        title="Queues"
        description="Amazon Simple Queue Service (SQS) offers a secure, durable, and available hosted queue that lets you integrate and decouple distributed software systems and components."
        load={loadQueues}
        columns={columns}
        trackBy="url"
        create={{ text: "Create queue", href: "#/sqs/queues/create" }}
        actions={actions}
        multi={false}
        banner={
          <EmulatorNote>
            The emulator executes local message queues. Messages sent to SQS queues are stored locally and support polling, visibility timeouts, and immediate message receipt.
          </EmulatorNote>
        }
      />

      {/* Purge Modal */}
      {purgeTarget && (
        <Modal
          visible={true}
          onDismiss={() => setPurgeTarget(null)}
          header={`Purge queue ${purgeTarget.name}`}
          footer={
            <Box float="right">
              <SpaceBetween direction="horizontal" size="xs">
                <Button variant="link" onClick={() => setPurgeTarget(null)} disabled={purging}>
                  Cancel
                </Button>
                <Button variant="primary" loading={purging} onClick={() => handlePurge(() => window.location.reload())}>
                  Purge
                </Button>
              </SpaceBetween>
            </Box>
          }
        >
          <SpaceBetween size="m">
            <Box>
              Are you sure you want to purge queue <b>{purgeTarget.name}</b>?
              All messages currently in the queue will be permanently deleted.
            </Box>
            <ErrorAlert error={error} />
          </SpaceBetween>
        </Modal>
      )}

      {/* Delete Modal */}
      {deleteTarget && (
        <Modal
          visible={true}
          onDismiss={() => setDeleteTarget(null)}
          header={`Delete queue ${deleteTarget.name}`}
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
              Are you sure you want to delete queue <b>{deleteTarget.name}</b>?
              Any messages stored in this queue will also be deleted.
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
