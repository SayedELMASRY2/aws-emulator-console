# Emulator notes

Behavior of the AWS Emulator (v1.0.385) found while building this console. Probe a service before building pages for it (see [ADDING_A_SERVICE.md](ADDING_A_SERVICE.md)), and update this file with what you find.

## General

- **Endpoint:** `https://127.0.0.1:9297`, with a self-signed CA at `~/.aws/emulator/9297/ca.pem`.
- **Keys:** per-run keys are written to `~/.aws/emulator/9297/emulator_credentials`. SigV4 is required by default (`--auth on`).
- **State lives only in memory.** A restart wipes everything, and new keys are written.
- **Not-implemented operations** return HTTP 501 with code `NotImplemented` ("scaffolded but not implemented"). The console turns these into an explanation (`errHeader` in `common.tsx`). In menus, disable such actions with a `disabledReason`.
- **Account and Region:** account `000000000000`, Region `us-east-1`.
- **IAM is enforced** for work the emulator runs on your behalf (Glue jobs and crawlers, RDS exports and others). Those calls run as the resource's role, which needs real permissions. The managed policies `AWSGlueServiceRole` and `AmazonS3FullAccess` exist and can be attached.
- **Error messages can mislead.** A Glue job whose role can't read the script reports "Script file doesn't exist" instead of AccessDenied.

## S3

**Works**

- Buckets, objects, versions and presigned URLs. Presigned URLs need SigV4 (`signature_version="s3v4"`).
- Replication between buckets.
- Event notifications to SQS (tested; SNS and Lambda not yet). The destination must allow S3 to send to it, otherwise you get "Unable to validate destination".
- Lifecycle, inventory, Intelligent-Tiering and Object Lock configurations are stored and returned. Whether lifecycle rules actually act on objects hasn't been checked.

**Not implemented:** S3 Control (Access Points, Batch Operations, account Block Public Access, Storage Lens), and S3 Select.

## DynamoDB

**Works**

- Tables, items, PartiQL, backups and restore.
- PITR, streams, and global table replicas.
- Auto scaling through Application Auto Scaling.
- CloudWatch metrics.
- Export to S3, which writes real files; the encryption value must be `AES256`, not `SSE_S3`.
- Import from S3.
- Index names must be at least 3 characters.

**DAX:** creating a subnet group fails with "Some input subnets are invalid", so clusters can't be created.

## EC2, ELB, Auto Scaling

**Works**

- The instance API and lifecycle. Instances aren't real machines: there's no SSH and no guest OS.
- Security groups, key pairs, EIPs, ENIs, volumes, snapshots and launch templates.
- ALBs listen for real on `127.0.0.1:<port>` and answer HTTP. Fixed-response rules work; forward needs a real target or returns 502.
- Auto Scaling groups launch instances.

**User data**

- boto3 base64-encodes `RunInstances` UserData itself, so pass raw text.
- Launch template UserData must already be encoded.
- Pass `ModifyInstanceAttribute` UserData and `ImportKeyPair` key material as plain text.

**Not implemented:** CreateImage, CopyImage, ModifySnapshotAttribute, GetLaunchTemplateData, and PutScheduledUpdateGroupAction.

**Bugs**

- RunInstances creates only the root volume, sized from the AMI, and ignores extra block devices.
- CreateVolume from a snapshot returns `InvalidSnapshot.NotFound`.

**No CloudWatch metrics** are published for instances.

## RDS and Aurora

**Real database servers on `127.0.0.1:<port>`**

- MySQL (8.4.4), MariaDB (11.4.4), PostgreSQL, and Aurora MySQL/PostgreSQL endpoints all speak their wire protocol.
- Oracle, SQL Server and Db2 are modeled at the API level only.

**Works**

- Create, modify, stop, start, reboot (instances) and delete.
- Read replicas and promote; cluster readers and failover.
- Snapshots: create, copy, restore. Blue/Green deployments. Global clusters.
- Subnet groups; parameter groups (including value edits and reset); option groups (ModifyOptionGroup).
- Proxies (they become `available` after a moment, and targets can only be registered then).
- Event subscriptions (the SNS topic must exist). Log files, through DescribeDBLogFiles and DownloadDBLogFilePortion.
- `StartExportTask` writes export metadata files to S3. It needs:
  - A role trusted by `export.rds.amazonaws.com`, with S3 write access to the bucket.
  - A KMS key.

**Not implemented**

- RestoreDBInstanceToPointInTime and RestoreDBClusterToPointInTime.
- ModifyDBSnapshotAttribute and DescribeDBSnapshotAttributes (sharing).
- DescribeDBInstanceAutomatedBackups and DescribeReservedDBInstances.
- DescribeDBClusterEndpoints and CreateDBClusterEndpoint.
- DescribeOptionGroupOptions, ModifyDBRecommendation, and DescribeDBProxyEndpoints.

**Other limits**

- `RebootDBCluster` is rejected for Aurora PostgreSQL. Reboot the instances instead.
- There are no CloudWatch metrics for RDS.

## AWS Glue

**Crawlers run for real.** They read S3 (CSV and JSON tested), infer the schema, create tables and add partitions from `key=value/` folders. GetCrawlerMetrics reports results; ListCrawls isn't implemented.

**Jobs run for real** (`glueetl` and `pythonshell`).

- Scripts run with `awsglue`, `GlueContext`, `getResolvedOptions`, `Job`, `create_dynamic_frame.from_catalog`, and boto3 (as the job's role).
- `write_dynamic_frame` can write CSV or JSON, but **not Parquet** ("UnwritableFormat").
- `pandas` isn't available.
- Failures show up as `ErrorMessage` on the run, for example `ValueError: boom`. Nothing is sent to CloudWatch Logs.

**Works**

- Data quality: rulesets, evaluation runs and results with rule-level metrics.
- Athena can query catalog tables (`SELECT * FROM "db"."table"`).
- Workflows: runs start the **start trigger's** actions.

**Conditional triggers** are stored but never fire, both inside and outside workflows. Schedules are stored but don't fire on the cron clock.

**Interactive sessions** are recorded, but statements end with `RuntimeUnavailable`, so there's no Spark runtime for notebooks.

**Not implemented**

- ListSchemas, DeleteSchema and DeleteRegistry.
- TestConnection and StopSession.
- GetUserDefinedFunctions and ListDataQualityResults.
- DescribeIntegrations, ListUsageProfiles, GetCatalogs and ListDevEndpoints.

## Amazon ECS

**Works**

- `CreateCluster`, `DescribeClusters`, `ListClusters`, `DeleteCluster`.
- Default capacity providers `FARGATE` and `FARGATE_SPOT` are supported.
- `RegisterTaskDefinition`, `DescribeTaskDefinition`, `ListTaskDefinitions`, `DeregisterTaskDefinition`.
- Multiple container definitions, port mappings, CPU/memory constraints, and environment variables.
- `CreateService`, `DescribeServices`, `UpdateService` (desiredCount scaling), `DeleteService`.
- `RunTask`, `DescribeTasks`, `ListTasks`, `StopTask`.
- Awsvpc networking mode with VPC subnets and security groups.
- Load balancer integration with target groups.

**Real work**

- Tasks actually run: the emulator pulls container images from registries (Docker Hub, public ECR), so internet access is required.
- If an image cannot be pulled, tasks terminate with `CannotPullContainerError`.

**Not implemented**

- Auto Scaling Group capacity providers (`CreateCapacityProvider`).
- Service Connect and Cloud Map service discovery proxy mesh.
- Account settings management (`PutAccountSetting`).
- Container Insights CloudWatch metrics.

## Amazon ECR

**Works**

- `CreateRepository`, `DescribeRepositories`, `DeleteRepository`.
- `repositoryUri` returns `127.0.0.1:<port>/<repoName>`.
- `imageTagMutability`: `MUTABLE` or `IMMUTABLE`.
- `imageScanningConfiguration`: `scanOnPush` toggle.
- `encryptionConfiguration`: `AES256` or `KMS`.
- `PutLifecyclePolicy`, `GetLifecyclePolicy`, `DeleteLifecyclePolicy` with full rule JSON schemas.
- `DescribeImages`, `ListImages`, `BatchDeleteImage`.

**Not implemented**

- Public registries (gallery.ecr.aws).
- Cross-region replication.
- Pull through cache.
- Registry permissions.

## Amazon EKS

**Works**

- `CreateCluster`, `DescribeCluster`, `ListClusters`, `DeleteCluster`.
- Supports Kubernetes `1.31` (older versions like 1.28/1.29 are rejected as deprecated).
- Generates a local control plane API server endpoint on `https://127.0.0.1:<port>`.
- Generates valid certificate authority data and OIDC issuer.
- `CreateNodegroup`, `DescribeNodegroup`, `ListNodegroups`, `DeleteNodegroup`.
- `CreateAddon`, `DescribeAddon`, `ListAddons`, `DeleteAddon`, and `DescribeAddonVersions`.

**Not implemented**

- `ListFargateProfiles` returns `501 NotImplemented` (scaffolded in emulator).
- Access entries / IAM authenticator RBAC management.
- EKS Insights.

## AWS Lambda

**Works**

- `CreateFunction`, `GetFunction`, `ListFunctions`, `DeleteFunction`.
- `UpdateFunctionCode`, `UpdateFunctionConfiguration`.
- `Invoke` with synchronous execution, payload streaming, and log tailing (`LogType: "Tail"`).
- Supported runtimes: Python (`python3.13`, `python3.12`, `python3.11`), Node.js (`nodejs22.x`, `nodejs20.x`).
- Function lifecycle state transitions from `Pending` (while runtime container is provisioned) to `Active`.
- Presigned S3 zip code download location in `GetFunction`.

**Real work**

- Function code actually executes locally in an isolated container/process environment.
- Returns real output payloads, status codes, and execution logs.

**Not implemented**

- Lambda Layers.
- Code Signing configurations.
- Serverless Application Repository.

## Amazon Athena

**Works**

- `StartQueryExecution`, `GetQueryExecution`, `GetQueryResults`, `StopQueryExecution`.
- Real SQL query execution engine over S3 and Glue Data Catalog tables.
- Query states: `QUEUED` -> `RUNNING` -> `SUCCEEDED` / `FAILED`.
- Full ANSI SQL syntax: string literals use single quotes (`'text'`), column aliases use double quotes (`"col"`).
- `ListWorkGroups`, `GetWorkGroup`, `CreateWorkGroup`, `DeleteWorkGroup`.
- `ListQueryExecutions` and `BatchGetQueryExecution`.

**Real work**

- Queries actually run against local S3 objects and Glue catalog schemas, producing real result row sets.

**Not implemented**

- `ListNamedQueries` returns `501 NotImplemented` (saved queries are managed locally).
- Federated external data source connectors.

## Amazon MSK

**Works**

- `CreateCluster`, `CreateClusterV2`, `DescribeCluster`, `DescribeClusterV2`, `ListClustersV2`, `DeleteCluster`.
- Provisioned clusters and Serverless clusters.
- `GetBootstrapBrokers` returns Plaintext and TLS endpoint connection strings.
- `ListNodes` returns broker node identifiers, subnets, and IPs.
- `ListClusterOperations` and `ListClusterOperationsV2`.
- `CreateConfiguration`, `DescribeConfiguration`, `DescribeConfigurationRevision`, `ListConfigurations`, `DeleteConfiguration`.

**Limits**

- Broker hostnames follow AWS DNS conventions and are not resolvable on a local loopback network. The emulator covers the MSK management APIs.
- MSK Connect (custom plugins, connectors, worker configurations) is not implemented in the emulator.

## Amazon SQS

**Works**

- `CreateQueue`, `GetQueueUrl`, `GetQueueAttributes`, `DeleteQueue`, `PurgeQueue`.
- Standard and FIFO (`.fifo`) queues with content-based deduplication and message group IDs.
- `SendMessage`, `ReceiveMessage`, `DeleteMessage`.
- Visibility timeout and retention periods are actively enforced by the emulator.

**Not implemented**

- Dead-letter queue automated redrive tasks.

## Amazon SNS

**Works**

- `CreateTopic`, `GetTopicAttributes`, `DeleteTopic`.
- Standard and FIFO (`.fifo`) topics.
- `Publish` message delivery.
- `Subscribe`, `Unsubscribe`, `ListSubscriptions`, `ListSubscriptionsByTopic`.
- Protocols: `email`, `sqs`, `lambda`, `http`, `https`.

**Not implemented**

- Push notifications to mobile devices (Apple APNs / Google FCM).
- Direct carrier SMS origination.

## Amazon EventBridge

**Works**

- `ListEventBuses`, `CreateEventBus`, `DeleteEventBus`.
- `ListRules`, `DescribeRule`, `PutRule`, `DeleteRule`, `EnableRule`, `DisableRule`.
- `PutTargets`, `ListTargetsByRule`, `RemoveTargets`.
- `PutEvents` (dispatches real custom events that trigger matching rules).

**Not implemented**

- EventBridge Pipes.
- API destinations.

## AWS Step Functions

**Works**

- `CreateStateMachine`, `DescribeStateMachine`, `ListStateMachines`, `DeleteStateMachine`.
- `StartExecution`, `DescribeExecution`, `ListExecutions`, `StopExecution`.
- `GetExecutionHistory` tracks real execution event progression (states entered, states exited, outputs).
- Standard and Express state machines.
- States: Pass, Task, Choice, Wait, Parallel, Succeed, Fail.

**Not implemented**

- Activities (polling external workers).

## Amazon ElastiCache

**Works**

- `CreateCacheCluster`, `DescribeCacheClusters`, `DeleteCacheCluster`, `RebootCacheCluster`.
- Supports Redis, Valkey, and Memcached engines.
- `CreateCacheSubnetGroup`, `DescribeCacheSubnetGroups`, `DeleteCacheSubnetGroup`.
- `CreateCacheParameterGroup`, `DescribeCacheParameterGroups`, `DeleteCacheParameterGroup`.

**Real work**

- Active Redis and Memcached clusters bind real in-memory server sockets on `127.0.0.1:<port>`.
- Endpoints respond natively to the Redis wire protocol (e.g. responds `+PONG` to raw `PING`).

**Not implemented**

- ElastiCache Serverless automated partition sharding.
- Redis ACL User Groups.
- S3 snapshot export and restore.

## AWS IAM

**Works**

- `GetAccountSummary`, `ListUsers`, `GetUser`, `CreateUser`, `DeleteUser`.
- `CreateAccessKey`, `ListAccessKeys`, `DeleteAccessKey`.
- `ListRoles`, `GetRole`, `CreateRole`, `DeleteRole`.
- `AttachRolePolicy`, `DetachRolePolicy`, `ListAttachedRolePolicies`.
- `ListPolicies`, `GetPolicy`, `GetPolicyVersion`, `CreatePolicy`, `DeletePolicy`.
- `ListGroups`, `CreateGroup`, `DeleteGroup`.
- Trust policies: validates and parses service principals (e.g. `lambda.amazonaws.com`, `glue.amazonaws.com`, `ec2.amazonaws.com`).

**Real work**

- The emulator strictly validates IAM trust policies and permissions for serverless and asynchronous workloads (Glue ETL scripts, RDS S3 exports, and Lambda execution).

**Not implemented**

- Identity providers (SAML / OIDC external IdP).
- Credential reports.

## AWS Secrets Manager

**Works**

- `CreateSecret`, `DescribeSecret`, `ListSecrets`, `DeleteSecret`.
- `GetSecretValue` and `PutSecretValue` for version updates and rotation.
- Staging labels (`AWSCURRENT`, `AWSPREVIOUS`).
- Supports structured JSON key/value pairs and raw plaintext secret strings.

**Not implemented**

- Pre-packaged CloudFormation rotation templates for external databases.

## AWS Systems Manager (Parameter Store)

**Works**

- `PutParameter`, `GetParameter`, `GetParameters`, `GetParametersByPath`, `DeleteParameter`, `DeleteParameters`.
- `DescribeParameters` with metadata and tagging support (`ListTagsForResource`).
- `GetParameterHistory` provides version history tracking.
- Types: `String`, `StringList`, and `SecureString`.
- `WithDecryption` flag cleanly decrypts `SecureString` values in-memory.
- Full support for hierarchical paths (e.g. `/app/production/database/host`).

**Not implemented**

- Node management (Run Command, Session Manager, Patch Manager, Fleet Manager).
- Systems Manager Explorer and AppConfig.

## Other services (found while building the basic pages)

- **ECS:** pulls real container images, which needs internet access.
