const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const OAuth2Strategy = require('passport-oauth2').Strategy;

// Configure Google OAuth Strategy
passport.use('google', new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL || '/api/integrations/oauth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
  try {
    // Return tokens and profile info
    const user = {
      id: profile.id,
      email: profile.emails[0].value,
      name: profile.displayName,
      tokens: {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: new Date(Date.now() + 3600000) // 1 hour from now
      }
    };
    
    return done(null, user);
  } catch (error) {
    return done(error, null);
  }
}));

// Configure QuickBooks OAuth Strategy
passport.use('quickbooks', new OAuth2Strategy({
  authorizationURL: 'https://appcenter.intuit.com/connect/oauth2',
  tokenURL: 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
  clientID: process.env.QUICKBOOKS_CLIENT_ID,
  clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET,
  callbackURL: process.env.QUICKBOOKS_CALLBACK_URL || '/api/integrations/oauth/quickbooks/callback',
  scope: 'com.intuit.quickbooks.accounting'
}, async (accessToken, refreshToken, params, profile, done) => {
  try {
    // Extract company ID from the callback parameters
    const companyId = params.realmId;
    
    const user = {
      companyId: companyId,
      tokens: {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: new Date(Date.now() + (params.expires_in * 1000))
      }
    };
    
    return done(null, user);
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

module.exports = passport;