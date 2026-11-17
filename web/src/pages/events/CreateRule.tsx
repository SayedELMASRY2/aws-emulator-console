import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Select from "@cloudscape-design/components/select";
import RadioGroup from "@cloudscape-design/components/radio-group";
import Textarea from "@cloudscape-design/components/textarea";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import { useCrumbs } from "../../App";
import { useFlash, ErrorAlert } from "../../common";
import { events, crumbs, useEventBuses } from "./lib";

const SAMPLE_PATTERN = JSON.stringify(
  {
    source: ["ecommerce.orders"],
    "detail-type": ["OrderCreated", "OrderFulfilled"],
  },
  null,
  2
);

export default function CreateRule() {
  const nav = useNavigate();
  const flash = useFlash();

  useCrumbs(
    crumbs(
      { text: "Rules", href: "#/events/rules" },
      { text: "Create rule" }
    )
  );

  const buses = useEventBuses();
  const [selectedBus, setSelectedBus] = useState<any>({ value: "default", label: "default" });

  useEffect(() => {
    if (buses.data?.length && !selectedBus) {
      setSelectedBus(buses.data[0]);
    }
  }, [buses.data, selectedBus]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [ruleType, setRuleType] = useState("pattern");
  const [patternText, setPatternText] = useState(SAMPLE_PATTERN);
  const [scheduleExpr, setScheduleExpr] = useState("rate(5 minutes)");

  // Target
  const [targetArn, setTargetArn] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const p: Record<string, any> = {
        Name: name.trim(),
        EventBusName: selectedBus?.value || "default",
        Description: description.trim() || undefined,
        State: "ENABLED",
      };

      if (ruleType === "pattern") {
        try {
          JSON.parse(patternText);
        } catch {
          throw new Error("Invalid JSON in event pattern editor.");
        }
        p.EventPattern = patternText.trim();
      } else {
        p.ScheduleExpression = scheduleExpr.trim();
      }

      await events("PutRule", p);

      if (targetArn.trim()) {
        await events("PutTargets", {
          Rule: name.trim(),
          EventBusName: selectedBus?.value || "default",
          Targets: [
            {
              Id: "target-1",
              Arn: targetArn.trim(),
            },
          ],
        });
      }

      flash.notify({
        type: "success",
        content: `Created rule ${name} on event bus ${selectedBus?.value || "default"}.`,
      });
      nav("/events/rules");
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
          description="A rule routes incoming events to targets based on an event pattern or schedule."
        >
          Create rule
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Rule details</Header>}>
          <SpaceBetween size="m">
            <FormField
              label="Name"
              description="A unique name for your rule."
              constraintText="Required"
            >
              <Input
                value={name}
                placeholder="order-processing-rule"
                onChange={e => setName(e.detail.value)}
              />
            </FormField>

            <FormField label="Event bus">
              <Select
                selectedOption={selectedBus}
                onChange={e => setSelectedBus(e.detail.selectedOption)}
                options={buses.data || []}
              />
            </FormField>

            <FormField label="Description (optional)">
              <Input
                value={description}
                placeholder="Routes orders to warehouse and notification pipelines"
                onChange={e => setDescription(e.detail.value)}
              />
            </FormField>

            <FormField label="Rule type">
              <RadioGroup
                value={ruleType}
                onChange={e => setRuleType(e.detail.value)}
                items={[
                  {
                    value: "pattern",
                    label: "Rule with an event pattern",
                    description: "Matches events based on source and detail fields.",
                  },
                  {
                    value: "schedule",
                    label: "Schedule",
                    description: "Runs periodically based on a rate or cron expression.",
                  },
                ]}
              />
            </FormField>
          </SpaceBetween>
        </Container>

        {ruleType === "pattern" ? (
          <Container header={<Header variant="h2">Event pattern</Header>}>
            <SpaceBetween size="m">
              <FormField
                label="Event pattern JSON"
                description="Specify the event sources and detail-types that trigger this rule."
              >
                <div className="code-editor">
                  <Textarea
                    value={patternText}
                    rows={8}
                    onChange={e => setPatternText(e.detail.value)}
                  />
                </div>
              </FormField>
            </SpaceBetween>
          </Container>
        ) : (
          <Container header={<Header variant="h2">Schedule</Header>}>
            <FormField
              label="Schedule expression"
              description="e.g. rate(5 minutes) or cron(0 12 * * ? *)"
            >
              <Input
                value={scheduleExpr}
                onChange={e => setScheduleExpr(e.detail.value)}
              />
            </FormField>
          </Container>
        )}

        <Container header={<Header variant="h2">Target (optional)</Header>}>
          <FormField
            label="Target ARN"
            description="ARN of the destination AWS resource (Lambda function, SQS queue, or SNS topic)."
          >
            <Input
              value={targetArn}
              placeholder="arn:aws:lambda:us-east-1:000000000000:function:my-function"
              onChange={e => setTargetArn(e.detail.value)}
            />
          </FormField>
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
              disabled={!name.trim()}
              onClick={submit}
            >
              Create rule
            </Button>
          </SpaceBetween>
        </Box>
      </SpaceBetween>
    </ContentLayout>
  );
}
