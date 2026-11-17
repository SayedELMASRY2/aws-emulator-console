import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Select from "@cloudscape-design/components/select";
import Textarea from "@cloudscape-design/components/textarea";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import { useCrumbs } from "../../App";
import { useFlash, ErrorAlert } from "../../common";
import { events, crumbs, useEventBuses } from "./lib";

export default function SendEvents() {
  const nav = useNavigate();
  const flash = useFlash();

  useCrumbs(
    crumbs(
      { text: "Rules", href: "#/events/rules" },
      { text: "Send events" }
    )
  );

  const buses = useEventBuses();
  const [selectedBus, setSelectedBus] = useState<any>({ value: "default", label: "default" });

  useEffect(() => {
    if (buses.data?.length && !selectedBus) {
      setSelectedBus(buses.data[0]);
    }
  }, [buses.data, selectedBus]);

  const [source, setSource] = useState("ecommerce.orders");
  const [detailType, setDetailType] = useState("OrderCreated");
  const [detailJson, setDetailJson] = useState('{\n  "orderId": "ORD-9876",\n  "customer": "Jane Doe",\n  "total": 129.99,\n  "status": "PAID"\n}');

  const [busy, setBusy] = useState(false);
  const [lastEventId, setLastEventId] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const submit = async () => {
    if (!source.trim() || !detailType.trim() || !detailJson.trim()) return;
    setBusy(true);
    setError(null);
    setLastEventId(null);
    try {
      try {
        JSON.parse(detailJson);
      } catch {
        throw new Error("Invalid JSON in event detail payload.");
      }

      const res = await events("PutEvents", {
        Entries: [
          {
            EventBusName: selectedBus?.value || "default",
            Source: source.trim(),
            DetailType: detailType.trim(),
            Detail: detailJson.trim(),
          },
        ],
      });

      const entry = (res.Entries || [])[0];
      if (entry?.EventId) {
        setLastEventId(entry.EventId);
        flash.notify({
          type: "success",
          content: `Event sent successfully. Event ID: ${entry.EventId}.`,
        });
      } else if (entry?.ErrorCode) {
        throw new Error(`${entry.ErrorCode}: ${entry.ErrorMessage || "Failed to send event."}`);
      }
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
          description="Send custom events directly to an Amazon EventBridge event bus to trigger rules."
        >
          Send events
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Event details</Header>}>
          <SpaceBetween size="m">
            <FormField label="Event bus">
              <Select
                selectedOption={selectedBus}
                onChange={e => setSelectedBus(e.detail.selectedOption)}
                options={buses.data || []}
              />
            </FormField>

            <ColumnLayout columns={2}>
              <FormField
                label="Event source"
                description="The service or application that created the event."
                constraintText="Required"
              >
                <Input
                  value={source}
                  placeholder="mycompany.app"
                  onChange={e => setSource(e.detail.value)}
                />
              </FormField>

              <FormField
                label="Detail type"
                description="Identifies the specific event that occurred."
                constraintText="Required"
              >
                <Input
                  value={detailType}
                  placeholder="UserSignup"
                  onChange={e => setDetailType(e.detail.value)}
                />
              </FormField>
            </ColumnLayout>

            <FormField
              label="Event detail"
              description="A valid JSON object representing the event data."
              constraintText="Required"
            >
              <div className="code-editor">
                <Textarea
                  value={detailJson}
                  rows={10}
                  onChange={e => setDetailJson(e.detail.value)}
                />
              </div>
            </FormField>
          </SpaceBetween>
        </Container>

        {lastEventId && (
          <Container header={<Header variant="h2">Delivery result</Header>}>
            <Box color="text-status-success">
              Event dispatched successfully! Event ID: <code>{lastEventId}</code>
            </Box>
          </Container>
        )}

        <ErrorAlert error={error} />

        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={() => nav("/events/rules")}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!source.trim() || !detailType.trim()}
              onClick={submit}
            >
              Send event
            </Button>
          </SpaceBetween>
        </Box>
      </SpaceBetween>
    </ContentLayout>
  );
}
