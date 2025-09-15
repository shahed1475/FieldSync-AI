import React, { useState } from 'react'
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  FormControlLabel,
  Checkbox,
  Alert,
  InputAdornment,
  IconButton,
  Divider,
  Link,
  Paper,
  Container,
} from '@mui/material'
import {
  Visibility,
  VisibilityOff,
  Email as EmailIcon,
  Lock as LockIcon,
  Security as SecurityIcon,
  Business as BusinessIcon,
} from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'

const Login = () => {
  const navigate = useNavigate()
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    rememberMe: false,
  })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [loginMode, setLoginMode] = useState('email') // 'email' or '2fa'
  const [twoFactorCode, setTwoFactorCode] = useState('')

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (error) setError('') // Clear error when user starts typing
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500))
      
      // Mock authentication logic
      if (formData.email === 'admin@claimflow.com' && formData.password === 'admin123') {
        // Simulate 2FA requirement
        if (loginMode === 'email') {
          setLoginMode('2fa')
          setLoading(false)
          return
        }
        
        // Simulate 2FA verification
        if (twoFactorCode === '123456') {
          localStorage.setItem('isAuthenticated', 'true')
          localStorage.setItem('user', JSON.stringify({
            name: 'John Doe',
            email: 'admin@claimflow.com',
            role: 'Administrator'
          }))
          navigate('/dashboard')
        } else {
          setError('Invalid two-factor authentication code')
        }
      } else {
        setError('Invalid email or password')
      }
    } catch (err) {
      setError('Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleDemoLogin = () => {
    setFormData({
      email: 'admin@claimflow.com',
      password: 'admin123',
      rememberMe: false
    })
  }

  const renderEmailLogin = () => (
    <>
      <TextField
        fullWidth
        label="Email Address"
        type="email"
        value={formData.email}
        onChange={(e) => handleInputChange('email', e.target.value)}
        required
        sx={{ mb: 2 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <EmailIcon color="action" />
            </InputAdornment>
          ),
        }}
      />
      
      <TextField
        fullWidth
        label="Password"
        type={showPassword ? 'text' : 'password'}
        value={formData.password}
        onChange={(e) => handleInputChange('password', e.target.value)}
        required
        sx={{ mb: 2 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <LockIcon color="action" />
            </InputAdornment>
          ),
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                onClick={() => setShowPassword(!showPassword)}
                edge="end"
              >
                {showPassword ? <VisibilityOff /> : <Visibility />}
              </IconButton>
            </InputAdornment>
          ),
        }}
      />
      
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <FormControlLabel
          control={
            <Checkbox
              checked={formData.rememberMe}
              onChange={(e) => handleInputChange('rememberMe', e.target.checked)}
            />
          }
          label="Remember me"
        />
        <Link href="#" variant="body2" color="primary">
          Forgot password?
        </Link>
      </Box>
    </>
  )

  const renderTwoFactorAuth = () => (
    <>
      <Box sx={{ textAlign: 'center', mb: 3 }}>
        <SecurityIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
        <Typography variant="h6" gutterBottom>
          Two-Factor Authentication
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Enter the 6-digit code from your authenticator app
        </Typography>
      </Box>
      
      <TextField
        fullWidth
        label="Authentication Code"
        value={twoFactorCode}
        onChange={(e) => setTwoFactorCode(e.target.value)}
        required
        sx={{ mb: 3 }}
        inputProps={{
          maxLength: 6,
          style: { textAlign: 'center', fontSize: '1.5rem', letterSpacing: '0.5rem' }
        }}
      />
      
      <Box sx={{ textAlign: 'center', mb: 2 }}>
        <Link
          href="#"
          variant="body2"
          onClick={() => setLoginMode('email')}
          sx={{ cursor: 'pointer' }}
        >
          ← Back to login
        </Link>
      </Box>
    </>
  )

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 2,
      }}
    >
      <Container maxWidth="sm">
        <Paper
          elevation={24}
          sx={{
            borderRadius: 3,
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <Box
            sx={{
              background: 'linear-gradient(45deg, #2196F3 30%, #21CBF3 90%)',
              color: 'white',
              p: 4,
              textAlign: 'center',
            }}
          >
            <BusinessIcon sx={{ fontSize: 48, mb: 2 }} />
            <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 'bold' }}>
              ClaimFlow AI
            </Typography>
            <Typography variant="subtitle1" sx={{ opacity: 0.9 }}>
              Healthcare Claims Management System
            </Typography>
          </Box>

          {/* Login Form */}
          <CardContent sx={{ p: 4 }}>
            <Typography variant="h5" component="h2" gutterBottom sx={{ mb: 3, fontWeight: 'bold' }}>
              {loginMode === 'email' ? 'Sign In' : 'Verify Identity'}
            </Typography>

            {error && (
              <Alert severity="error" sx={{ mb: 3 }}>
                {error}
              </Alert>
            )}

            <form onSubmit={handleLogin}>
              {loginMode === 'email' ? renderEmailLogin() : renderTwoFactorAuth()}
              
              <Button
                type="submit"
                fullWidth
                variant="contained"
                size="large"
                disabled={loading}
                sx={{
                  mb: 2,
                  py: 1.5,
                  background: 'linear-gradient(45deg, #2196F3 30%, #21CBF3 90%)',
                  '&:hover': {
                    background: 'linear-gradient(45deg, #1976D2 30%, #0288D1 90%)',
                  },
                }}
              >
                {loading ? 'Signing In...' : (loginMode === 'email' ? 'Sign In' : 'Verify Code')}
              </Button>
            </form>

            {loginMode === 'email' && (
              <>
                <Divider sx={{ my: 3 }}>
                  <Typography variant="body2" color="text.secondary">
                    OR
                  </Typography>
                </Divider>
                
                <Button
                  fullWidth
                  variant="outlined"
                  size="large"
                  onClick={handleDemoLogin}
                  sx={{ mb: 3, py: 1.5 }}
                >
                  Use Demo Credentials
                </Button>
                
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Demo Credentials:
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    Email: admin@claimflow.com
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    Password: admin123
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    2FA Code: 123456
                  </Typography>
                </Box>
              </>
            )}
          </CardContent>

          {/* Footer */}
          <Box
            sx={{
              bgcolor: 'grey.50',
              p: 2,
              textAlign: 'center',
              borderTop: 1,
              borderColor: 'divider',
            }}
          >
            <Typography variant="body2" color="text.secondary">
              © 2024 ClaimFlow AI. All rights reserved.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              HIPAA Compliant • Secure • Reliable
            </Typography>
          </Box>
        </Paper>
      </Container>
    </Box>
  )
}

export default Login