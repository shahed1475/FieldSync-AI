#!/bin/bash

# SSL Certificate Generation Script for FieldSync AI
# This script generates self-signed SSL certificates for development and testing

set -e

# Configuration
DOMAIN="localhost"
COUNTRY="US"
STATE="California"
CITY="San Francisco"
ORGANIZATION="FieldSync AI"
ORGANIZATIONAL_UNIT="Development"
EMAIL="dev@fieldsync.ai"

# Certificate validity (days)
DAYS=365

# Output files
KEY_FILE="key.pem"
CERT_FILE="cert.pem"
CSR_FILE="cert.csr"
CA_KEY_FILE="ca-key.pem"
CA_CERT_FILE="ca.pem"

echo "🔐 Generating SSL certificates for FieldSync AI..."
echo "Domain: $DOMAIN"
echo "Validity: $DAYS days"
echo ""

# Create CA private key
echo "📝 Creating CA private key..."
openssl genrsa -out $CA_KEY_FILE 4096

# Create CA certificate
echo "📝 Creating CA certificate..."
openssl req -new -x509 -days $DAYS -key $CA_KEY_FILE -out $CA_CERT_FILE -subj "/C=$COUNTRY/ST=$STATE/L=$CITY/O=$ORGANIZATION/OU=$ORGANIZATIONAL_UNIT CA/CN=FieldSync AI CA/emailAddress=$EMAIL"

# Create server private key
echo "📝 Creating server private key..."
openssl genrsa -out $KEY_FILE 4096

# Create certificate signing request
echo "📝 Creating certificate signing request..."
openssl req -new -key $KEY_FILE -out $CSR_FILE -subj "/C=$COUNTRY/ST=$STATE/L=$CITY/O=$ORGANIZATION/OU=$ORGANIZATIONAL_UNIT/CN=$DOMAIN/emailAddress=$EMAIL"

# Create server certificate signed by CA
echo "📝 Creating server certificate..."
openssl x509 -req -days $DAYS -in $CSR_FILE -CA $CA_CERT_FILE -CAkey $CA_KEY_FILE -CAcreateserial -out $CERT_FILE -extensions v3_req -extfile <(
cat <<EOF
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
C=$COUNTRY
ST=$STATE
L=$CITY
O=$ORGANIZATION
OU=$ORGANIZATIONAL_UNIT
CN=$DOMAIN
emailAddress=$EMAIL

[v3_req]
keyUsage = keyEncipherment, dataEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = 127.0.0.1
DNS.3 = fieldsync.local
DNS.4 = api.fieldsync.local
DNS.5 = app.fieldsync.local
IP.1 = 127.0.0.1
IP.2 = ::1
EOF
)

# Clean up CSR file
rm $CSR_FILE

# Set appropriate permissions
chmod 600 $KEY_FILE $CA_KEY_FILE
chmod 644 $CERT_FILE $CA_CERT_FILE

echo ""
echo "✅ SSL certificates generated successfully!"
echo ""
echo "Files created:"
echo "  🔑 Private Key: $KEY_FILE"
echo "  📜 Certificate: $CERT_FILE"
echo "  🔑 CA Private Key: $CA_KEY_FILE"
echo "  📜 CA Certificate: $CA_CERT_FILE"
echo ""
echo "📋 Certificate Information:"
openssl x509 -in $CERT_FILE -text -noout | grep -A 1 "Subject:"
openssl x509 -in $CERT_FILE -text -noout | grep -A 1 "Validity"
openssl x509 -in $CERT_FILE -text -noout | grep -A 10 "Subject Alternative Name"
echo ""
echo "🔧 To use these certificates:"
echo "  1. Set SSL_ENABLED=true in your .env file"
echo "  2. Set SSL_CERT_PATH=./ssl/cert.pem"
echo "  3. Set SSL_KEY_PATH=./ssl/key.pem"
echo "  4. Set SSL_CA_PATH=./ssl/ca.pem"
echo ""
echo "⚠️  Note: These are self-signed certificates for development only."
echo "   For production, use certificates from a trusted CA like Let's Encrypt."
echo ""
echo "🌐 Access your application at: https://localhost:3000"