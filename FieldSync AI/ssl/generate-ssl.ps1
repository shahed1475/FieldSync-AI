# SSL Certificate Generation Script for FieldSync AI (PowerShell)
# This script generates self-signed SSL certificates for development and testing on Windows

param(
    [string]$Domain = "localhost",
    [int]$Days = 365
)

# Configuration
$Config = @{
    Domain = $Domain
    Country = "US"
    State = "California"
    City = "San Francisco"
    Organization = "FieldSync AI"
    OrganizationalUnit = "Development"
    Email = "dev@fieldsync.ai"
    Days = $Days
}

# Output files
$KeyFile = "key.pem"
$CertFile = "cert.pem"
$CAKeyFile = "ca-key.pem"
$CACertFile = "ca.pem"

Write-Host "🔐 Generating SSL certificates for FieldSync AI..." -ForegroundColor Green
Write-Host "Domain: $($Config.Domain)" -ForegroundColor Cyan
Write-Host "Validity: $($Config.Days) days" -ForegroundColor Cyan
Write-Host ""

# Check if OpenSSL is available
try {
    $null = Get-Command openssl -ErrorAction Stop
    Write-Host "✅ OpenSSL found" -ForegroundColor Green
} catch {
    Write-Host "❌ OpenSSL not found. Please install OpenSSL first." -ForegroundColor Red
    Write-Host "   You can install it via:" -ForegroundColor Yellow
    Write-Host "   - Chocolatey: choco install openssl" -ForegroundColor Yellow
    Write-Host "   - Download from: https://slproweb.com/products/Win32OpenSSL.html" -ForegroundColor Yellow
    exit 1
}

try {
    # Create CA private key
    Write-Host "📝 Creating CA private key..." -ForegroundColor Yellow
    & openssl genrsa -out $CAKeyFile 4096
    if ($LASTEXITCODE -ne 0) { throw "Failed to create CA private key" }

    # Create CA certificate
    Write-Host "📝 Creating CA certificate..." -ForegroundColor Yellow
    $CASubject = "/C=$($Config.Country)/ST=$($Config.State)/L=$($Config.City)/O=$($Config.Organization)/OU=$($Config.OrganizationalUnit) CA/CN=FieldSync AI CA/emailAddress=$($Config.Email)"
    & openssl req -new -x509 -days $Config.Days -key $CAKeyFile -out $CACertFile -subj $CASubject
    if ($LASTEXITCODE -ne 0) { throw "Failed to create CA certificate" }

    # Create server private key
    Write-Host "📝 Creating server private key..." -ForegroundColor Yellow
    & openssl genrsa -out $KeyFile 4096
    if ($LASTEXITCODE -ne 0) { throw "Failed to create server private key" }

    # Create certificate signing request
    Write-Host "📝 Creating certificate signing request..." -ForegroundColor Yellow
    $ServerSubject = "/C=$($Config.Country)/ST=$($Config.State)/L=$($Config.City)/O=$($Config.Organization)/OU=$($Config.OrganizationalUnit)/CN=$($Config.Domain)/emailAddress=$($Config.Email)"
    & openssl req -new -key $KeyFile -out cert.csr -subj $ServerSubject
    if ($LASTEXITCODE -ne 0) { throw "Failed to create certificate signing request" }

    # Create extensions file
    $ExtensionsFile = "cert.ext"
    $ExtensionsContent = @"
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = 127.0.0.1
DNS.3 = fieldsync.local
DNS.4 = api.fieldsync.local
DNS.5 = app.fieldsync.local
IP.1 = 127.0.0.1
IP.2 = ::1
"@
    
    Set-Content -Path $ExtensionsFile -Value $ExtensionsContent

    # Create server certificate signed by CA
    Write-Host "📝 Creating server certificate..." -ForegroundColor Yellow
    & openssl x509 -req -days $Config.Days -in cert.csr -CA $CACertFile -CAkey $CAKeyFile -CAcreateserial -out $CertFile -extensions v3_req -extfile $ExtensionsFile
    if ($LASTEXITCODE -ne 0) { throw "Failed to create server certificate" }

    # Clean up temporary files
    Remove-Item -Path "cert.csr", $ExtensionsFile -ErrorAction SilentlyContinue

    Write-Host ""
    Write-Host "✅ SSL certificates generated successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Files created:" -ForegroundColor Cyan
    Write-Host "  🔑 Private Key: $KeyFile" -ForegroundColor White
    Write-Host "  📜 Certificate: $CertFile" -ForegroundColor White
    Write-Host "  🔑 CA Private Key: $CAKeyFile" -ForegroundColor White
    Write-Host "  📜 CA Certificate: $CACertFile" -ForegroundColor White
    Write-Host ""

    # Display certificate information
    Write-Host "📋 Certificate Information:" -ForegroundColor Cyan
    & openssl x509 -in $CertFile -text -noout | Select-String -Pattern "Subject:", "Not Before", "Not After", "DNS:"
    
    Write-Host ""
    Write-Host "🔧 To use these certificates:" -ForegroundColor Yellow
    Write-Host "  1. Set SSL_ENABLED=true in your .env file" -ForegroundColor White
    Write-Host "  2. Set SSL_CERT_PATH=./ssl/cert.pem" -ForegroundColor White
    Write-Host "  3. Set SSL_KEY_PATH=./ssl/key.pem" -ForegroundColor White
    Write-Host "  4. Set SSL_CA_PATH=./ssl/ca.pem" -ForegroundColor White
    Write-Host ""
    Write-Host "⚠️  Note: These are self-signed certificates for development only." -ForegroundColor Red
    Write-Host "   For production, use certificates from a trusted CA like Let's Encrypt." -ForegroundColor Red
    Write-Host ""
    Write-Host "🌐 Access your application at: https://localhost:3000" -ForegroundColor Green

} catch {
    Write-Host "❌ Error generating SSL certificates: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Optional: Install CA certificate to Windows certificate store for development
$InstallCA = Read-Host "`n🔒 Do you want to install the CA certificate to Windows certificate store? (y/N)"
if ($InstallCA -eq 'y' -or $InstallCA -eq 'Y') {
    try {
        Write-Host "📥 Installing CA certificate to Windows certificate store..." -ForegroundColor Yellow
        
        # Convert PEM to CER format
        & openssl x509 -outform der -in $CACertFile -out ca.cer
        
        # Import to Trusted Root Certification Authorities
        Import-Certificate -FilePath "ca.cer" -CertStoreLocation Cert:\LocalMachine\Root
        
        # Clean up CER file
        Remove-Item -Path "ca.cer" -ErrorAction SilentlyContinue
        
        Write-Host "✅ CA certificate installed successfully!" -ForegroundColor Green
        Write-Host "   Your browser should now trust the self-signed certificate." -ForegroundColor Green
    } catch {
        Write-Host "⚠️  Failed to install CA certificate: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host "   You may need to run PowerShell as Administrator." -ForegroundColor Yellow
    }
}