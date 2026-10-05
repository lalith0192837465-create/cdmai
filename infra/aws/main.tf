data "aws_availability_zones" "available" { state = "available" }

resource "aws_vpc" "this" { cidr_block = var.vpc_cidr enable_dns_hostnames = true enable_dns_support = true tags = { Name = "${var.project_name}-vpc" } }
resource "aws_internet_gateway" "this" { vpc_id = aws_vpc.this.id }
resource "aws_subnet" "public" { count = 2 vpc_id = aws_vpc.this.id cidr_block = var.public_subnet_cidrs[count.index] availability_zone = data.aws_availability_zones.available.names[count.index] map_public_ip_on_launch = true tags = { Name = "${var.project_name}-public-${count.index + 1}" } }
resource "aws_subnet" "private" { count = 2 vpc_id = aws_vpc.this.id cidr_block = var.private_subnet_cidrs[count.index] availability_zone = data.aws_availability_zones.available.names[count.index] tags = { Name = "${var.project_name}-private-${count.index + 1}" } }
resource "aws_route_table" "public" { vpc_id = aws_vpc.this.id route { cidr_block = "0.0.0.0/0" gateway_id = aws_internet_gateway.this.id } }
resource "aws_route_table_association" "public" { count = 2 subnet_id = aws_subnet.public[count.index].id route_table_id = aws_route_table.public.id }
resource "aws_eip" "nat" { domain = "vpc" }
resource "aws_nat_gateway" "this" { allocation_id = aws_eip.nat.id subnet_id = aws_subnet.public[0].id depends_on = [aws_internet_gateway.this] }
resource "aws_route_table" "private" { vpc_id = aws_vpc.this.id route { cidr_block = "0.0.0.0/0" nat_gateway_id = aws_nat_gateway.this.id } }
resource "aws_route_table_association" "private" { count = 2 subnet_id = aws_subnet.private[count.index].id route_table_id = aws_route_table.private.id }

resource "aws_ecr_repository" "app" { name = var.project_name image_scanning_configuration { scan_on_push = true } force_delete = false }
resource "aws_cloudwatch_log_group" "app" { name = "/ecs/${var.project_name}" retention_in_days = 30 }

resource "aws_db_subnet_group" "this" { name = var.project_name subnet_ids = aws_subnet.private[*].id }
resource "aws_security_group" "db" { name = "${var.project_name}-db" vpc_id = aws_vpc.this.id ingress { from_port = 5432 to_port = 5432 protocol = "tcp" security_groups = [aws_security_group.app.id] } egress { from_port = 0 to_port = 0 protocol = "-1" cidr_blocks = ["0.0.0.0/0"] } }
resource "aws_db_instance" "this" { identifier = var.project_name engine = "postgres" engine_version = "16" instance_class = var.db_instance_class allocated_storage = 20 storage_encrypted = true db_name = var.db_name username = var.db_username password = var.db_password db_subnet_group_name = aws_db_subnet_group.this.name vpc_security_group_ids = [aws_security_group.db.id] skip_final_snapshot = false deletion_protection = true publicly_accessible = false backup_retention_period = 7 }

resource "aws_secretsmanager_secret" "app" { name = "${var.project_name}/application" }
resource "aws_secretsmanager_secret_version" "app" { secret_id = aws_secretsmanager_secret.app.id secret_string = jsonencode({ DATABASE_URL = "postgresql://${var.db_username}:${var.db_password}@${aws_db_instance.this.address}:5432/${var.db_name}" NEXTAUTH_SECRET = var.nextauth_secret NEXTAUTH_URL = var.nextauth_url GOOGLE_CLIENT_ID = var.google_client_id GOOGLE_CLIENT_SECRET = var.google_client_secret RECALL_API_KEY = var.recall_api_key RECALL_REGION = var.recall_region GEMINI_API_KEY = var.gemini_api_key
    ANTHROPIC_API_KEY = var.anthropic_api_key SLACK_WEBHOOK_URL = var.slack_webhook_url WEBHOOK_SECRET = var.webhook_secret NODE_ENV = "production" }) }

resource "aws_security_group" "alb" { name = "${var.project_name}-alb" vpc_id = aws_vpc.this.id ingress { from_port = 80 to_port = 80 protocol = "tcp" cidr_blocks = ["0.0.0.0/0"] } egress { from_port = 0 to_port = 0 protocol = "-1" cidr_blocks = ["0.0.0.0/0"] } }
resource "aws_security_group" "app" { name = "${var.project_name}-app" vpc_id = aws_vpc.this.id ingress { from_port = var.app_port to_port = var.app_port protocol = "tcp" security_groups = [aws_security_group.alb.id] } egress { from_port = 0 to_port = 0 protocol = "-1" cidr_blocks = ["0.0.0.0/0"] } }
resource "aws_lb" "this" { name = var.project_name internal = false load_balancer_type = "application" security_groups = [aws_security_group.alb.id] subnets = aws_subnet.public[*].id }
resource "aws_lb_target_group" "app" { name = var.project_name port = var.app_port protocol = "HTTP" vpc_id = aws_vpc.this.id target_type = "ip" health_check { path = "/api/health" matcher = "200" } }
resource "aws_lb_listener" "http" { load_balancer_arn = aws_lb.this.arn port = 80 protocol = "HTTP" default_action { type = "forward" target_group_arn = aws_lb_target_group.app.arn } }

resource "aws_ecs_cluster" "this" { name = var.project_name }
resource "aws_iam_role" "execution" { name = "${var.project_name}-ecs-execution" assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Principal = { Service = "ecs-tasks.amazonaws.com" }, Action = "sts:AssumeRole" }] }) }
resource "aws_iam_role_policy_attachment" "execution" { role = aws_iam_role.execution.name policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy" }
resource "aws_iam_role_policy" "secrets" { role = aws_iam_role.execution.id policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Action = ["secretsmanager:GetSecretValue"], Resource = aws_secretsmanager_secret.app.arn }] }) }
resource "aws_ecs_task_definition" "app" { family = var.project_name requires_compatibilities = ["FARGATE"] network_mode = "awsvpc" cpu = "512" memory = "1024" execution_role_arn = aws_iam_role.execution.arn container_definitions = jsonencode([{ name = var.project_name image = var.image_uri essential = true portMappings = [{ containerPort = var.app_port }] logConfiguration = { logDriver = "awslogs", options = { awslogs-group = aws_cloudwatch_log_group.app.name awslogs-region = var.aws_region awslogs-stream-prefix = "app" } } secrets = [for key in ["DATABASE_URL","NEXTAUTH_SECRET","NEXTAUTH_URL","GOOGLE_CLIENT_ID","GOOGLE_CLIENT_SECRET","RECALL_API_KEY","RECALL_REGION","ANTHROPIC_API_KEY","SLACK_WEBHOOK_URL","WEBHOOK_SECRET","NODE_ENV"] : { name = key valueFrom = "${aws_secretsmanager_secret.app.arn}:${key}::" }] }]) }
resource "aws_ecs_service" "app" { name = var.project_name cluster = aws_ecs_cluster.this.id task_definition = aws_ecs_task_definition.app.arn desired_count = 1 launch_type = "FARGATE" network_configuration { subnets = aws_subnet.private[*].id security_groups = [aws_security_group.app.id] assign_public_ip = false } load_balancer { target_group_arn = aws_lb_target_group.app.arn container_name = var.project_name container_port = var.app_port } depends_on = [aws_lb_listener.http] }
