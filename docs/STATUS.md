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
| EKS | Basic | `/legacy/#/eks` … | `static/pages/containers.js` |
| MSK (Kafka) | Basic | `/legacy/#/kafka` | `static/pages/kafka.js` |
| ElastiCache, Redshift, DocumentDB, Neptune | Basic | `/legacy/#/...` | `static/pages/databases.js` |
| Athena, Kinesis | Basic | `/legacy/#/...` | `static/pages/extras.js` |
| Lambda, SQS, SNS, EventBridge, Step Functions, IAM, Secrets Manager, Parameter Store, CloudWatch Logs, CloudFormation | Basic | `/legacy/#/...` | `static/pages/extras.js` |
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

## Known gaps in the full-console services

- No automated tests yet. Testing so far is manual in the browser (see [ADDING_A_SERVICE.md](ADDING_A_SERVICE.md)).
- Monitoring tabs show emulator notes where the emulator publishes no CloudWatch metrics (EC2, RDS).
- These forms weren't exercised in the browser, only through their API calls:
  - RDS: Create proxy and Create subnet group.
  - Glue: Create connection, Add classifier, Add security configuration.
