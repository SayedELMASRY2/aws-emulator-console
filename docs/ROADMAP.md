# Roadmap

The goal is for every service the emulator supports to have pages that look and behave like the AWS console. Services move from the basic `/legacy/` pages to full pages under `web/src/pages/<service>/`, one at a time, following [ADDING_A_SERVICE.md](ADDING_A_SERVICE.md).

Status key: ✅ done · 🔜 next · ⬜ planned

## Order

| # | Service | Status | Notes |
|---|---|---|---|
| 1 | S3 | ✅ | |
| 2 | DynamoDB | ✅ | |
| 3 | EC2 (+ ELB, Auto Scaling) | ✅ | |
| 4 | Aurora and RDS | ✅ | |
| 5 | AWS Glue | ✅ | |
| 6 | Amazon ECS | ✅ | Clusters, task definitions, services, tasks |
| 7 | Amazon ECR | ✅ | Repositories, push commands, images, lifecycle policies |
| 8 | Amazon EKS | ✅ | Kubernetes clusters, node groups, add-ons |
| 9 | AWS Lambda | ✅ | Functions, in-browser code editor & Deploy, Test events with live execution |
| 10 | Amazon Athena | ✅ | Query editor, catalog tree & table schema preview, query history, workgroups |
| 11 | Amazon MSK (Kafka) | 🔜 | Broker hostnames don't resolve, so check what can be shown |
| 12 | Other databases: ElastiCache, MemoryDB, DocumentDB, Neptune, Redshift | ⬜ | Probe which ones run real endpoints, as RDS does |
| 13 | SQS, SNS, EventBridge, Step Functions | ⬜ | Send/receive message pages, rules, state machine graph |
| 14 | IAM, Secrets Manager, Parameter Store, KMS | ⬜ | IAM matters because the emulator enforces it |
| 15 | CloudWatch (Logs, Metrics, Alarms) and CloudFormation | ⬜ | |
| 16 | Kinesis, Firehose and others the emulator supports | ⬜ | Check `GET /api/meta/services` and probe |

## Per-service scope

### 6. Containers (ECS, ECR, EKS)

- **ECS:**
  - Clusters, plus cluster detail with Services, Tasks, Infrastructure, Metrics and Tags.
  - Create cluster.
  - Task definitions: a JSON and form editor, with revisions.
  - Create service (deployment options, networking, load balancer from EC2 target groups); run task.
  - Task detail (containers, logs, network bindings).
- **ECR:**
  - Private repositories and create repository (tag immutability, scan on push, encryption).
  - Images list and detail.
  - Lifecycle policy editor; repository permissions; "View push commands".
- **EKS:**
  - Clusters and create cluster, plus cluster tabs: Overview, Resources, Compute (node groups, Fargate profiles), Networking, Add-ons, Access, Observability.
  - Probe which parts the emulator implements.

### 7. MSK

- Clusters, Create cluster (provisioned and serverless), cluster detail (properties, client information, monitoring), configurations, and MSK Connect if implemented.

### 8. Other databases

- **ElastiCache:** Redis OSS / Valkey / Memcached caches, serverless caches, subnet and parameter groups, backups.
- **DocumentDB and Neptune:** clusters and instances. Reuse the RDS page structure, since the APIs are RDS-shaped.
- **Redshift:** provisioned clusters and Serverless (namespaces and workgroups), plus a query editor if the Data API works.

### 9. Lambda

- **Functions** list and Create function (author from scratch / blueprint).
- **Function page tabs:**
  - Code: editor plus Deploy, and Test with saved events.
  - Test, Monitor, Configuration (general, env vars, triggers, permissions, destinations, function URL, concurrency), Aliases, Versions.
- **Other pages:** Layers, and event source mappings for SQS, DynamoDB streams and Kinesis.
- `server.py` already has `/api/lambda/code`.

### 10. Athena

- **Query editor:**
  - Data catalog tree (databases and tables from Glue).
  - Tabs, run and cancel, and results with download.
  - Saved queries and recent queries.
- **Other pages:** Workgroups and Data sources.

## Cross-cutting work

- **Remove superseded legacy pages:** once a service is full, delete its `static/pages/*` code and its `/legacy/` links.
- **Automated tests:** add Playwright smoke tests that open every route and fail on console errors, plus one create/delete flow per service.
- **Code splitting:** the bundle is one ~2 MB chunk. Lazy-load each service's routes with `React.lazy`.
- **Shared components:** `ResourcePage`, `ActionModal` and the tag editor live under `pages/ec2/` and `pages/s3/`, and are used everywhere. Move them to `web/src/components/`.
- **Dark/light mode toggle and density setting**, as in the AWS console's preferences.
- **Region selector:** the emulator is single-Region today; check whether it accepts other Regions.
- **Packaging:** a Docker image that runs the emulator and the console together.
- **CI:** `.github/workflows/ci.yml` runs the type-check and build. Add the Playwright tests to it once they exist.
