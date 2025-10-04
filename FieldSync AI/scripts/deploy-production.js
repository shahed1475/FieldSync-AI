#!/usr/bin/env node

/**
 * Production Deployment Script for FieldSync AI
 * 
 * This script helps deploy FieldSync AI to various cloud platforms
 * with proper environment configuration and SSL setup.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

class ProductionDeployer {
  constructor() {
    this.projectRoot = path.join(__dirname, '..');
    this.envFiles = {
      production: path.join(this.projectRoot, '.env.production'),
      staging: path.join(this.projectRoot, '.env.staging')
    };
  }

  async run() {
    console.log('🚀 FieldSync AI Production Deployment');
    console.log('=====================================\n');

    try {
      const platform = await question('Select deployment platform (aws/docker/manual): ');
      
      switch (platform.toLowerCase()) {
        case 'aws':
          await this.deployToAWS();
          break;
        case 'docker':
          await this.deployWithDocker();
          break;
        case 'manual':
          await this.manualDeployment();
          break;
        default:
          console.log('❌ Invalid platform. Please choose "aws", "docker", or "manual"');
          process.exit(1);
      }

    } catch (error) {
      console.error('❌ Deployment failed:', error.message);
      process.exit(1);
    } finally {
      rl.close();
    }
  }

  async deployToAWS() {
    console.log('\n☁️  AWS Deployment Setup\n');

    const service = await question('Select AWS service (ecs/ec2/lambda): ');
    
    switch (service.toLowerCase()) {
      case 'ecs':
        await this.deployToECS();
        break;
      case 'ec2':
        await this.deployToEC2();
        break;
      case 'lambda':
        await this.deployToLambda();
        break;
      default:
        console.log('❌ Invalid AWS service. Please choose "ecs", "ec2", or "lambda"');
        process.exit(1);
    }
  }

  async deployToECS() {
    console.log('\n🐳 AWS ECS Deployment\n');

    // Check AWS CLI
    try {
      execSync('aws --version', { stdio: 'ignore' });
    } catch (error) {
      console.log('❌ AWS CLI not found. Please install AWS CLI first.');
      console.log('Visit: https://aws.amazon.com/cli/');
      process.exit(1);
    }

    const region = await question('Enter AWS region (default: us-east-1): ') || 'us-east-1';
    const clusterName = await question('Enter ECS cluster name (default: fieldsync-cluster): ') || 'fieldsync-cluster';
    const serviceName = await question('Enter ECS service name (default: fieldsync-service): ') || 'fieldsync-service';

    console.log('\n📋 ECS Deployment Steps:');
    console.log('1. Create ECR repositories:');
    console.log(`   aws ecr create-repository --repository-name fieldsync-backend --region ${region}`);
    console.log(`   aws ecr create-repository --repository-name fieldsync-frontend --region ${region}`);

    console.log('\n2. Build and push Docker images:');
    console.log(`   aws ecr get-login-password --region ${region} | docker login --username AWS --password-stdin <account-id>.dkr.ecr.${region}.amazonaws.com`);
    console.log('   docker build -t fieldsync-backend .');
    console.log(`   docker tag fieldsync-backend:latest <account-id>.dkr.ecr.${region}.amazonaws.com/fieldsync-backend:latest`);
    console.log(`   docker push <account-id>.dkr.ecr.${region}.amazonaws.com/fieldsync-backend:latest`);

    console.log('\n3. Create ECS task definition and service');
    console.log('\n4. Set up Application Load Balancer');
    console.log('\n5. Configure RDS and ElastiCache');

    // Generate ECS task definition
    await this.generateECSTaskDefinition(region);

    console.log('\n✅ ECS deployment configuration generated!');
    console.log('📁 Check the generated files in ./aws/ directory');
  }

  async deployToEC2() {
    console.log('\n🖥️  AWS EC2 Deployment\n');

    const instanceType = await question('Enter EC2 instance type (default: t3.medium): ') || 't3.medium';
    const keyPair = await question('Enter EC2 key pair name: ');

    console.log('\n📋 EC2 Deployment Steps:');
    console.log('1. Launch EC2 instance with Docker installed');
    console.log('2. Set up security groups (ports 80, 443, 22)');
    console.log('3. Install Docker and Docker Compose');
    console.log('4. Clone repository and configure environment');
    console.log('5. Set up SSL certificates (Let\'s Encrypt)');
    console.log('6. Start services with Docker Compose');

    // Generate EC2 user data script
    await this.generateEC2UserData();

    console.log('\n✅ EC2 deployment script generated!');
    console.log('📁 Check ./aws/ec2-user-data.sh for the startup script');
  }

  async deployToLambda() {
    console.log('\n⚡ AWS Lambda Deployment\n');
    console.log('⚠️  Note: Lambda is suitable for API-only deployments');
    console.log('For full-stack applications, consider ECS or EC2 instead.\n');

    const runtime = await question('Enter Lambda runtime (default: nodejs18.x): ') || 'nodejs18.x';
    const functionName = await question('Enter function name (default: fieldsync-api): ') || 'fieldsync-api';

    console.log('\n📋 Lambda Deployment Steps:');
    console.log('1. Install Serverless Framework or AWS SAM');
    console.log('2. Configure serverless.yml or template.yaml');
    console.log('3. Set up API Gateway');
    console.log('4. Configure RDS Proxy for database connections');
    console.log('5. Deploy with: serverless deploy or sam deploy');

    // Generate serverless configuration
    await this.generateServerlessConfig(runtime, functionName);

    console.log('\n✅ Serverless configuration generated!');
    console.log('📁 Check ./aws/serverless.yml');
  }

  async deployWithDocker() {
    console.log('\n🐳 Docker Deployment\n');

    const environment = await question('Select environment (production/staging): ');
    const useSwarm = await question('Use Docker Swarm? (y/n): ');

    // Validate environment files
    const envFile = this.envFiles[environment];
    if (!fs.existsSync(envFile)) {
      console.log(`❌ Environment file not found: ${envFile}`);
      console.log('Please create the environment file first.');
      process.exit(1);
    }

    console.log('\n📋 Docker Deployment Steps:');
    console.log('1. Build production images:');
    console.log('   npm run docker:build:prod');

    console.log('\n2. Start services:');
    if (useSwarm.toLowerCase() === 'y') {
      console.log('   docker swarm init');
      console.log('   docker stack deploy -c docker-compose.yml -c docker-compose.prod.yml fieldsync');
    } else {
      console.log(`   docker-compose -f docker-compose.yml -f docker-compose.prod.yml --env-file ${envFile} up -d`);
    }

    console.log('\n3. Verify deployment:');
    console.log('   docker-compose ps');
    console.log('   curl http://localhost/health');

    if (useSwarm.toLowerCase() === 'y') {
      await this.generateDockerSwarmConfig();
    }

    console.log('\n✅ Docker deployment configuration ready!');
  }

  async manualDeployment() {
    console.log('\n🔧 Manual Deployment Guide\n');

    const serverType = await question('Server type (ubuntu/centos/debian): ');
    const useNginx = await question('Use Nginx reverse proxy? (y/n): ');
    const usePM2 = await question('Use PM2 process manager? (y/n): ');

    console.log('\n📋 Manual Deployment Steps:');

    // Server setup
    console.log('\n1. Server Setup:');
    if (serverType === 'ubuntu' || serverType === 'debian') {
      console.log('   sudo apt update && sudo apt upgrade -y');
      console.log('   sudo apt install -y nodejs npm postgresql redis-server');
    } else if (serverType === 'centos') {
      console.log('   sudo yum update -y');
      console.log('   sudo yum install -y nodejs npm postgresql-server redis');
    }

    // Node.js and dependencies
    console.log('\n2. Install Node.js and dependencies:');
    console.log('   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -');
    console.log('   sudo apt-get install -y nodejs');
    console.log('   npm install -g npm@latest');

    // Application setup
    console.log('\n3. Application Setup:');
    console.log('   git clone <your-repo-url> /opt/fieldsync');
    console.log('   cd /opt/fieldsync');
    console.log('   npm install --production');
    console.log('   cp .env.production .env');
    console.log('   # Edit .env with your production values');

    // Database setup
    console.log('\n4. Database Setup:');
    console.log('   sudo -u postgres createdb fieldsync_production');
    console.log('   sudo -u postgres psql -c "CREATE USER fieldsync_app WITH PASSWORD \'your_password\';"');
    console.log('   sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE fieldsync_production TO fieldsync_app;"');

    // Process manager
    if (usePM2.toLowerCase() === 'y') {
      console.log('\n5. PM2 Setup:');
      console.log('   npm install -g pm2');
      console.log('   pm2 start ecosystem.config.js --env production');
      console.log('   pm2 startup');
      console.log('   pm2 save');

      await this.generatePM2Config();
    }

    // Nginx setup
    if (useNginx.toLowerCase() === 'y') {
      console.log('\n6. Nginx Setup:');
      console.log('   sudo apt install -y nginx');
      console.log('   sudo cp nginx/nginx.conf /etc/nginx/sites-available/fieldsync');
      console.log('   sudo ln -s /etc/nginx/sites-available/fieldsync /etc/nginx/sites-enabled/');
      console.log('   sudo nginx -t && sudo systemctl reload nginx');
    }

    // SSL setup
    console.log('\n7. SSL Setup:');
    console.log('   sudo apt install -y certbot python3-certbot-nginx');
    console.log('   sudo certbot --nginx -d your-domain.com');

    console.log('\n✅ Manual deployment guide generated!');
  }

  async generateECSTaskDefinition(region) {
    const awsDir = path.join(this.projectRoot, 'aws');
    if (!fs.existsSync(awsDir)) {
      fs.mkdirSync(awsDir, { recursive: true });
    }

    const taskDefinition = {
      family: 'fieldsync-task',
      networkMode: 'awsvpc',
      requiresCompatibilities: ['FARGATE'],
      cpu: '1024',
      memory: '2048',
      executionRoleArn: 'arn:aws:iam::ACCOUNT_ID:role/ecsTaskExecutionRole',
      taskRoleArn: 'arn:aws:iam::ACCOUNT_ID:role/ecsTaskRole',
      containerDefinitions: [
        {
          name: 'fieldsync-backend',
          image: `ACCOUNT_ID.dkr.ecr.${region}.amazonaws.com/fieldsync-backend:latest`,
          portMappings: [
            {
              containerPort: 3000,
              protocol: 'tcp'
            }
          ],
          environment: [
            { name: 'NODE_ENV', value: 'production' },
            { name: 'PORT', value: '3000' }
          ],
          secrets: [
            {
              name: 'DATABASE_URL',
              valueFrom: 'arn:aws:secretsmanager:REGION:ACCOUNT_ID:secret:fieldsync/database-url'
            }
          ],
          logConfiguration: {
            logDriver: 'awslogs',
            options: {
              'awslogs-group': '/ecs/fieldsync',
              'awslogs-region': region,
              'awslogs-stream-prefix': 'ecs'
            }
          },
          healthCheck: {
            command: ['CMD-SHELL', 'curl -f http://localhost:3000/health || exit 1'],
            interval: 30,
            timeout: 5,
            retries: 3,
            startPeriod: 60
          }
        }
      ]
    };

    fs.writeFileSync(
      path.join(awsDir, 'task-definition.json'),
      JSON.stringify(taskDefinition, null, 2)
    );
  }

  async generateEC2UserData() {
    const awsDir = path.join(this.projectRoot, 'aws');
    if (!fs.existsSync(awsDir)) {
      fs.mkdirSync(awsDir, { recursive: true });
    }

    const userDataScript = `#!/bin/bash
# EC2 User Data Script for FieldSync AI

# Update system
yum update -y

# Install Docker
amazon-linux-extras install docker -y
systemctl start docker
systemctl enable docker
usermod -a -G docker ec2-user

# Install Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Install Git
yum install -y git

# Clone repository
cd /opt
git clone https://github.com/your-username/fieldsync-ai.git
cd fieldsync-ai

# Set up environment
cp .env.production .env
# TODO: Update .env with actual production values

# Start services
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Set up log rotation
cat > /etc/logrotate.d/fieldsync << EOF
/opt/fieldsync-ai/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    copytruncate
}
EOF

echo "FieldSync AI deployment completed!"
`;

    fs.writeFileSync(path.join(awsDir, 'ec2-user-data.sh'), userDataScript);
  }

  async generateServerlessConfig(runtime, functionName) {
    const awsDir = path.join(this.projectRoot, 'aws');
    if (!fs.existsSync(awsDir)) {
      fs.mkdirSync(awsDir, { recursive: true });
    }

    const serverlessConfig = `service: fieldsync-api

provider:
  name: aws
  runtime: ${runtime}
  stage: \${opt:stage, 'production'}
  region: \${opt:region, 'us-east-1'}
  environment:
    NODE_ENV: production
    DATABASE_URL: \${ssm:/fieldsync/\${self:provider.stage}/database-url}
    JWT_SECRET: \${ssm:/fieldsync/\${self:provider.stage}/jwt-secret~true}
  iamRoleStatements:
    - Effect: Allow
      Action:
        - rds-data:*
      Resource: "*"

functions:
  api:
    handler: lambda.handler
    events:
      - http:
          path: /{proxy+}
          method: ANY
          cors: true
    timeout: 30
    memorySize: 1024

plugins:
  - serverless-offline
  - serverless-webpack

custom:
  webpack:
    webpackConfig: ./webpack.config.js
    includeModules: true
`;

    fs.writeFileSync(path.join(awsDir, 'serverless.yml'), serverlessConfig);

    // Generate Lambda handler
    const lambdaHandler = `const serverless = require('serverless-http');
const app = require('../server');

module.exports.handler = serverless(app);
`;

    fs.writeFileSync(path.join(this.projectRoot, 'lambda.js'), lambdaHandler);
  }

  async generateDockerSwarmConfig() {
    const swarmConfig = `version: '3.8'

services:
  backend:
    image: fieldsync-backend:latest
    deploy:
      replicas: 3
      update_config:
        parallelism: 1
        delay: 10s
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
    networks:
      - fieldsync-network
    secrets:
      - database_url
      - jwt_secret

  frontend:
    image: fieldsync-frontend:latest
    deploy:
      replicas: 2
      update_config:
        parallelism: 1
        delay: 10s
      restart_policy:
        condition: on-failure
    networks:
      - fieldsync-network

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    deploy:
      replicas: 2
      placement:
        constraints:
          - node.role == manager
    networks:
      - fieldsync-network
    configs:
      - source: nginx_config
        target: /etc/nginx/nginx.conf

networks:
  fieldsync-network:
    driver: overlay
    attachable: true

secrets:
  database_url:
    external: true
  jwt_secret:
    external: true

configs:
  nginx_config:
    file: ./nginx/nginx.conf
`;

    fs.writeFileSync(path.join(this.projectRoot, 'docker-compose.swarm.yml'), swarmConfig);
  }

  async generatePM2Config() {
    const pm2Config = {
      apps: [
        {
          name: 'fieldsync-api',
          script: 'server.js',
          instances: 'max',
          exec_mode: 'cluster',
          env: {
            NODE_ENV: 'development',
            PORT: 3000
          },
          env_production: {
            NODE_ENV: 'production',
            PORT: 3000
          },
          log_date_format: 'YYYY-MM-DD HH:mm Z',
          error_file: './logs/pm2-error.log',
          out_file: './logs/pm2-out.log',
          log_file: './logs/pm2-combined.log',
          time: true,
          max_memory_restart: '1G',
          node_args: '--max-old-space-size=1024'
        }
      ]
    };

    fs.writeFileSync(
      path.join(this.projectRoot, 'ecosystem.config.js'),
      `module.exports = ${JSON.stringify(pm2Config, null, 2)};`
    );
  }
}

// Run the deployer if called directly
if (require.main === module) {
  const deployer = new ProductionDeployer();
  deployer.run().catch(console.error);
}

module.exports = ProductionDeployer;