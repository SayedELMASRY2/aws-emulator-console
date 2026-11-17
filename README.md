<div align="center">

# AWS Emulator Console

**The AWS Management Console, running on your machine, for the [AWS Emulator](https://github.com/aws/aws-emulator).**

Create S3 buckets, launch EC2 instances, spin up real MySQL and PostgreSQL databases, crawl data and run Glue jobs, all from a console that looks and works like the real one. No AWS account, no bill, nothing leaves your machine.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Built with Cloudscape](https://img.shields.io/badge/UI-Cloudscape-232f3e.svg)](https://cloudscape.design)
[![AWS Emulator](https://img.shields.io/badge/AWS%20Emulator-1.0.385-ff9900.svg)](https://github.com/aws/aws-emulator)

[العربية](README.ar.md) · [Docs](docs/) · [Roadmap](docs/ROADMAP.md) · [Contributing](CONTRIBUTING.md)

![Console home](docs/images/home.png)

</div>

> **Community project.** It isn't affiliated with or endorsed by Amazon Web Services. It only ever talks to the emulator on your machine, never to a real AWS account.

## Contents

- [Why](#why)
- [Features](#features)
- [A tour](#a-tour)
- [What runs for real](#what-runs-for-real)
- [Installation](#installation)
- [Your first five minutes](#your-first-five-minutes)
- [Use the AWS CLI and SDKs alongside the console](#use-the-aws-cli-and-sdks-alongside-the-console)
- [Configuration](#configuration)
- [How it works](#how-it-works)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)
- [Project structure](#project-structure)
- [Contributing and roadmap](#contributing-and-roadmap)
- [License](#license)

## Why

The AWS Emulator runs AWS service APIs locally, but it has no user interface. You drive it with the CLI or SDKs. This project adds the missing piece: a full web console, so you can do the following.

- **Learn AWS** by clicking through the same screens as the real console, with nothing to pay for and nothing to clean up.
- **Develop and test locally.** Create the resources your app needs, inspect what your code created, and fix data by hand.
- **Demo and teach** without accounts, credentials or internet access.
- **See what the emulator supports.** Unsupported features stay in the menus, marked **n/a**, with the reason.

The UI is built with [Cloudscape](https://cloudscape.design), the open-source design system AWS uses for its own console. Navigation, wizards, tables, field names and defaults follow the real console page by page.

## Features

| Service | Level | What you get |
|---|---|---|
| **Amazon S3** | ✅ Full console | Buckets, Create bucket with every section, Objects/Properties/Permissions/Metrics/Management tabs, Edit pages for every setting, lifecycle, replication, inventory, event notifications, Intelligent-Tiering, Upload, object versions |
| **Amazon DynamoDB** | ✅ Full console | Tables, Create table (capacity, auto scaling, GSI/LSI, encryption), table tabs, Explore items (scan/query, form and JSON item editor), PartiQL editor, backups and restore, export/import with S3, DAX |
| **Amazon EC2** | ✅ Full console | Instances with every action, Launch instance wizard, launch templates, AMIs, EBS volumes and snapshots, security groups with a rule editor, Elastic IPs, key pairs, ENIs, placement groups, load balancers, target groups, Auto Scaling |
| **Aurora and RDS** | ✅ Full console | Databases tree, Create database (Standard and Easy create, 8 engines), Modify with a change summary, read replicas, readers and failover, snapshots (take, restore, copy, export to S3), proxies, subnet/parameter/option groups, events |
| **AWS Glue** | ✅ Full console | Databases and tables, View data (via Athena), data quality rules, crawler wizard, script editor jobs (Spark and Python shell), runs and schedules, triggers, workflows with a live graph |
| **Amazon ECS** | ✅ Full console | Clusters, Create cluster, cluster tabs (Services, Tasks, Infrastructure, Metrics), Create service (Fargate/EC2, networking, target groups), Run task, Task definitions with form and JSON editor |
| **Amazon ECR** | ✅ Full console | Repositories, Create repository (tag immutability, scan on push, encryption), View push commands, Images table, Lifecycle policy editor with presets |
| **Amazon EKS** | ✅ Full console | Kubernetes clusters, Create cluster (K8s 1.31, subnets, public/private API endpoints), kubeconfig generation, Node groups (scaling, capacity, instance types), Add-ons installation |
| **AWS Lambda** | ✅ Full console | Functions list, Create function (Python & Node.js runtimes), in-browser Code editor with live Deploy, Test event runner with live execution & logs, environment variables |
| **Amazon Athena** | ✅ Full console | Interactive SQL Query editor with Glue catalog schema browser, live query execution over S3 data, CSV download, Recent queries history, Workgroups |
| **Amazon MSK** | ✅ Full console | Managed Apache Kafka clusters (Provisioned & Serverless), broker nodes, bootstrap brokers endpoints (Plaintext & TLS), and cluster configurations (`server.properties`) |
| ElastiCache, Redshift, DocumentDB, Neptune, Kinesis, SQS, SNS, EventBridge, Step Functions, IAM, Secrets Manager, Parameter Store, CloudWatch Logs, CloudFormation | Basic pages | List, create and inspect the main resources. These are being moved to full console pages one by one; see the [roadmap](docs/ROADMAP.md). |
| **API Explorer** | Tool | Call any operation of any service. The input JSON starts from the operation's shape. |

Every page is wired to the emulator. Create a database in the console and `aws rds describe-db-instances` shows it.

## A tour

<table>
<tr>
<td width="50%"><b>S3: buckets</b><br><img src="docs/images/s3-buckets.png" alt="S3 buckets"></td>
<td width="50%"><b>EC2: Launch instance wizard</b><br><img src="docs/images/ec2-launch.png" alt="EC2 launch wizard"></td>
</tr>
<tr>
<td><b>EC2: instances</b><br><img src="docs/images/ec2-instances.png" alt="EC2 instances"></td>
<td><b>RDS: Create database</b><br><img src="docs/images/rds-create.png" alt="RDS create database"></td>
</tr>
<tr>
<td><b>RDS: databases, with clusters and replicas as a tree</b><br><img src="docs/images/rds-databases.png" alt="RDS databases"></td>
<td><b>Glue: a table found by a crawler</b><br><img src="docs/images/glue-table.png" alt="Glue table"></td>
</tr>
<tr>
<td><b>Glue: script editor job (runs real PySpark)</b><br><img src="docs/images/glue-job-editor.png" alt="Glue job editor"></td>
<td><b>Glue: workflow graph colored by run state</b><br><img src="docs/images/glue-workflow.png" alt="Glue workflow"></td>
</tr>
<tr>
<td><b>ECS: clusters with services and tasks</b><br><img src="docs/images/ecs-clusters.png" alt="ECS clusters"></td>
<td><b>ECS: cluster detail with active services</b><br><img src="docs/images/ecs-cluster-detail.png" alt="ECS cluster detail"></td>
</tr>
<tr>
<td><b>ECR: repositories</b><br><img src="docs/images/ecr-repositories.png" alt="ECR repositories"></td>
<td><b>ECR: repository detail and push commands</b><br><img src="docs/images/ecr-repository-detail.png" alt="ECR repository detail"></td>
</tr>
<tr>
<td><b>EKS: clusters with control plane endpoint</b><br><img src="docs/images/eks-clusters.png" alt="EKS clusters"></td>
<td><b>EKS: cluster detail with node groups & add-ons</b><br><img src="docs/images/eks-cluster-detail.png" alt="EKS cluster detail"></td>
</tr>
<tr>
<td><b>Lambda: functions list</b><br><img src="docs/images/lambda-functions.png" alt="Lambda functions"></td>
<td><b>Lambda: code editor & test events</b><br><img src="docs/images/lambda-function-detail.png" alt="Lambda function detail"></td>
</tr>
<tr>
<td><b>Athena: SQL Query editor & data catalog</b><br><img src="docs/images/athena-query-editor.png" alt="Athena query editor"></td>
<td><b>Athena: query history & execution metrics</b><br><img src="docs/images/athena-recent-queries.png" alt="Athena recent queries"></td>
</tr>
<tr>
<td><b>MSK: Apache Kafka clusters</b><br><img src="docs/images/msk-clusters.png" alt="MSK clusters"></td>
<td><b>MSK: cluster detail with bootstrap brokers</b><br><img src="docs/images/msk-cluster-detail.png" alt="MSK cluster detail"></td>
</tr>
</table>

## What runs for real

The emulator does more than store API calls. These things actually happen:

| Feature | What actually happens |
|---|---|
| RDS and Aurora | MySQL 8.4, MariaDB 11.4, PostgreSQL and Aurora run as real servers on `127.0.0.1:<port>`. The database page shows the `mysql` or `psql` command to connect. |
| Glue crawlers | Read your files in S3, infer the schema and partitions, and create tables. |
| Glue jobs | Run your Python and PySpark scripts (`GlueContext`, `from_catalog`, boto3), and write CSV/JSON to S3. |
| Athena | Runs SQL over S3 data and Glue tables. The table page has a View data button. |
| Lambda | Executes your function code. |
| Load balancers | ALBs listen on `127.0.0.1:<port>` and answer HTTP. |
| DynamoDB and RDS exports | Write real files to S3. |

The full list of what works, what isn't implemented and the known emulator bugs is in [docs/EMULATOR_NOTES.md](docs/EMULATOR_NOTES.md).

## Installation

### Requirements

| | Version | Why |
|---|---|---|
| [AWS Emulator](https://github.com/aws/aws-emulator) | 1.0.385 tested | The local AWS backend |
| Python | 3.10+ | Runs `server.py` (stdlib + boto3) |
| Node.js | 20.19+ or 22+ | Builds the web app, once |
| Git | any | To clone the repo |

The emulator runs natively on **Linux** (x86_64 or arm64, glibc 2.17+). On **macOS and Windows** it runs in **Docker**. The console itself runs anywhere Python and Node run.

### Step 1: Install and start the AWS Emulator

These commands come from the [official guide](https://docs.aws.amazon.com/emulator/latest/userguide/setting-up.html).

<details open>
<summary><b>Linux: Debian / Ubuntu</b></summary>

```bash
# x86_64 (use aws-emulator_arm64.deb on ARM)
curl -fsSLo aws-emulator.deb https://downloads.aws.com/aws-emulator/packages/aws-emulator/LTS/latest/aws-emulator_amd64.deb
sudo apt-get install -y ./aws-emulator.deb
aws-emulator -v
```

You don't need to start it yourself: `start.sh` starts it for you in step 3.
</details>

<details>
<summary><b>Linux: Fedora / RHEL / Amazon Linux</b></summary>

```bash
# x86_64 (use aws-emulator-aarch64.rpm on ARM; on Amazon Linux 2 use yum)
sudo dnf install -y https://downloads.aws.com/aws-emulator/packages/aws-emulator/LTS/latest/aws-emulator-x86_64.rpm
aws-emulator -v
```
</details>

<details>
<summary><b>macOS and Windows: Docker</b></summary>

AWS doesn't publish a prebuilt image, so build one from this `Dockerfile`. On Apple silicon or other ARM machines, use `aws-emulator-aarch64.rpm` instead.

```dockerfile
FROM public.ecr.aws/amazonlinux/amazonlinux:2023-minimal
ADD https://downloads.aws.com/aws-emulator/packages/aws-emulator/LTS/latest/aws-emulator-x86_64.rpm /tmp/aws-emulator.rpm
RUN rpm -i /tmp/aws-emulator.rpm && rm /tmp/aws-emulator.rpm \
    && mkdir -p /home/emulator && chown 1000 /home/emulator
USER 1000
ENV HOME=/home/emulator
EXPOSE 9297
ENTRYPOINT ["aws-emulator", "-b", "0.0.0.0"]
```

```bash
docker build -t aws-emulator .
```

Run it so it writes its keys and certificate to your home folder, where the console reads them.

macOS:

```bash
mkdir -p ~/.aws/emulator
PORT=9297
docker run --rm --memory=2g --memory-swap=2g -p 127.0.0.1:$PORT:$PORT \
  -e HOME="$HOME" -v "$HOME/.aws/emulator:$HOME/.aws/emulator" \
  aws-emulator -p $PORT
```

Windows (PowerShell):

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.aws\emulator"
$port = 9297
docker run --rm --memory=2g --memory-swap=2g -p "127.0.0.1:${port}:${port}" `
  -v "$env:USERPROFILE\.aws\emulator:/home/emulator/.aws/emulator" `
  aws-emulator -p $port
```

Keep this terminal open while you use the console.

> Publish the port as `127.0.0.1:9297:9297`, as above. Plain `-p 9297:9297` exposes the emulator to your whole network.
</details>

### Step 2: Get the console

```bash
git clone https://github.com/SayedELMASRY2/aws-emulator-console.git
cd aws-emulator-console
```

### Step 3: Run it

**Linux and macOS** (or Git Bash on Windows):

```bash
./start.sh
```

The first run takes a minute: it creates a Python virtual environment, installs boto3 and builds the web app. You should see:

```
Emulator already running on port 9297.
Open http://127.0.0.1:8297
Emulator console: http://127.0.0.1:8297  (emulator: https://127.0.0.1:9297)
```

Open **http://127.0.0.1:8297**. The top bar should say **Emulator running**.

On Linux, if the emulator isn't running, `start.sh` starts it, writes its log to `logs/emulator.log`, and stops it when you press Ctrl+C.

<details>
<summary><b>Manual setup (any OS, including Windows PowerShell)</b></summary>

```bash
# Python side
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt          # Windows: .venv\Scripts\pip install -r requirements.txt

# Web app (once, and after every change to web/)
cd web
npm ci
npm run build
cd ..

# Start the console (the emulator must already be running)
.venv/bin/python server.py                          # Windows: .venv\Scripts\python server.py
```
</details>

### Updating

```bash
git pull
cd web && npm ci && npm run build && cd ..
./start.sh
```

## Your first five minutes

1. **S3.** Open **S3**, then **Create bucket**. Name it, keep the defaults, and choose **Create bucket**. Open the bucket and choose **Upload** to add a CSV file into a folder such as `sales/`.
2. **A real database.** Open **Aurora and RDS**, then **Create database**:
   1. Choose MySQL, and set **Credentials management** to **Self managed** with **Auto generate password**.
   2. Choose **Create database**. Copy the password from the blue notification.
   3. When the status turns **Available**, open the database. **Connectivity & security** shows a command like `mysql -h 127.0.0.1 -P 44855 -u admin -p` that connects to a real MySQL server.
3. **Catalog your data.** In **AWS Glue**:
   1. On **Getting started**, choose **Set up IAM role**.
   2. Go to **Crawlers**, then **Create crawler**. Point it at `s3://<your-bucket>/sales/`, pick the role, and create a new database.
   3. Choose **Run crawler**. The new table appears under **Tables**. Choose **View data** to query it with Athena.
4. **Run an ETL job.** Go to **ETL jobs**, and under **Script editor** choose **Spark**. Read the table with `create_dynamic_frame.from_catalog`, write it back to S3 as CSV, and choose **Run**. The **Runs** tab shows the result.
5. **Look around.** Things the emulator can't do are marked **n/a**, and an emulator note says why.

> The emulator keeps everything in memory. Stopping or restarting it deletes all resources and creates new access keys. The console picks up the new keys automatically.

## Use the AWS CLI and SDKs alongside the console

The console and your code share the same emulator, so resources created in one show up in the other. Point the AWS CLI or any SDK at the emulator (these come from the [official guide](https://docs.aws.amazon.com/emulator/latest/userguide/point-sdk-to-emulator.html)):

```bash
export AWS_ENDPOINT_URL=https://127.0.0.1:9297
export AWS_SHARED_CREDENTIALS_FILE=~/.aws/emulator/9297/emulator_credentials
export AWS_CONFIG_FILE=~/.aws/emulator/9297/config
export AWS_CA_BUNDLE=~/.aws/emulator/9297/ca.pem
export AWS_EC2_METADATA_DISABLED=true
export AWS_DISABLE_HOST_PREFIX_INJECTION=true
export AWS_REGION=us-east-1
export AWS_DEFAULT_REGION=us-east-1
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_PROFILE

aws sts get-caller-identity        # Account 000000000000
aws s3 ls                          # the buckets you created in the console
aws rds describe-db-instances --query 'DBInstances[].[DBInstanceIdentifier,Engine,Endpoint.Port]'
```

For JavaScript SDK v3, also set `NODE_EXTRA_CA_CERTS` to the `ca.pem` path. For Java, use the generated `truststore.p12`.

## Configuration

`start.sh` and `server.py` read these environment variables:

| Variable | Default | Meaning |
|---|---|---|
| `EMULATOR_PORT` | `9297` | Emulator port. The console reads keys from `~/.aws/emulator/<port>/`. |
| `EMULATOR_HOST` | `127.0.0.1` | Emulator host |
| `EMULATOR_REGION` | `us-east-1` | Region used for every call |
| `UI_PORT` | `8297` | Console port |

Example: `EMULATOR_PORT=9300 UI_PORT=8080 ./start.sh`

## How it works

```
Browser (React + Cloudscape)  ── /api/call ──▶  server.py (Python + boto3)  ── HTTPS + SigV4 ──▶  AWS Emulator
```

- **`web/`** is a React + TypeScript single-page app built with Cloudscape. Each service lives in `web/src/pages/<service>/`.
- **`server.py`** is a small Python server. It serves the app and turns `POST /api/call {service, operation, params}` into a boto3 call against the emulator. It reloads the emulator's keys when they change.
- **It's local only:**
  - It binds to `127.0.0.1`.
  - It rejects requests without the `X-Emu-Console` header or with a non-local Origin, so other websites can't drive it.
  - It never calls real AWS.

More detail is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Troubleshooting

| Symptom | Fix |
|---|---|
| Top bar says **Emulator not running** | Start the emulator (`aws-emulator`, or the Docker command), then refresh. On Docker, make sure `~/.aws/emulator` is mounted as shown, because the console reads the keys and certificate from there. |
| `aws-emulator not found` from `start.sh` | Install the emulator (step 1). On macOS/Windows, start the Docker container first; `start.sh` then uses the running emulator. |
| `Address already in use` | Another program uses port 8297. Run `UI_PORT=8080 ./start.sh`. |
| `npm run build` fails | Check `node -v`; Node 20.19+ or 22+ is needed. Delete `web/node_modules` and run `npm ci` again. |
| All my resources disappeared | The emulator was restarted. Its state lives in memory only. |
| **Not supported by the emulator** error | The emulator returns *NotImplemented* for that operation. See [docs/EMULATOR_NOTES.md](docs/EMULATOR_NOTES.md). |
| A Glue job fails with *AccessDenied* or "Script file doesn't exist" | The emulator enforces IAM. Use **Set up IAM role** on Glue's Getting started page, or give the job's role S3 access. |
| Page looks outdated after `git pull` | Rebuild: `cd web && npm run build`, then hard-refresh the browser. |

## FAQ

**Does this touch my real AWS account?**
No. The server only calls the local emulator endpoint, with the throwaway keys the emulator writes on each start. It never reads `~/.aws/credentials`.

**Is it an official AWS tool?**
No. It's an independent open-source project. "AWS" and service names belong to Amazon.

**Does my data survive a restart?**
No. The emulator is in-memory by design.

**Does it work with LocalStack or other emulators?**
It's built and tested against the AWS Emulator. `EMULATOR_HOST` and `EMULATOR_PORT` are configurable, but other emulators use different credentials and certificates, so that's untested.

**Has it been tested on macOS and Windows?**
Development and testing so far were on Linux. macOS and Windows should work with the emulator in Docker, as described above. Reports and fixes are welcome.

## Project structure

```
server.py              Local API bridge (stdlib + boto3) and static file server
start.sh               One-command start: venv, build, emulator, server
requirements.txt       Python dependencies
web/                   The console (React 19 + TypeScript + Vite + Cloudscape)
  src/App.tsx          Shell: top bar, per-service side navigation, breadcrumbs, routes
  src/pages/<service>/ One folder per service (s3, dynamodb, ec2, rds, glue)
static/                First-generation pages for the remaining services (/legacy/)
docs/                  Architecture, status, roadmap, emulator notes, screenshots
AGENTS.md              Instructions for AI coding agents working on the repo
```

## Contributing and roadmap

Contributions are very welcome, especially moving another service to a full console. Next up are **ECS, ECR and EKS**, then MSK, the remaining databases, Lambda and Athena.

- [CONTRIBUTING.md](CONTRIBUTING.md): setup and workflow.
- [docs/ROADMAP.md](docs/ROADMAP.md): what's next, with the planned pages for each service.
- [docs/ADDING_A_SERVICE.md](docs/ADDING_A_SERVICE.md): the probe → plan → build → test → document playbook.
- [docs/STATUS.md](docs/STATUS.md): what each finished service covers and how it was tested.
- [AGENTS.md](AGENTS.md): rules for AI agents (Claude Code, Codex, Cursor and others).

## License

[MIT](LICENSE). The project uses [Cloudscape Design System](https://github.com/cloudscape-design/components) (Apache-2.0) and runs against the [AWS Emulator](https://github.com/aws/aws-emulator).
