import { useState, useEffect } from "react";
import Link from "@cloudscape-design/components/link";
import Modal from "@cloudscape-design/components/modal";
import Box from "@cloudscape-design/components/box";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Button from "@cloudscape-design/components/button";
import Select from "@cloudscape-design/components/select";
import FormField from "@cloudscape-design/components/form-field";
import { ResourcePage, type Col, type Action } from "../ec2/ResourcePage";
import { useCrumbs } from "../../App";
import { useFlash, ErrorAlert, EmulatorNote } from "../../common";
import { events, crumbs, St, useEventBuses, enc } from "./lib";

export interface RuleRow {
  Name: string;
  Arn: string;
  EventPattern?: string;
  ScheduleExpression?: string;
  State?: string;
  Description?: string;
  EventBusName?: string;
}

export default function Rules() {
  useCrumbs(crumbs({ text: "Rules" }));
  const flash = useFlash();

  const buses = useEventBuses();
  const [selectedBus, setSelectedBus] = useState<any>({ value: "default", label: "default" });

  useEffect(() => {
    if (buses.data?.length && !selectedBus) {
      setSelectedBus(buses.data[0]);
    }
  }, [buses.data, selectedBus]);

  const [deleteTarget, setDeleteTarget] = useState<RuleRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const loadRules = async (): Promise<RuleRow[]> => {
    const busName = selectedBus?.value || "default";
    const res = await events("ListRules", { EventBusName: busName });
    return (res.Rules || []).map((r: any) => ({
      ...r,
      EventBusName: busName,
    }));
  };

  const columns: Col<RuleRow>[] = [
    {
      id: "name",
      header: "Rule name",
      cell: r => <b>{r.Name}</b>,
    },
    {
      id: "status",
      header: "Status",
      cell: r => <St s={r.State} />,
    },
    {
      id: "bus",
      header: "Event bus",
      cell: r => r.EventBusName || "default",
    },
    {
      id: "pattern",
      header: "Schedule or pattern",
      cell: r => (
        <span style={{ fontFamily: "monospace", fontSize: "12px" }}>
          {r.ScheduleExpression || (r.EventPattern && r.EventPattern.length > 50 ? r.EventPattern.slice(0, 50) + "..." : r.EventPattern || "-")}
        </span>
      ),
    },
    {
      id: "desc",
      header: "Description",
      cell: r => r.Description || "-",
    },
  ];

  const actions: Action<RuleRow>[] = [
    {
      id: "enable",
      text: "Enable",
      disabled: sel => sel.length !== 1 || sel[0].State === "ENABLED",
      run: async (sel, reload) => {
        const item = sel[0];
        await events("EnableRule", { Name: item.Name, EventBusName: item.EventBusName });
        flash.notify({ type: "success", content: `Enabled rule ${item.Name}.` });
        reload();
      },
    },
    {
      id: "disable",
      text: "Disable",
      disabled: sel => sel.length !== 1 || sel[0].State === "DISABLED",
      run: async (sel, reload) => {
        const item = sel[0];
        await events("DisableRule", { Name: item.Name, EventBusName: item.EventBusName });
        flash.notify({ type: "success", content: `Disabled rule ${item.Name}.` });
        reload();
      },
    },
    {
      id: "delete",
      text: "Delete",
      disabled: sel => sel.length !== 1,
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
      await events("DeleteRule", {
        Name: deleteTarget.Name,
        EventBusName: deleteTarget.EventBusName,
        Force: true,
      });
      flash.notify({ type: "success", content: `Deleted rule ${deleteTarget.Name}.` });
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
      <ResourcePage<RuleRow>
        title="Rules"
        description="A rule matches incoming events and routes them to targets for processing."
        load={loadRules}
        columns={columns}
        trackBy="Name"
        deps={[selectedBus?.value]}
        create={{ text: "Create rule", href: "#/events/rules/create" }}
        primaryActions={[
          {
            id: "send",
            text: "Send events",
            run: () => {
              window.location.hash = "#/events/send-events";
            },
          },
        ]}
        actions={actions}
        multi={false}
        banner={
          <EmulatorNote>
            The emulator evaluates event patterns and invokes matching targets locally. Custom events sent via PutEvents are matched against active rules in real time.
          </EmulatorNote>
        }
      />

      {deleteTarget && (
        <Modal
          visible={true}
          onDismiss={() => setDeleteTarget(null)}
          header={`Delete rule: ${deleteTarget.Name}`}
          footer={
            <Box float="right">
              <SpaceBetween direction="horizontal" size="xs">
                <Button variant="link" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                  Cancel
                </Button>
                <Button variant="primary" loading={deleting} onClick={() => handleDelete(() => window.location.reload())}>
                  Delete
                </Button>
              </SpaceBetween>
            </Box>
          }
        >
          <SpaceBetween size="m">
            <Box>
              Are you sure you want to delete rule <b>{deleteTarget.Name}</b> from event bus <b>{deleteTarget.EventBusName}</b>?
            </Box>
            <ErrorAlert error={error} />
          </SpaceBetween>
        </Modal>
      )}
    </>
  );
}
