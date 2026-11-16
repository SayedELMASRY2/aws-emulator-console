import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import FormField from "@cloudscape-design/components/form-field";
import Textarea from "@cloudscape-design/components/textarea";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import SegmentedControl from "@cloudscape-design/components/segmented-control";
import { useCrumbs } from "../../App";
import { useAsync, useFlash, ErrorAlert } from "../../common";
import { ecr, crumbs, enc } from "./lib";

const DEFAULT_POLICY = {
  rules: [
    {
      rulePriority: 1,
      description: "Expire untagged images older than 14 days",
      selection: {
        tagStatus: "untagged",
        countType: "sinceImagePushed",
        countUnit: "days",
        countNumber: 14,
      },
      action: {
        type: "expire",
      },
    },
    {
      rulePriority: 2,
      description: "Keep last 30 tagged images",
      selection: {
        tagStatus: "any",
        countType: "imageCountMoreThan",
        countNumber: 30,
      },
      action: {
        type: "expire",
      },
    },
  ],
};

export default function EditLifecyclePolicy() {
  const { repo = "" } = useParams();
  const nav = useNavigate();
  const flash = useFlash();

  useCrumbs(
    crumbs(
      { text: "Repositories", href: "#/ecr/repositories" },
      { text: repo, href: `#/ecr/repositories/${enc(repo)}` },
      { text: "Lifecycle policy" }
    )
  );

  const existing = useAsync(async () => {
    try {
      const res = await ecr("GetLifecyclePolicy", { repositoryName: repo });
      return res.lifecyclePolicyText;
    } catch {
      return null;
    }
  }, [repo]);

  const [policyText, setPolicyText] = useState(JSON.stringify(DEFAULT_POLICY, null, 2));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (existing.data) {
      try {
        setPolicyText(JSON.stringify(JSON.parse(existing.data), null, 2));
      } catch {
        setPolicyText(existing.data);
      }
    }
  }, [existing.data]);

  const setPreset = (preset: string) => {
    if (preset === "keep-10") {
      setPolicyText(
        JSON.stringify(
          {
            rules: [
              {
                rulePriority: 1,
                description: "Keep only last 10 images",
                selection: {
                  tagStatus: "any",
                  countType: "imageCountMoreThan",
                  countNumber: 10,
                },
                action: { type: "expire" },
              },
            ],
          },
          null,
          2
        )
      );
    } else if (preset === "expire-untagged") {
      setPolicyText(
        JSON.stringify(
          {
            rules: [
              {
                rulePriority: 1,
                description: "Expire untagged images older than 7 days",
                selection: {
                  tagStatus: "untagged",
                  countType: "sinceImagePushed",
                  countUnit: "days",
                  countNumber: 7,
                },
                action: { type: "expire" },
              },
            ],
          },
          null,
          2
        )
      );
    }
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      let parsed: any;
      try {
        parsed = JSON.parse(policyText);
      } catch {
        throw new Error("Invalid JSON in lifecycle policy editor.");
      }

      await ecr("PutLifecyclePolicy", {
        repositoryName: repo,
        lifecyclePolicyText: JSON.stringify(parsed),
      });

      flash.notify({
        type: "success",
        content: `Updated lifecycle policy for ${repo}.`,
      });
      nav(`/ecr/repositories/${enc(repo)}`);
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
          description={`Configure automated image retention and expiration rules for ${repo}.`}
        >
          Lifecycle policy
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Presets</Header>}>
          <SpaceBetween size="s">
            <Box variant="p" color="text-body-secondary">
              Load a recommended lifecycle policy template:
            </Box>
            <SpaceBetween direction="horizontal" size="xs">
              <Button onClick={() => setPreset("expire-untagged")}>
                Expire untagged images (7 days)
              </Button>
              <Button onClick={() => setPreset("keep-10")}>
                Keep last 10 images
              </Button>
            </SpaceBetween>
          </SpaceBetween>
        </Container>

        <Container header={<Header variant="h2">Policy document (JSON)</Header>}>
          <SpaceBetween size="m">
            <FormField
              label="Lifecycle policy JSON"
              description="Specify rules with priority, match criteria, and expire actions."
            >
              <div className="code-editor">
                <Textarea
                  value={policyText}
                  rows={18}
                  onChange={e => setPolicyText(e.detail.value)}
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
            <Button variant="primary" loading={busy} onClick={submit}>
              Save policy
            </Button>
          </SpaceBetween>
        </Box>
      </SpaceBetween>
    </ContentLayout>
  );
}
