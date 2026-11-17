// Service catalog. `legacy: true` services still open the first-version pages under /legacy/.
export type Service = { id: string; name: string; group: string; href: string; legacy?: boolean; description: string };

const L = (id: string, name: string, group: string, path: string, description: string): Service =>
  ({ id, name, group, href: `/legacy/#${path}`, legacy: true, description });

export const SERVICES: Service[] = [
  { id: "s3", name: "S3", group: "Storage", href: "#/s3/buckets", description: "Object storage built to retrieve any amount of data from anywhere" },
  { id: "dynamodb", name: "DynamoDB", group: "Database", href: "#/dynamodb/dashboard", description: "Managed NoSQL database" },
  { id: "rds", name: "Aurora and RDS", group: "Database", href: "#/rds/dashboard", description: "Managed relational database service" },
  { id: "elasticache", name: "ElastiCache", group: "Database", href: "#/elasticache/dashboard", description: "In-memory caching service for Redis, Valkey, and Memcached" },
  L("redshift", "Redshift", "Database", "/redshift", "Data warehouse"),
  L("docdb", "DocumentDB", "Database", "/docdb", "MongoDB-compatible document database"),
  L("neptune", "Neptune", "Database", "/neptune", "Graph database"),
  { id: "glue", name: "AWS Glue", group: "Analytics", href: "#/glue/getting-started", description: "Data integration and ETL" },
  { id: "kafka", name: "Amazon MSK", group: "Analytics", href: "#/msk/clusters", description: "Fully managed Apache Kafka service" },
  { id: "athena", name: "Athena", group: "Analytics", href: "#/athena/query-editor", description: "Interactive SQL query service to analyze data in S3" },
  L("kinesis", "Kinesis Data Streams", "Analytics", "/kinesis", "Real-time data streams"),
  { id: "ec2", name: "EC2", group: "Compute", href: "#/ec2/dashboard", description: "Virtual servers in the cloud" },
  { id: "lambda", name: "Lambda", group: "Compute", href: "#/lambda/functions", description: "Run code without thinking about servers or clusters" },
  { id: "ecs", name: "ECS", group: "Containers", href: "#/ecs/clusters", description: "Highly secure, reliable, and scalable way to run containers" },
  { id: "ecr", name: "ECR", group: "Containers", href: "#/ecr/repositories", description: "Easily store, manage, and deploy container images" },
  { id: "eks", name: "EKS", group: "Containers", href: "#/eks/clusters", description: "Start, run, and scale Kubernetes applications" },
  { id: "sqs", name: "SQS", group: "Application Integration", href: "#/sqs/queues", description: "Fully managed message queuing service" },
  { id: "sns", name: "SNS", group: "Application Integration", href: "#/sns/topics", description: "Pub/sub messaging and mobile notifications" },
  { id: "events", name: "EventBridge", group: "Application Integration", href: "#/events/rules", description: "Serverless event bus for event-driven architectures" },
  { id: "sfn", name: "Step Functions", group: "Application Integration", href: "#/stepfunctions/state-machines", description: "Visual workflows for distributed applications" },
  { id: "iam", name: "IAM", group: "Security, Identity & Compliance", href: "#/iam/dashboard", description: "Manage access to AWS resources and identities" },
  { id: "secrets", name: "Secrets Manager", group: "Security, Identity & Compliance", href: "#/secrets", description: "Rotate, manage, and retrieve database credentials and API keys" },
  { id: "ssm", name: "Parameter Store", group: "Management & Governance", href: "#/ssm/parameters", description: "Secure, hierarchical storage for configuration data and secrets management" },
  L("logs", "CloudWatch Logs", "Management & Governance", "/logs", "Log groups and events"),
  L("cfn", "CloudFormation", "Management & Governance", "/cloudformation", "Infrastructure as code"),
  L("explorer", "API Explorer", "Tools", "/explorer", "Call any operation of any service"),
];
