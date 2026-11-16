// Service catalog. `legacy: true` services still open the first-version pages under /legacy/.
export type Service = { id: string; name: string; group: string; href: string; legacy?: boolean; description: string };

const L = (id: string, name: string, group: string, path: string, description: string): Service =>
  ({ id, name, group, href: `/legacy/#${path}`, legacy: true, description });

export const SERVICES: Service[] = [
  { id: "s3", name: "S3", group: "Storage", href: "#/s3/buckets", description: "Object storage built to retrieve any amount of data from anywhere" },
  { id: "dynamodb", name: "DynamoDB", group: "Database", href: "#/dynamodb/dashboard", description: "Managed NoSQL database" },
  { id: "rds", name: "Aurora and RDS", group: "Database", href: "#/rds/dashboard", description: "Managed relational database service" },
  L("elasticache", "ElastiCache", "Database", "/elasticache", "In-memory caching"),
  L("redshift", "Redshift", "Database", "/redshift", "Data warehouse"),
  L("docdb", "DocumentDB", "Database", "/docdb", "MongoDB-compatible document database"),
  L("neptune", "Neptune", "Database", "/neptune", "Graph database"),
  { id: "glue", name: "AWS Glue", group: "Analytics", href: "#/glue/getting-started", description: "Data integration and ETL" },
  L("kafka", "MSK (Kafka)", "Analytics", "/kafka", "Managed Apache Kafka"),
  L("athena", "Athena", "Analytics", "/athena", "Query data in S3 with SQL"),
  L("kinesis", "Kinesis Data Streams", "Analytics", "/kinesis", "Real-time data streams"),
  { id: "ec2", name: "EC2", group: "Compute", href: "#/ec2/dashboard", description: "Virtual servers in the cloud" },
  L("lambda", "Lambda", "Compute", "/lambda", "Run code without thinking about servers"),
  { id: "ecs", name: "ECS", group: "Containers", href: "#/ecs/clusters", description: "Highly secure, reliable, and scalable way to run containers" },
  L("ecr", "ECR", "Containers", "/ecr", "Container registry"),
  L("eks", "EKS", "Containers", "/eks", "Managed Kubernetes"),
  L("sqs", "SQS", "Application Integration", "/sqs", "Message queues"),
  L("sns", "SNS", "Application Integration", "/sns", "Pub/sub messaging"),
  L("events", "EventBridge", "Application Integration", "/events", "Serverless event bus"),
  L("sfn", "Step Functions", "Application Integration", "/stepfunctions", "Visual workflows"),
  L("iam", "IAM", "Security, Identity & Compliance", "/iam", "Manage access to AWS resources"),
  L("secrets", "Secrets Manager", "Security, Identity & Compliance", "/secrets", "Rotate and manage secrets"),
  L("ssm", "Parameter Store", "Management & Governance", "/ssm", "Configuration values"),
  L("logs", "CloudWatch Logs", "Management & Governance", "/logs", "Log groups and events"),
  L("cfn", "CloudFormation", "Management & Governance", "/cloudformation", "Infrastructure as code"),
  L("explorer", "API Explorer", "Tools", "/explorer", "Call any operation of any service"),
];
