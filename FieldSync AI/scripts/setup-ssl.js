#!/usr/bin/env node

/**
 * SSL Setup Script for FieldSync AI
 * 
 * This script helps set up SSL certificates for development and production environments.
 * It can generate self-signed certificates for development or help configure production certificates.
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

class SSLSetup {
  constructor() {
    this.sslDir = path.join(__dirname, '..', 'ssl');
    this.configDir = path.join(__dirname, '..', 'config');
  }

  async run() {
    console.log('🔐 FieldSync AI SSL Setup');
    console.log('========================\n');

    try {
      // Ensure SSL directory exists
      if (!fs.existsSync(this.sslDir)) {
        fs.mkdirSync(this.sslDir, { recursive: true });
        console.log('✅ Created SSL directory');
      }

      const environment = await question('Select environment (development/production): ');
      
      if (environment.toLowerCase() === 'development') {
        await this.setupDevelopment();
      } else if (environment.toLowerCase() === 'production') {
        await this.setupProduction();
      } else {
        console.log('❌ Invalid environment. Please choose "development" or "production"');
        process.exit(1);
      }

    } catch (error) {
      console.error('❌ SSL setup failed:', error.message);
      process.exit(1);
    } finally {
      rl.close();
    }
  }

  async setupDevelopment() {
    console.log('\n🛠️  Setting up development SSL certificates...\n');

    const domain = await question('Enter domain (default: localhost): ') || 'localhost';
    const organization = await question('Enter organization (default: FieldSync AI): ') || 'FieldSync AI';

    try {
      // Check if OpenSSL is available
      execSync('openssl version', { stdio: 'ignore' });
    } catch (error) {
      console.log('❌ OpenSSL not found. Please install OpenSSL first.');
      console.log('Windows: Download from https://slproweb.com/products/Win32OpenSSL.html');
      console.log('macOS: brew install openssl');
      console.log('Linux: sudo apt-get install openssl');
      process.exit(1);
    }

    // Generate CA private key
    console.log('📝 Generating CA private key...');
    execSync(`openssl genrsa -out "${path.join(this.sslDir, 'ca-key.pem')}" 4096`, { stdio: 'inherit' });

    // Generate CA certificate
    console.log('📝 Generating CA certificate...');
    execSync(`openssl req -new -x509 -days 365 -key "${path.join(this.sslDir, 'ca-key.pem')}" -out "${path.join(this.sslDir, 'ca-cert.pem')}" -subj "/C=US/ST=CA/L=San Francisco/O=${organization}/CN=${organization} CA"`, { stdio: 'inherit' });

    // Generate server private key
    console.log('📝 Generating server private key...');
    execSync(`openssl genrsa -out "${path.join(this.sslDir, 'server-key.pem')}" 4096`, { stdio: 'inherit' });

    // Generate server certificate signing request
    console.log('📝 Generating server certificate signing request...');
    execSync(`openssl req -new -key "${path.join(this.sslDir, 'server-key.pem')}" -out "${path.join(this.sslDir, 'server-csr.pem')}" -subj "/C=US/ST=CA/L=San Francisco/O=${organization}/CN=${domain}"`, { stdio: 'inherit' });

    // Generate server certificate
    console.log('📝 Generating server certificate...');
    execSync(`openssl x509 -req -days 365 -in "${path.join(this.sslDir, 'server-csr.pem')}" -CA "${path.join(this.sslDir, 'ca-cert.pem')}" -CAkey "${path.join(this.sslDir, 'ca-key.pem')}" -CAcreateserial -out "${path.join(this.sslDir, 'server-cert.pem')}"`, { stdio: 'inherit' });

    // Set appropriate permissions
    if (process.platform !== 'win32') {
      execSync(`chmod 600 "${path.join(this.sslDir, '*.pem')}"`, { stdio: 'inherit' });
    }

    // Update .env file
    await this.updateEnvFile({
      SSL_ENABLED: 'true',
      SSL_CERT_PATH: path.join(this.sslDir, 'server-cert.pem'),
      SSL_KEY_PATH: path.join(this.sslDir, 'server-key.pem'),
      SSL_CA_PATH: path.join(this.sslDir, 'ca-cert.pem')
    });

    console.log('\n✅ Development SSL certificates generated successfully!');
    console.log('\n📋 Next steps:');
    console.log('1. Install the CA certificate in your browser/system trust store');
    console.log(`   CA Certificate: ${path.join(this.sslDir, 'ca-cert.pem')}`);
    console.log('2. Start your server with SSL enabled');
    console.log(`3. Access your app at https://${domain}:3000`);
    console.log('\n⚠️  These certificates are for development only!');
  }

  async setupProduction() {
    console.log('\n🏭 Setting up production SSL certificates...\n');

    const method = await question('Choose certificate method (letsencrypt/custom/aws): ');

    switch (method.toLowerCase()) {
      case 'letsencrypt':
        await this.setupLetsEncrypt();
        break;
      case 'custom':
        await this.setupCustomCertificates();
        break;
      case 'aws':
        await this.setupAWSCertificates();
        break;
      default:
        console.log('❌ Invalid method. Please choose "letsencrypt", "custom", or "aws"');
        process.exit(1);
    }
  }

  async setupLetsEncrypt() {
    console.log('\n🔒 Setting up Let\'s Encrypt certificates...\n');

    const domain = await question('Enter your domain: ');
    const email = await question('Enter your email: ');

    console.log('\n📋 Let\'s Encrypt setup instructions:');
    console.log('1. Install Certbot:');
    console.log('   Ubuntu/Debian: sudo apt-get install certbot');
    console.log('   CentOS/RHEL: sudo yum install certbot');
    console.log('   macOS: brew install certbot');
    console.log('\n2. Generate certificates:');
    console.log(`   sudo certbot certonly --standalone -d ${domain} --email ${email} --agree-tos`);
    console.log('\n3. Certificates will be saved to:');
    console.log(`   /etc/letsencrypt/live/${domain}/fullchain.pem`);
    console.log(`   /etc/letsencrypt/live/${domain}/privkey.pem`);
    console.log('\n4. Set up auto-renewal:');
    console.log('   sudo crontab -e');
    console.log('   Add: 0 12 * * * /usr/bin/certbot renew --quiet');

    await this.updateEnvFile({
      SSL_ENABLED: 'true',
      SSL_CERT_PATH: `/etc/letsencrypt/live/${domain}/fullchain.pem`,
      SSL_KEY_PATH: `/etc/letsencrypt/live/${domain}/privkey.pem`
    });

    console.log('\n✅ Let\'s Encrypt configuration updated in .env file');
  }

  async setupCustomCertificates() {
    console.log('\n📜 Setting up custom certificates...\n');

    const certPath = await question('Enter path to certificate file (.crt or .pem): ');
    const keyPath = await question('Enter path to private key file (.key or .pem): ');
    const caPath = await question('Enter path to CA bundle (optional, press Enter to skip): ');

    // Validate files exist
    if (!fs.existsSync(certPath)) {
      throw new Error(`Certificate file not found: ${certPath}`);
    }
    if (!fs.existsSync(keyPath)) {
      throw new Error(`Private key file not found: ${keyPath}`);
    }
    if (caPath && !fs.existsSync(caPath)) {
      throw new Error(`CA bundle file not found: ${caPath}`);
    }

    const envUpdates = {
      SSL_ENABLED: 'true',
      SSL_CERT_PATH: certPath,
      SSL_KEY_PATH: keyPath
    };

    if (caPath) {
      envUpdates.SSL_CA_PATH = caPath;
    }

    await this.updateEnvFile(envUpdates);

    console.log('\n✅ Custom certificate configuration updated in .env file');
  }

  async setupAWSCertificates() {
    console.log('\n☁️  Setting up AWS Certificate Manager...\n');

    console.log('📋 AWS ACM setup instructions:');
    console.log('1. Go to AWS Certificate Manager in your AWS Console');
    console.log('2. Request a public certificate');
    console.log('3. Add your domain name(s)');
    console.log('4. Choose DNS validation (recommended)');
    console.log('5. Add the CNAME records to your DNS');
    console.log('6. Wait for validation to complete');
    console.log('\n7. For Application Load Balancer:');
    console.log('   - Attach the certificate to your ALB');
    console.log('   - Configure HTTPS listener on port 443');
    console.log('   - Set up HTTP to HTTPS redirect');
    console.log('\n8. For CloudFront:');
    console.log('   - Attach the certificate to your distribution');
    console.log('   - Configure viewer protocol policy');

    const useALB = await question('Are you using Application Load Balancer? (y/n): ');

    if (useALB.toLowerCase() === 'y') {
      await this.updateEnvFile({
        SSL_ENABLED: 'false', // ALB handles SSL termination
        TRUST_PROXY: 'true',
        FORCE_HTTPS: 'true'
      });
      console.log('\n✅ Configuration updated for ALB SSL termination');
    } else {
      console.log('\n⚠️  For direct EC2 deployment, you\'ll need to export certificates from ACM');
      console.log('   or use Let\'s Encrypt instead.');
    }
  }

  async updateEnvFile(updates) {
    const envPath = path.join(__dirname, '..', '.env');
    let envContent = '';

    // Read existing .env file if it exists
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }

    // Update or add environment variables
    for (const [key, value] of Object.entries(updates)) {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      const line = `${key}=${value}`;

      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, line);
      } else {
        envContent += `\n${line}`;
      }
    }

    // Write updated content
    fs.writeFileSync(envPath, envContent.trim() + '\n');
  }
}

// Run the setup if called directly
if (require.main === module) {
  const setup = new SSLSetup();
  setup.run().catch(console.error);
}

module.exports = SSLSetup;