# SSL Certificate Setup for FieldSync AI

This directory contains SSL certificate generation scripts and certificates for FieldSync AI development and production environments.

## 🔐 Certificate Types

### Development Certificates (Self-Signed)
- **Purpose**: Local development and testing
- **Validity**: 365 days
- **Domains**: localhost, 127.0.0.1, fieldsync.local, api.fieldsync.local, app.fieldsync.local
- **Security**: Not trusted by browsers (requires manual acceptance)

### Production Certificates (CA-Signed)
- **Purpose**: Production deployment
- **Validity**: Varies (typically 90 days for Let's Encrypt)
- **Domains**: Your actual domain names
- **Security**: Trusted by all browsers and clients

## 🚀 Quick Start

### For Windows (PowerShell)
```powershell
# Navigate to the ssl directory
cd ssl

# Generate self-signed certificates
.\generate-ssl.ps1

# Optional: Generate for custom domain
.\generate-ssl.ps1 -Domain "myapp.local" -Days 730
```

### For Linux/macOS (Bash)
```bash
# Navigate to the ssl directory
cd ssl

# Make script executable
chmod +x generate-ssl.sh

# Generate self-signed certificates
./generate-ssl.sh
```

## 📁 Generated Files

After running the generation script, you'll have:

- `key.pem` - Server private key (keep secure!)
- `cert.pem` - Server certificate
- `ca-key.pem` - Certificate Authority private key (keep secure!)
- `ca.pem` - Certificate Authority certificate

## ⚙️ Configuration

### Environment Variables

Add these to your `.env` file:

```env
# SSL Configuration
SSL_ENABLED=true
SSL_CERT_PATH=./ssl/cert.pem
SSL_KEY_PATH=./ssl/key.pem
SSL_CA_PATH=./ssl/ca.pem

# Force HTTPS Redirect
FORCE_HTTPS=true
```

### Application Code

The SSL certificates are automatically loaded by the application when `SSL_ENABLED=true`.

## 🌐 Browser Setup

### Accepting Self-Signed Certificates

1. **Chrome/Edge**: Click "Advanced" → "Proceed to localhost (unsafe)"
2. **Firefox**: Click "Advanced" → "Accept the Risk and Continue"
3. **Safari**: Click "Show Details" → "visit this website"

### Installing CA Certificate (Recommended for Development)

#### Windows
```powershell
# Run the PowerShell script and choose 'y' when prompted
.\generate-ssl.ps1
# Follow the prompt to install CA certificate
```

#### macOS
```bash
# Add CA certificate to keychain
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ca.pem
```

#### Linux (Ubuntu/Debian)
```bash
# Copy CA certificate to system certificates
sudo cp ca.pem /usr/local/share/ca-certificates/fieldsync-ca.crt
sudo update-ca-certificates
```

## 🏭 Production Setup

### Using Let's Encrypt (Recommended)

1. **Install Certbot**:
   ```bash
   # Ubuntu/Debian
   sudo apt install certbot python3-certbot-nginx
   
   # CentOS/RHEL
   sudo yum install certbot python3-certbot-nginx
   ```

2. **Generate Certificate**:
   ```bash
   sudo certbot --nginx -d yourdomain.com -d api.yourdomain.com
   ```

3. **Auto-renewal**:
   ```bash
   # Add to crontab
   0 12 * * * /usr/bin/certbot renew --quiet
   ```

### Using AWS Certificate Manager (ACM)

1. **Request Certificate** in AWS Console
2. **Validate Domain** ownership
3. **Configure Load Balancer** to use the certificate
4. **Update Environment Variables**:
   ```env
   SSL_ENABLED=false  # Let ALB handle SSL termination
   TRUST_PROXY=true   # Trust ALB proxy headers
   ```

### Using Custom CA Certificate

1. **Obtain certificates** from your CA
2. **Place files** in the ssl directory:
   - `cert.pem` - Your domain certificate
   - `key.pem` - Your private key
   - `ca.pem` - CA bundle (optional)
3. **Update permissions**:
   ```bash
   chmod 600 key.pem
   chmod 644 cert.pem ca.pem
   ```

## 🔒 Security Best Practices

### File Permissions
```bash
# Private keys should be readable only by owner
chmod 600 *.key *.pem
chown app:app *.key *.pem

# Certificates can be world-readable
chmod 644 cert.pem ca.pem
```

### Environment-Specific Configurations

#### Development
- Self-signed certificates are acceptable
- Can disable HTTPS for local development
- Use HTTP for API testing tools

#### Staging
- Use valid certificates (Let's Encrypt)
- Enable HTTPS enforcement
- Test certificate renewal process

#### Production
- Use certificates from trusted CA
- Enable HSTS headers
- Implement certificate monitoring
- Set up automatic renewal

## 🔧 Troubleshooting

### Common Issues

#### "Certificate not trusted" error
- **Solution**: Install CA certificate in system/browser trust store
- **Alternative**: Use `--ignore-certificate-errors` flag for testing

#### "Private key doesn't match certificate"
- **Solution**: Regenerate both certificate and key together
- **Check**: Verify certificate and key are from same generation

#### "Permission denied" when reading certificate files
- **Solution**: Check file permissions and ownership
- **Fix**: `chmod 600 key.pem && chown app:app key.pem`

#### Certificate expired
- **Solution**: Regenerate certificates or renew from CA
- **Prevention**: Set up monitoring and auto-renewal

### Debugging Commands

```bash
# Check certificate details
openssl x509 -in cert.pem -text -noout

# Verify certificate and key match
openssl x509 -noout -modulus -in cert.pem | openssl md5
openssl rsa -noout -modulus -in key.pem | openssl md5

# Test SSL connection
openssl s_client -connect localhost:3000 -servername localhost

# Check certificate expiration
openssl x509 -in cert.pem -noout -dates
```

## 📊 Monitoring

### Certificate Expiration Monitoring

Add to your monitoring system:

```javascript
// Check certificate expiration
const https = require('https');
const tls = require('tls');

function checkCertExpiration(hostname, port = 443) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(port, hostname, () => {
      const cert = socket.getPeerCertificate();
      const daysUntilExpiry = Math.floor(
        (new Date(cert.valid_to) - new Date()) / (1000 * 60 * 60 * 24)
      );
      socket.end();
      resolve(daysUntilExpiry);
    });
    
    socket.on('error', reject);
  });
}
```

### Health Check Endpoint

```javascript
// Add to your health check
app.get('/health/ssl', (req, res) => {
  if (!process.env.SSL_ENABLED) {
    return res.json({ ssl: 'disabled' });
  }
  
  // Check certificate files exist and are readable
  const fs = require('fs');
  const certPath = process.env.SSL_CERT_PATH;
  const keyPath = process.env.SSL_KEY_PATH;
  
  try {
    fs.accessSync(certPath, fs.constants.R_OK);
    fs.accessSync(keyPath, fs.constants.R_OK);
    
    // Check certificate expiration
    const cert = fs.readFileSync(certPath);
    const certInfo = require('crypto').createHash('sha256')
      .update(cert).digest('hex');
    
    res.json({
      ssl: 'enabled',
      certificate: 'valid',
      fingerprint: certInfo.substring(0, 16)
    });
  } catch (error) {
    res.status(500).json({
      ssl: 'error',
      message: error.message
    });
  }
});
```

## 📚 Additional Resources

- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)
- [OpenSSL Cookbook](https://www.feistyduck.com/library/openssl-cookbook/)
- [Mozilla SSL Configuration Generator](https://ssl-config.mozilla.org/)
- [SSL Labs Server Test](https://www.ssllabs.com/ssltest/)

## 🆘 Support

If you encounter issues with SSL certificate setup:

1. Check the troubleshooting section above
2. Verify your environment configuration
3. Test with curl or openssl commands
4. Check application logs for SSL-related errors
5. Consult the official documentation for your deployment platform