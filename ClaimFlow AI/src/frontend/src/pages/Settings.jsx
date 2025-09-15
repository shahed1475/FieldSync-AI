import React, { useState } from 'react'
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  TextField,
  Button,
  Switch,
  FormControlLabel,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Alert,
  Tabs,
  Tab,
  Paper,
  Avatar,
  IconButton,
} from '@mui/material'
import {
  Person as PersonIcon,
  Security as SecurityIcon,
  Notifications as NotificationsIcon,
  Business as BusinessIcon,
  Edit as EditIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
} from '@mui/icons-material'

const Settings = () => {
  const [tabValue, setTabValue] = useState(0)
  const [editMode, setEditMode] = useState(false)
  const [profileData, setProfileData] = useState({
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@claimflow.com',
    phone: '(555) 123-4567',
    role: 'Administrator',
    department: 'Claims Processing',
  })

  const [notifications, setNotifications] = useState({
    emailAlerts: true,
    smsAlerts: false,
    claimUpdates: true,
    systemMaintenance: true,
    weeklyReports: true,
    securityAlerts: true,
  })

  const [systemSettings, setSystemSettings] = useState({
    autoLogout: 30,
    sessionTimeout: 120,
    passwordExpiry: 90,
    twoFactorAuth: true,
    auditLogging: true,
    dataRetention: 365,
  })

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue)
  }

  const handleProfileChange = (field, value) => {
    setProfileData(prev => ({ ...prev, [field]: value }))
  }

  const handleNotificationChange = (setting) => {
    setNotifications(prev => ({ ...prev, [setting]: !prev[setting] }))
  }

  const handleSystemSettingChange = (setting, value) => {
    setSystemSettings(prev => ({ ...prev, [setting]: value }))
  }

  const handleSaveProfile = () => {
    setEditMode(false)
    // Save profile logic here
    console.log('Profile saved:', profileData)
  }

  const renderProfileTab = () => (
    <Grid container spacing={3}>
      <Grid item xs={12} md={4}>
        <Card>
          <CardContent sx={{ textAlign: 'center' }}>
            <Avatar
              sx={{
                width: 120,
                height: 120,
                mx: 'auto',
                mb: 2,
                bgcolor: 'primary.main',
                fontSize: '3rem',
              }}
            >
              {profileData.firstName[0]}{profileData.lastName[0]}
            </Avatar>
            <Typography variant="h6" gutterBottom>
              {profileData.firstName} {profileData.lastName}
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {profileData.role}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {profileData.department}
            </Typography>
            <Button
              variant="outlined"
              startIcon={<EditIcon />}
              sx={{ mt: 2 }}
              onClick={() => setEditMode(!editMode)}
            >
              {editMode ? 'Cancel' : 'Edit Profile'}
            </Button>
          </CardContent>
        </Card>
      </Grid>
      <Grid item xs={12} md={8}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold' }}>
              Personal Information
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="First Name"
                  value={profileData.firstName}
                  onChange={(e) => handleProfileChange('firstName', e.target.value)}
                  disabled={!editMode}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Last Name"
                  value={profileData.lastName}
                  onChange={(e) => handleProfileChange('lastName', e.target.value)}
                  disabled={!editMode}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Email"
                  value={profileData.email}
                  onChange={(e) => handleProfileChange('email', e.target.value)}
                  disabled={!editMode}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Phone"
                  value={profileData.phone}
                  onChange={(e) => handleProfileChange('phone', e.target.value)}
                  disabled={!editMode}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Role"
                  value={profileData.role}
                  disabled
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Department"
                  value={profileData.department}
                  disabled
                />
              </Grid>
            </Grid>
            {editMode && (
              <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
                <Button
                  variant="contained"
                  startIcon={<SaveIcon />}
                  onClick={handleSaveProfile}
                >
                  Save Changes
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<CancelIcon />}
                  onClick={() => setEditMode(false)}
                >
                  Cancel
                </Button>
              </Box>
            )}
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  )

  const renderNotificationsTab = () => (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold' }}>
          Notification Preferences
        </Typography>
        <List>
          <ListItem>
            <ListItemText
              primary="Email Alerts"
              secondary="Receive important notifications via email"
            />
            <ListItemSecondaryAction>
              <Switch
                checked={notifications.emailAlerts}
                onChange={() => handleNotificationChange('emailAlerts')}
              />
            </ListItemSecondaryAction>
          </ListItem>
          <Divider />
          <ListItem>
            <ListItemText
              primary="SMS Alerts"
              secondary="Receive urgent notifications via SMS"
            />
            <ListItemSecondaryAction>
              <Switch
                checked={notifications.smsAlerts}
                onChange={() => handleNotificationChange('smsAlerts')}
              />
            </ListItemSecondaryAction>
          </ListItem>
          <Divider />
          <ListItem>
            <ListItemText
              primary="Claim Updates"
              secondary="Get notified when claim status changes"
            />
            <ListItemSecondaryAction>
              <Switch
                checked={notifications.claimUpdates}
                onChange={() => handleNotificationChange('claimUpdates')}
              />
            </ListItemSecondaryAction>
          </ListItem>
          <Divider />
          <ListItem>
            <ListItemText
              primary="System Maintenance"
              secondary="Receive notifications about scheduled maintenance"
            />
            <ListItemSecondaryAction>
              <Switch
                checked={notifications.systemMaintenance}
                onChange={() => handleNotificationChange('systemMaintenance')}
              />
            </ListItemSecondaryAction>
          </ListItem>
          <Divider />
          <ListItem>
            <ListItemText
              primary="Weekly Reports"
              secondary="Receive weekly analytics and performance reports"
            />
            <ListItemSecondaryAction>
              <Switch
                checked={notifications.weeklyReports}
                onChange={() => handleNotificationChange('weeklyReports')}
              />
            </ListItemSecondaryAction>
          </ListItem>
          <Divider />
          <ListItem>
            <ListItemText
              primary="Security Alerts"
              secondary="Get notified about security-related events"
            />
            <ListItemSecondaryAction>
              <Switch
                checked={notifications.securityAlerts}
                onChange={() => handleNotificationChange('securityAlerts')}
              />
            </ListItemSecondaryAction>
          </ListItem>
        </List>
      </CardContent>
    </Card>
  )

  const renderSecurityTab = () => (
    <Grid container spacing={3}>
      <Grid item xs={12}>
        <Alert severity="info" sx={{ mb: 3 }}>
          Security settings help protect your account and ensure HIPAA compliance.
        </Alert>
      </Grid>
      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold' }}>
              Authentication Settings
            </Typography>
            <List>
              <ListItem>
                <ListItemText
                  primary="Two-Factor Authentication"
                  secondary="Add an extra layer of security to your account"
                />
                <ListItemSecondaryAction>
                  <Switch
                    checked={systemSettings.twoFactorAuth}
                    onChange={(e) => handleSystemSettingChange('twoFactorAuth', e.target.checked)}
                  />
                </ListItemSecondaryAction>
              </ListItem>
              <Divider />
              <ListItem>
                <ListItemText
                  primary="Audit Logging"
                  secondary="Track all user activities for compliance"
                />
                <ListItemSecondaryAction>
                  <Switch
                    checked={systemSettings.auditLogging}
                    onChange={(e) => handleSystemSettingChange('auditLogging', e.target.checked)}
                  />
                </ListItemSecondaryAction>
              </ListItem>
            </List>
          </CardContent>
        </Card>
      </Grid>
      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold' }}>
              Session Management
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Auto Logout (minutes)"
                  type="number"
                  value={systemSettings.autoLogout}
                  onChange={(e) => handleSystemSettingChange('autoLogout', parseInt(e.target.value))}
                  helperText="Automatically log out after inactivity"
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Session Timeout (minutes)"
                  type="number"
                  value={systemSettings.sessionTimeout}
                  onChange={(e) => handleSystemSettingChange('sessionTimeout', parseInt(e.target.value))}
                  helperText="Maximum session duration"
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Password Expiry (days)"
                  type="number"
                  value={systemSettings.passwordExpiry}
                  onChange={(e) => handleSystemSettingChange('passwordExpiry', parseInt(e.target.value))}
                  helperText="Force password change after specified days"
                />
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      </Grid>
      <Grid item xs={12}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold' }}>
              Password Management
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <Button variant="outlined" fullWidth>
                  Change Password
                </Button>
              </Grid>
              <Grid item xs={12} md={6}>
                <Button variant="outlined" fullWidth>
                  Download Backup Codes
                </Button>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  )

  const renderSystemTab = () => (
    <Grid container spacing={3}>
      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold' }}>
              System Information
            </Typography>
            <List>
              <ListItem>
                <ListItemText primary="Version" secondary="ClaimFlow AI v2.1.0" />
              </ListItem>
              <Divider />
              <ListItem>
                <ListItemText primary="Last Updated" secondary="January 15, 2024" />
              </ListItem>
              <Divider />
              <ListItem>
                <ListItemText primary="Database" secondary="SQLite (Local)" />
              </ListItem>
              <Divider />
              <ListItem>
                <ListItemText primary="Uptime" secondary="15 days, 8 hours" />
              </ListItem>
            </List>
          </CardContent>
        </Card>
      </Grid>
      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold' }}>
              Data Management
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Data Retention (days)"
                  type="number"
                  value={systemSettings.dataRetention}
                  onChange={(e) => handleSystemSettingChange('dataRetention', parseInt(e.target.value))}
                  helperText="How long to keep archived data"
                />
              </Grid>
              <Grid item xs={12}>
                <Button variant="outlined" fullWidth sx={{ mb: 1 }}>
                  Export Data
                </Button>
              </Grid>
              <Grid item xs={12}>
                <Button variant="outlined" fullWidth sx={{ mb: 1 }}>
                  Create Backup
                </Button>
              </Grid>
              <Grid item xs={12}>
                <Button variant="outlined" color="error" fullWidth>
                  Clear Cache
                </Button>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  )

  return (
    <Box>
      <Typography variant="h4" gutterBottom sx={{ mb: 3, fontWeight: 'bold' }}>
        Settings
      </Typography>

      <Paper sx={{ mb: 3 }}>
        <Tabs value={tabValue} onChange={handleTabChange} sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tab icon={<PersonIcon />} label="Profile" />
          <Tab icon={<NotificationsIcon />} label="Notifications" />
          <Tab icon={<SecurityIcon />} label="Security" />
          <Tab icon={<BusinessIcon />} label="System" />
        </Tabs>
      </Paper>

      <Box sx={{ mt: 3 }}>
        {tabValue === 0 && renderProfileTab()}
        {tabValue === 1 && renderNotificationsTab()}
        {tabValue === 2 && renderSecurityTab()}
        {tabValue === 3 && renderSystemTab()}
      </Box>
    </Box>
  )
}

export default Settings