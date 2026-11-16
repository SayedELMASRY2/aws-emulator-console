"use strict";

navGroup("", [{ path: "/", label: "Overview" }]);

const OVERVIEW_COUNTERS = [
  { label: "S3 buckets", path: "/s3", n: async () => (await API.call("s3", "ListBuckets")).Buckets?.length || 0 },
  { label: "DynamoDB tables", path: "/dynamodb", n: async () => (await API.call("dynamodb", "ListTables")).TableNames.length },
  { label: "EC2 instances", path: "/ec2", n: async () => (await API.call("ec2", "DescribeInstances")).Reservations.flatMap(r => r.Instances).filter(i => i.State?.Name !== "terminated").length },
  { label: "Lambda functions", path: "/lambda", n: async () => (await API.call("lambda", "ListFunctions")).Functions.length },
  { label: "ECS clusters", path: "/ecs", n: async () => (await API.call("ecs", "ListClusters")).clusterArns.length },
  { label: "ECR repositories", path: "/ecr", n: async () => (await API.call("ecr", "DescribeRepositories")).repositories.length },
  { label: "EKS clusters", path: "/eks", n: async () => (await API.call("eks", "ListClusters")).clusters.length },
  { label: "MSK (Kafka) clusters", path: "/kafka", n: async () => (await API.call("kafka", "ListClustersV2")).ClusterInfoList.length },
  { label: "RDS instances", path: "/rds", n: async () => (await API.call("rds", "DescribeDBInstances")).DBInstances.length },
  { label: "Glue databases", path: "/glue", n: async () => (await API.call("glue", "GetDatabases")).DatabaseList.length },
  { label: "Glue jobs", path: "/glue", n: async () => (await API.call("glue", "GetJobs")).Jobs.length },
  { label: "SQS queues", path: "/sqs", n: async () => (await API.call("sqs", "ListQueues")).QueueUrls?.length || 0 },
  { label: "SNS topics", path: "/sns", n: async () => (await API.call("sns", "ListTopics")).Topics.length },
  { label: "Kinesis streams", path: "/kinesis", n: async () => (await API.call("kinesis", "ListStreams")).StreamNames.length },
  { label: "Secrets", path: "/secrets", n: async () => (await API.call("secretsmanager", "ListSecrets")).SecretList.length },
  { label: "Step Functions", path: "/stepfunctions", n: async () => (await API.call("stepfunctions", "ListStateMachines")).stateMachines.length },
];

route("/", async () => {
  const health = await API.health().catch(e => ({ up: false, message: e.message }));
  const page = h("div", pageHeader("Overview", "Resources currently in your local AWS Emulator."));
  if (!health.up) {
    page.appendChild(h("div", { class: "panel panel-pad" },
      h("h2", "The emulator isn't running"),
      h("p", { class: "muted" }, "Start it in a terminal, then this page fills in on its own:"),
      codeBlock("EMULATOR_TELEMETRY=off aws-emulator")));
    return page;
  }
  page.appendChild(h("div", { class: "note" },
    "Everything here lives in the emulator's memory. Stopping the emulator wipes it, and a restart begins empty."));
  const grid = h("div", { class: "grid" });
  for (const c of OVERVIEW_COUNTERS) {
    const big = h("div", { class: "big" }, "…");
    grid.appendChild(h("a", { class: "card", href: "#" + c.path }, big, h("div", { class: "lbl" }, c.label)));
    c.n().then(n => (big.textContent = n), e => { big.textContent = "—"; big.title = e.message; });
  }
  page.append(h("div", { class: "section-title" }, "Resources"), grid);

  const env = [
    "E=~/.aws/emulator/9297",
    "export AWS_ENDPOINT_URL=https://127.0.0.1:9297 AWS_SHARED_CREDENTIALS_FILE=$E/emulator_credentials AWS_CONFIG_FILE=$E/config AWS_CA_BUNDLE=$E/ca.pem AWS_EC2_METADATA_DISABLED=true AWS_DISABLE_HOST_PREFIX_INJECTION=true AWS_REGION=us-east-1 AWS_DEFAULT_REGION=us-east-1",
    "unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_PROFILE",
  ].join("\n");
  page.append(h("div", { class: "section-title" }, "Use the CLI against the same emulator"),
    h("div", { class: "panel panel-pad" },
      h("p", { class: "muted" }, "Paste this in a terminal. Anything you create from the CLI shows up here, and the other way round."),
      codeBlock(env, { wrap: true })));
  return page;
});
