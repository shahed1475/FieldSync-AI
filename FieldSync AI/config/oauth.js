const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const OAuth2Strategy = require('passport-oauth2');

// OAuth configuration for different providers
const oauthConfig = {
  google: {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || '/api/integrations/google/callback',
    scope: ['https://www.googleapis.com/auth/spreadsheets.readonly', 'profile', 'email']
  },
  quickbooks: {
    clientID: process.env.QUICKBOOKS_CLIENT_ID,
    clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET,
    callbackURL: process.env.QUICKBOOKS_CALLBACK_URL || '/api/integrations/quickbooks/callback',
    authorizationURL: 'https://appcenter.intuit.com/connect/oauth2',
    tokenURL: 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
    scope: 'com.intuit.quickbooks.accounting'
  }
};

// Google OAuth Strategy
passport.use('google-sheets', new GoogleStrategy({
  clientID: oauthConfig.google.clientID,
  clientSecret: oauthConfig.google.clientSecret,
  callbackURL: oauthConfig.google.callbackURL,
  scope: oauthConfig.google.scope
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const userData = {
      provider: 'google',
      providerId: profile.id,
      email: profile.emails[0].value,
      name: profile.displayName,
      accessToken,
      refreshToken,
      profile
    };
    return done(null, userData);
  } catch (error) {
    return done(error, null);
  }
}));

// QuickBooks OAuth Strategy
passport.use('quickbooks', new OAuth2Strategy({
  authorizationURL: oauthConfig.quickbooks.authorizationURL,
  tokenURL: oauthConfig.quickbooks.tokenURL,
  clientID: oauthConfig.quickbooks.clientID,
  clientSecret: oauthConfig.quickbooks.clientSecret,
  callbackURL: oauthConfig.quickbooks.callbackURL,
  scope: oauthConfig.quickbooks.scope
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const userData = {
      provider: 'quickbooks',
      accessToken,
      refreshToken,
      profile
    };
    return done(null, userData);
  } catch (error) {
    return done(error, null);
  }
}));

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user);
});

// Deserialize user from session
passport.deserializeUser((user, done) => {
  done(null, user);
});

module.exports = {
  passport,
  oauthConfig
};