const { google } = require('googleapis');
const axios = require('axios');
const { DataSource } = require('../../models');

class OAuthManager {
  constructor() {
    this.providers = {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        redirectUri: process.env.GOOGLE_CALLBACK_URL,
        tokenUrl: 'https://oauth2.googleapis.com/token',
        revokeUrl: 'https://oauth2.googleapis.com/revoke'
      },
      quickbooks: {
        clientId: process.env.QUICKBOOKS_CLIENT_ID,
        clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET,
        redirectUri: process.env.QUICKBOOKS_CALLBACK_URL,
        tokenUrl: 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
        revokeUrl: 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke'
      }
    };
  }

  /**
   * Generate OAuth authorization URL
   */
  generateAuthUrl(provider, state, scopes = []) {
    const config = this.providers[provider];
    if (!config) {
      throw new Error(`Unsupported OAuth provider: ${provider}`);
    }

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      state: state,
      access_type: 'offline',
      prompt: 'consent'
    });

    if (provider === 'google') {
      const defaultScopes = [
        'https://www.googleapis.com/auth/spreadsheets.readonly',
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile'
      ];
      params.append('scope', [...defaultScopes, ...scopes].join(' '));
      return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
    }

    if (provider === 'quickbooks') {
      const defaultScopes = ['com.intuit.quickbooks.accounting'];
      params.append('scope', [...defaultScopes, ...scopes].join(' '));
      return `https://appcenter.intuit.com/connect/oauth2?${params}`;
    }

    throw new Error(`Authorization URL generation not implemented for ${provider}`);
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(provider, code, state) {
    const config = this.providers[provider];
    if (!config) {
      throw new Error(`Unsupported OAuth provider: ${provider}`);
    }

    try {
      const tokenData = {
        grant_type: 'authorization_code',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        code: code
      };

      const response = await axios.post(config.tokenUrl, tokenData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        }
      });

      const tokens = response.data;
      
      // Add expiration timestamp
      if (tokens.expires_in) {
        tokens.expires_at = Date.now() + (tokens.expires_in * 1000);
      }

      return {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: tokens.expires_at,
        tokenType: tokens.token_type || 'Bearer',
        scope: tokens.scope,
        provider: provider,
        rawTokens: tokens
      };
    } catch (error) {
      console.error(`Token exchange failed for ${provider}:`, error.response?.data || error.message);
      throw new Error(`Failed to exchange code for tokens: ${error.response?.data?.error_description || error.message}`);
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(provider, refreshToken) {
    const config = this.providers[provider];
    if (!config) {
      throw new Error(`Unsupported OAuth provider: ${provider}`);
    }

    try {
      const tokenData = {
        grant_type: 'refresh_token',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: refreshToken
      };

      const response = await axios.post(config.tokenUrl, tokenData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        }
      });

      const tokens = response.data;
      
      // Add expiration timestamp
      if (tokens.expires_in) {
        tokens.expires_at = Date.now() + (tokens.expires_in * 1000);
      }

      return {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || refreshToken, // Some providers don't return new refresh token
        expiresAt: tokens.expires_at,
        tokenType: tokens.token_type || 'Bearer',
        scope: tokens.scope
      };
    } catch (error) {
      console.error(`Token refresh failed for ${provider}:`, error.response?.data || error.message);
      throw new Error(`Failed to refresh token: ${error.response?.data?.error_description || error.message}`);
    }
  }

  /**
   * Check if token needs refresh (expires within 5 minutes)
   */
  needsRefresh(expiresAt) {
    if (!expiresAt) return false;
    const fiveMinutesFromNow = Date.now() + (5 * 60 * 1000);
    return expiresAt <= fiveMinutesFromNow;
  }

  /**
   * Get valid access token, refreshing if necessary
   */
  async getValidAccessToken(dataSourceId) {
    try {
      const dataSource = await DataSource.findByPk(dataSourceId);
      if (!dataSource || !dataSource.credentials) {
        throw new Error('Data source not found or missing credentials');
      }

      const credentials = JSON.parse(dataSource.credentials);
      
      // Check if token needs refresh
      if (this.needsRefresh(credentials.expiresAt)) {
        console.log(`Refreshing token for data source ${dataSourceId}`);
        
        const refreshedTokens = await this.refreshAccessToken(
          credentials.provider,
          credentials.refreshToken
        );

        // Update credentials in database
        const updatedCredentials = {
          ...credentials,
          ...refreshedTokens,
          lastRefreshed: new Date().toISOString()
        };

        await dataSource.update({
          credentials: JSON.stringify(updatedCredentials)
        });

        return refreshedTokens.accessToken;
      }

      return credentials.accessToken;
    } catch (error) {
      console.error(`Failed to get valid access token for data source ${dataSourceId}:`, error.message);
      throw error;
    }
  }

  /**
   * Revoke OAuth tokens
   */
  async revokeTokens(provider, accessToken) {
    const config = this.providers[provider];
    if (!config) {
      throw new Error(`Unsupported OAuth provider: ${provider}`);
    }

    try {
      await axios.post(config.revokeUrl, {
        token: accessToken
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      return true;
    } catch (error) {
      console.error(`Token revocation failed for ${provider}:`, error.response?.data || error.message);
      // Don't throw error as revocation might fail but we still want to delete local tokens
      return false;
    }
  }

  /**
   * Validate token by making a test API call
   */
  async validateToken(provider, accessToken) {
    try {
      if (provider === 'google') {
        const response = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });
        return response.status === 200;
      }

      if (provider === 'quickbooks') {
        // QuickBooks validation would require company ID, so we'll just check token format
        return accessToken && accessToken.length > 0;
      }

      return false;
    } catch (error) {
      console.error(`Token validation failed for ${provider}:`, error.message);
      return false;
    }
  }

  /**
   * Create OAuth2 client for Google APIs
   */
  createGoogleOAuth2Client(credentials) {
    const oauth2Client = new google.auth.OAuth2(
      this.providers.google.clientId,
      this.providers.google.clientSecret,
      this.providers.google.redirectUri
    );

    oauth2Client.setCredentials({
      access_token: credentials.accessToken,
      refresh_token: credentials.refreshToken
    });

    // Set up automatic token refresh
    oauth2Client.on('tokens', async (tokens) => {
      console.log('Google tokens refreshed automatically');
      // Update tokens in database if we have the data source ID
      if (credentials.dataSourceId) {
        try {
          const dataSource = await DataSource.findByPk(credentials.dataSourceId);
          if (dataSource) {
            const updatedCredentials = {
              ...JSON.parse(dataSource.credentials),
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token || credentials.refreshToken,
              expiresAt: tokens.expiry_date,
              lastRefreshed: new Date().toISOString()
            };

            await dataSource.update({
              credentials: JSON.stringify(updatedCredentials)
            });
          }
        } catch (error) {
          console.error('Failed to update refreshed tokens in database:', error.message);
        }
      }
    });

    return oauth2Client;
  }
}

module.exports = OAuthManager;