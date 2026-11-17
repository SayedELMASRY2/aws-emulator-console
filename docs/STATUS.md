# Status

Last updated: 2026-11-16. Emulator version tested: **1.0.385** (2026.11.14).

**Full console** means the service's pages are in `web/src/pages/<service>/` and follow the AWS console layout: navigation, list pages, create pages and wizards, detail pages with tabs, and action menus.

**Basic** means the service only has the first-generation pages under `/legacy/`.

## Overview

| Service | Level | Route | Code |
|---|---|---|---|
| S3 | Full | `#/s3/buckets` | `web/src/pages/s3/` |
| DynamoDB | Full | `#/dynamodb/dashboard` | `web/src/pages/dynamodb/` |
| EC2 (+ ELB, Auto Scaling) | Full | `#/ec2/dashboard` | `web/src/pages/ec2/` |
| Aurora and RDS | Full | `#/rds/dashboard` | `web/src/pages/rds/` |
| AWS Glue | Full | `#/glue/getting-started` | `web/src/pages/glue/` |
| Amazon ECS | Full | `#/ecs/clusters` | `web/src/pages/ecs/` |
| Amazon ECR | Full | `#/ecr/repositories` | `web/src/pages/ecr/` |
| Amazon EKS | Full | `#/eks/clusters` | `web/src/pages/eks/` |
| AWS Lambda | Full | `#/lambda/functions` | `web/src/pages/lambda/` |
| Amazon Athena | Full | `#/athena/query-editor` | `web/src/pages/athena/` |
| Amazon MSK | Full | `#/msk/clusters` | `web/src/pages/msk/` |
| Amazon SQS | Full | `#/sqs/queues` | `web/src/pages/sqs/` |
| Amazon SNS | Full | `#/sns/topics` | `web/src/pages/sns/` |
| Amazon EventBridge | Full | `#/events/rules` | `web/src/pages/events/` |
| AWS Step Functions | Full | `#/stepfunctions/state-machines` | `web/src/pages/stepfunctions/` |
| ElastiCache, Redshift, DocumentDB, Neptune | Basic | `/legacy/#/...` | `static/pages/databases.js` |
| Kinesis Data Streams | Basic | `/legacy/#/...` | `static/pages/extras.js` |
| IAM, Secrets Manager, Parameter Store, CloudWatch Logs, CloudFormation | Basic | `/legacy/#/...` | `static/pages/extras.js` |
| API Explorer (any operation of any service) | Tool | `/legacy/#/explorer` | `static/pages/explorer.js` |

## S3

**Pages**

- **Buckets:** list and Create bucket, with every section.
- **Bucket tabs:**
  - Objects: browse, folders, upload, download, delete, versions toggle.
  - Properties: versioning, encryption, tags, logging, website hosting, Object Lock, and more, each with an Edit page.
  - Permissions: Block Public Access, bucket policy, ACL matrix, CORS, ownership.
  - Metrics.
  - Management: lifecycle, replication, inventory.
- **Event notifications:** forms for SQS, SNS and Lambda, with a checkbox that grants the destination permission.
- **Intelligent-Tiering** configurations.
- **Upload page** with all of its options.
- **Object page:** versions and edit pages for storage class, tags, metadata, legal hold and retention.
- **n/a pages:** Access Points, Storage Lens, Batch Operations, S3 Select and account settings, each with the reason.

**Tested:** presigned URLs, replication between buckets, and event notifications to SQS.

## DynamoDB

**Pages**

- Dashboard, Tables, and Create table:
  - Capacity: on-demand or provisioned plus auto scaling.
  - Indexes (GSI/LSI), encryption, deletion protection, resource policy, tags.
- **Table page, eight tabs:**
  - Overview, Indexes, Monitor (CloudWatch charts), Global tables, Backups and PITR.
  - Exports and streams, Permissions, Additional settings.
- **Explore items:** scan/query with filters, and an item editor (form or JSON, DynamoDB JSON toggle).
- PartiQL editor, Backups and Restore, Exports to S3, Imports from S3, DAX.

**Tested:**

- Exports write files to S3, and imports load data.
- Global table replicas, auto scaling, streams and CloudWatch metrics.

## EC2

**Pages**

- Dashboard and Instances (list, detail tabs, and all actions in the Instance state and Actions menus).
- Launch instance wizard, Launch templates, Instance types, Spot, Dedicated hosts, Capacity reservations, Events.
- AMIs and AMI catalog; Volumes, Snapshots and Lifecycle Manager.
- Security groups (create, and a rule editor that diffs revoke/modify/authorize), Elastic IPs, Key pairs (create downloads the key, import), Network interfaces, Placement groups.
- Load balancers (ALB/NLB/GWLB with listeners and rules), Target groups (health checks, register targets).
- Auto Scaling groups (create from a launch template, capacity, policies, activity), Settings.

**Tested:**

- **Instances:** launch 2 instances with a new security group and user data; stop, change type, start, and termination protection.
- **Networking:** security group create/edit, target group, ALB in two zones with a listener.
- **Other:** launch template, volume, Auto Scaling group.

**Bugs fixed during testing:**

- User data was double base64-encoded.
- The instance type list stopped at 100.
- The termination protection field didn't refresh.

## Aurora and RDS

**Pages**

- **Dashboard:** resources and quotas, recommendations.
- **Databases:** a tree of clusters, writer/reader instances, primaries and replicas, and Blue/Green deployments.
- **Create database:**
  - Standard and Easy create, for 8 engines, with templates and availability options.
  - Settings, with an auto-generated password shown once.
  - Instance class picker, storage and autoscaling, connectivity (new or existing security group), tags.
  - Authentication, monitoring, log exports, backup and maintenance windows, encryption, deletion protection.
- **Database page:**
  - Summary.
  - Connectivity & security: endpoint, a `mysql`/`psql` command to connect, security group rules.
  - Monitoring, Logs & events (view and download log files), Configuration, Maintenance & backups, Tags.
- **Modify:** a form, then a "Summary of modifications" page with apply-now or next-window.
- **Database actions:** read replica, promote, add reader, failover, stop/start/reboot, delete (final snapshot, "delete me"), Blue/Green, convert to Multi-AZ.
- **Snapshots:** Take, Restore, Copy, Export to S3 (creates the IAM role it needs), and Exports.
- **Groups and other pages:**
  - Proxies; Subnet groups; Parameter groups (edit values inline, reset, copy); Option groups.
  - Events, Event subscriptions, Recommendations, Certificate update, Zero-ETL.

**Tested:**

- **Lifecycle:** create MySQL (all settings verified), then modify class and protection.
- **Snapshots and restore:** snapshot, restore, read replica, add reader, failover, delete with final snapshot.
- **Groups and exports:** parameter group edit, event subscription, snapshot export (files written to S3).

**Bugs fixed during testing:**

- The proxy registered targets before it was available.
- Export failed until the role had the right trust and S3 access.
- Aurora cluster reboot isn't supported, so it's now disabled with the reason.
- ModifyDBRecommendation isn't implemented, so it's now disabled.

## AWS Glue

**Pages**

- Getting started (creates a Glue IAM role).
- **Databases and Tables:**
  - Add table: form or JSON, formats, columns, partitions.
  - Table page: View data through Athena, Partitions, Indexes, Data quality (DQDL rulesets, runs, results), Advanced properties, Versions.
- Connections, Classifiers, Schema registries, Catalog settings (encryption, resource policy).
- Crawlers: 5-step wizard, detail page with the tables it created.
- **Script editor jobs:**
  - Spark, Spark Streaming or Python shell.
  - Scripts are saved to `aws-glue-assets-<acct>-<region>/scripts/`.
  - Job details, Runs (run details and errors), Schedules; Run with parameters, Clone.
- Job run monitoring.
- Triggers (schedule, job/crawler event, on demand, EventBridge).
- Workflows with an SVG graph colored by run state.
- Security configurations, Interactive sessions, Blueprints, Sensitive data detection (custom identifiers with a regex tester), Record Matching.

**Tested:**

- **Catalog:** IAM role setup, then the crawler wizard on S3 data; tables and partitions were created.
- **Table page:** View data showed the rows, and a data quality run scored 100%.
- **Jobs:** a Spark job reading the catalog and writing CSV to S3 succeeded.
- **Workflow:** start trigger, then the job.

**Bug fixed:** changing tabs in the job editor remounted the page and lost script edits.

## Amazon ECS

**Pages**

- **Clusters:**
  - Cluster list with active services, running tasks, pending tasks, and container instances.
  - Create cluster (Fargate / Fargate Spot capacity providers, Container Insights toggle).
  - Cluster detail: Overview container, Services tab, Tasks tab, Infrastructure tab (capacity providers), Metrics tab.
  - Delete cluster confirmation modal.
- **Services:**
  - Create service: task definition picker, desired count, Fargate/EC2 launch type, VPC/Subnets/Security groups networking, optional ELB target group binding.
  - Service detail: summary, deployments table, events table, network configuration.
  - Scale desired count modal and delete service modal.
- **Tasks:**
  - Run standalone task: cluster, task definition, count, launch type, VPC networking.
  - Task detail: container states, exit codes, port mappings, network bindings, and stop task action.
- **Task definitions:**
  - Task definition family/revision list.
  - Create task definition: Form editor (CPU, Memory, container specs, port mappings, env vars) and full JSON editor.
  - Task definition detail: revision status, launch types, container definitions, deregister revision.
- **Unsupported pages:** Capacity providers, Service Connect, Account settings (marked n/a with emulator reasons).

**Tested:**

- Created cluster `prod-cluster` with Fargate providers.
- Registered task definition `nginx-web` with port mappings.
- Created service `web-svc` with awsvpc networking.
- Ran standalone task and verified status progression.
- Swept all ECS routes in headless Chrome and captured screenshots.

## Amazon ECR

**Pages**

- **Repositories:**
  - Repositories list with URI, tag immutability, scan on push, encryption type, and created at.
  - Create repository: visibility settings (private), repository name, tag immutability toggle, scan on push toggle, encryption type (AES-256 or KMS).
  - Repository detail: Overview summary with URI and ARN copy buttons, Images tab, Lifecycle policy tab.
  - View push commands modal with step-by-step Docker CLI commands for login, build, tag, and push.
  - Delete repository modal with repository name confirmation.
- **Images:**
  - Image list with image tags, digest (with copy button), size, and pushed date.
  - Delete image action via `BatchDeleteImage`.
- **Lifecycle policy:**
  - Rules list viewing parsed rules (rule priority, description, match criteria, expire action).
  - Lifecycle policy editor with JSON editor, plus quick presets for expiring untagged images or keeping last N images.
  - Delete lifecycle policy.
- **Unsupported pages:** Registry permissions, Replication, Pull through cache, Public repositories (marked n/a with emulator reasons).

**Tested:**

- Created repository `api-backend` with tag immutability and scan-on-push.
- Configured multi-rule lifecycle policy and verified JSON round-trip.
- Verified Docker push commands generation.
- Verified `DescribeImages` and `BatchDeleteImage`.
- Captured screenshots in headless Chrome.

## Amazon EKS

**Pages**

- **Clusters:**
  - Cluster list with status, Kubernetes version, API server endpoint, and creation date.
  - Create cluster: name, Kubernetes 1.31 version, cluster service role, VPC and subnets across availability zones, security groups, public/private endpoint access.
  - Cluster detail: overview with VPC, subnets, cluster security group, OIDC issuer, and copyable `aws eks update-kubeconfig` command.
  - Delete cluster modal with confirmation.
- **Compute:**
  - Node groups table: name, status, min/max/desired scaling, capacity type, instance types.
  - Add node group: name, node IAM role, capacity type (On-Demand / Spot), instance type, scaling configuration, subnets.
  - Fargate profiles: marked with an emulator note (scaffolded, 501 NotImplemented in emulator).
- **Add-ons:**
  - Installed add-ons table with version and status.
  - Install add-on: curated operational add-ons (VPC CNI, CoreDNS, kube-proxy, EBS CSI Driver) with version selector populated from `DescribeAddonVersions`.
- **Unsupported pages:** Add-ons catalog, Access entries, Insights (marked n/a with emulator reasons).

**Tested:**

- Created cluster `k8s-production` with version 1.31 and verified local API endpoint generation.
- Created managed node group `system-pool`.
- Installed operational add-on `vpc-cni`.
- Verified `kubeconfig` command generation.
- Captured screenshots in headless Chrome.

## AWS Lambda

**Pages**

- **Functions:**
  - Functions list with runtime, handler, memory, timeout, state (with `Pending`/`Active` polling indicator), code size, and last modified.
  - Create function: Author from scratch, function name, runtime selection (`python3.13`, `python3.12`, `nodejs22.x`, etc.), architecture, IAM execution role, starter code editor, memory and timeout sliders, and environment variables.
  - Function detail: Overview container with ARN, handler, memory, timeout, and last modified.
  - Delete function modal.
- **Code tab:**
  - In-browser code source editor (`index.py` / `index.mjs`) with tab indentation support.
  - "Deploy" button that packages code and updates runtime function code in place.
- **Test tab:**
  - Test event editor with quick event presets (Hello World, API Gateway proxy, SQS message).
  - "Test" invoke execution trigger with real payload execution.
  - Live execution results panel: response status code, round-trip duration in ms, parsed response payload, and decoded function execution logs.
- **Configuration tab:**
  - General configuration overview (memory, timeout, handler, ephemeral storage, role).
  - Environment variables key-value table.
- **Unsupported pages:** Code signing configurations, Layers, Applications (marked n/a with emulator reasons).

**Tested:**

- Created function `process-orders` with Python 3.12.
- Verified function state transition from `Pending` to `Active`.
- Deployed code and verified in-memory execution.
- Invoked function with test event and verified live JSON payload response (`200 OK`).
- Captured screenshots in headless Chrome.

## Amazon Athena

**Pages**

- **Query editor:**
  - Split data/editor view with AwsDataCatalog integration and Glue database selector.
  - Interactive table schema browser showing table names, columns, and data types, with instant `SELECT * LIMIT 10` table preview button.
  - SQL editor with Run (Ctrl+Enter), Clear, and Save as query.
  - Live query results viewer: state indicator, execution runtime, data scanned, dynamic table headers and row rendering.
  - CSV export download button.
  - StateChangeReason error reporting for syntax and execution failures.
- **Recent queries:**
  - Query execution history loaded via `ListQueryExecutions` and `BatchGetQueryExecution`.
  - Columns: query string, status, database, run time, submitted date, and query execution ID with copy button.
  - "Open in Query editor" action.
- **Saved queries:**
  - Saved query manager with local persistence, database tags, and instant load into Query editor.
- **Workgroups:**
  - Workgroups table with name, state, description, and effective engine version.
  - Create workgroup: name, description, and custom S3 query result output location.
  - Delete workgroup modal.
- **Unsupported pages:** Data sources (marked n/a with emulator reasons).

**Tested:**

- Queried `SHOW DATABASES` through Glue catalog integration.
- Executed ANSI SQL query returning column headers and rows.
- Created custom workgroup `bi-analysts` with S3 output configuration.
- Verified query history via `BatchGetQueryExecution`.
- Captured screenshots in headless Chrome.

## Amazon MSK

**Pages**

- **Clusters:**
  - Cluster list with cluster name, status, type (Provisioned/Serverless), Kafka version, broker count, instance type, and creation date.
  - Create cluster: Provisioned or Serverless, Apache Kafka version (3.8.x, 3.7.x KRaft, 3.6.0), broker count, instance types (`kafka.m5.large`, Graviton, etc.), EBS storage per broker, VPC subnets, security groups, and custom configuration association.
  - Cluster detail: overview with cluster ARN, Kafka version, broker count, and storage.
  - Bootstrap brokers panel: displays Plaintext and TLS endpoint connection strings with copy buttons.
  - Detail tabs: Properties & networking (subnets, security groups, Zookeeper connect string), Broker nodes table (`ListNodes`), and Cluster operations history (`ListClusterOperations`).
  - Delete cluster confirmation modal.
- **Cluster configurations:**
  - Configurations list with name, state, latest revision, and compatible Kafka versions.
  - Create configuration: name, description, and `server.properties` code editor (`auto.create.topics.enable`, `log.retention.hours`, etc.).
  - View properties modal displaying formatted `server.properties` for any revision.
  - Delete configuration modal.
- **Unsupported pages:** MSK Connect (Custom plugins, Connectors, Worker configurations - marked n/a with emulator reasons).

**Tested:**

- Created configuration `analytics-retention` with custom log retention rules.
- Created cluster `production-streams` with Kafka 3.8.x and 2 broker nodes.
- Verified `DescribeClusterV2`, `GetBootstrapBrokers`, and `ListNodes`.
- Captured screenshots in headless Chrome.

## Amazon SQS

**Pages**

- **Queues:**
  - Queues list with name, type (Standard/FIFO), created timestamp, messages available, messages in flight, and messages delayed.
  - Create queue: Standard or FIFO (.fifo), visibility timeout, message retention period, delivery delay, receive wait time (long polling), and SSE-SQS encryption.
  - Queue detail: overview metrics (available, in-flight, delayed messages), configuration tab, encryption tab, and purge queue action.
  - Send and receive messages: interactive message testing page with payload editor, delivery delay, FIFO deduplication/group IDs, polling for messages, inspection modal, and delete message.
  - Delete queue modal with confirmation.
- **Unsupported pages:** Dead-letter queue redrive (marked n/a with emulator reasons).

**Tested:**

- Created queue `order-events` with custom visibility timeout and retention.
- Sent message with JSON payload.
- Polled queue and verified message receipt and body inspection.
- Purged queue and deleted queue.
- Captured screenshots in headless Chrome.

## Amazon SNS

**Pages**

- **Topics:**
  - Topics list with name, type (Standard/FIFO), topic ARN with copy button, and confirmed subscriptions count.
  - Create topic: Standard or FIFO (.fifo), display name, and encryption.
  - Topic detail: overview, subscriptions list for topic, and access policy view.
  - Publish message: subject, message body editor, FIFO message group ID / deduplication ID, and live publish execution.
  - Delete topic modal with confirmation.
- **Subscriptions:**
  - Subscriptions list across all topics: endpoint, protocol (Email, SQS, Lambda, HTTP/HTTPS), status (Pending confirmation / Confirmed), and subscription ARN.
  - Create subscription: topic ARN selector, protocol picker, and endpoint input.
  - Delete subscription modal.
- **Unsupported pages:** Push notifications, SMS (marked n/a with emulator reasons).

**Tested:**

- Created topic `order-notifications`.
- Created email subscription to topic.
- Published message with subject and JSON payload.
- Verified subscription listing and topic deletion.
- Captured screenshots in headless Chrome.

## Amazon EventBridge

**Pages**

- **Rules:**
  - Rules list filtered by event bus (`default` or custom buses).
  - Create rule: name, event bus, rule type (Event pattern or Schedule rate/cron), event pattern JSON editor, target ARN.
  - Enable and disable rule actions in place.
  - Delete rule modal with confirmation.
- **Event buses:**
  - Event buses list with Name and ARN.
  - Create custom event bus modal.
  - Delete event bus action (disabled for default bus).
- **Send events:**
  - Interactive custom event dispatcher: Event bus selector, Source, Detail type, and JSON payload editor.
  - Live dispatch via `PutEvents` with Event ID confirmation.
- **Unsupported pages:** Pipes, API destinations (marked n/a with emulator reasons).

**Tested:**

- Created rule `payment-pipeline` on default bus.
- Dispatched custom event and verified successful event ID receipt.
- Captured screenshots in headless Chrome.

## AWS Step Functions

**Pages**

- **State machines:**
  - State machines list with name, type (Standard/Express), ARN with copy button, and creation date.
  - Create state machine: name, type, IAM role, Amazon States Language (ASL) definition editor with starter templates.
  - State machine detail: overview with ARN and role, executions table, and formatted ASL definition viewer.
  - Delete state machine modal.
- **Executions:**
  - Start execution modal with custom input JSON.
  - Execution detail: status (`Succeeded`, `Running`, `Failed`), started/stopped timestamps, formatted input and output JSON.
  - Execution event history table (`GetExecutionHistory`): ID, Event type (`ExecutionStarted`, `PassStateEntered`, etc.), timestamp, and step detail payloads.
- **Unsupported pages:** Activities (marked n/a with emulator reasons).

**Tested:**

- Created state machine `order-orchestration` with Pass state pipeline.
- Started execution `exec-live-1` with input JSON.
- Verified execution success, state transitions, output payload, and event history graph.
- Captured screenshots in headless Chrome.

## Known gaps in the full-console services

- No automated tests yet. Testing so far is manual in the browser (see [ADDING_A_SERVICE.md](ADDING_A_SERVICE.md)).
- Monitoring tabs show emulator notes where the emulator publishes no CloudWatch metrics (EC2, RDS).
- These forms weren't exercised in the browser, only through their API calls:
  - RDS: Create proxy and Create subnet group.
  - Glue: Create connection, Add classifier, Add security configuration.
