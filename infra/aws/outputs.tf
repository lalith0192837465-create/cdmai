output "application_url" { value = "http://${aws_lb.this.dns_name}" }
output "ecr_repository_url" { value = aws_ecr_repository.app.repository_url }
output "rds_endpoint" { value = aws_db_instance.this.address sensitive = true }
