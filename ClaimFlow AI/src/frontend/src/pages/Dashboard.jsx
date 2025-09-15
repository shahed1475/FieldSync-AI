import React, { useState, useEffect, useRef } from 'react'
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  LinearProgress,
  Chip,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Alert,
  CircularProgress,
} from '@mui/material'
import {
  TrendingUp,
  Assignment,
  People,
  AttachMoney,
  CheckCircle,
  Warning,
  Error,
  Schedule,
  Wifi,
  WifiOff,
} from '@mui/icons-material'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

const Dashboard = () => {
  const [realTimeData, setRealTimeData] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [lastUpdate, setLastUpdate] = useState(null);
  const [loading, setLoading] = useState(true);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  // Initialize WebSocket connection
  useEffect(() => {
    connectWebSocket();
    
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  const connectWebSocket = () => {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}`;
      
      wsRef.current = new WebSocket(wsUrl);
      
      wsRef.current.onopen = () => {
        console.log('WebSocket connected');
        setConnectionStatus('connected');
        reconnectAttempts.current = 0;
        
        // Subscribe to dashboard updates
        wsRef.current.send(JSON.stringify({
          type: 'subscribe',
          channel: 'dashboard'
        }));
      };
      
      wsRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleWebSocketMessage(message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };
      
      wsRef.current.onclose = () => {
        console.log('WebSocket disconnected');
        setConnectionStatus('disconnected');
        
        // Attempt to reconnect
        if (reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log(`Reconnecting... Attempt ${reconnectAttempts.current}`);
            connectWebSocket();
          }, delay);
        }
      };
      
      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnectionStatus('error');
      };
    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
      setConnectionStatus('error');
    }
  };

  const handleWebSocketMessage = (message) => {
    switch (message.type) {
      case 'dashboard_update':
        setRealTimeData(message.data);
        setLastUpdate(new Date(message.timestamp));
        setLoading(false);
        break;
        
      case 'custom_update':
        if (message.channel === 'dashboard') {
          console.log('Real-time data change:', message.data);
          // Optionally show a notification about the change
        }
        break;
        
      default:
        console.log('Unknown message type:', message.type);
    }
  };

  // Transform real-time data into stats format
  const getStatsFromRealTimeData = () => {
    if (!realTimeData || !realTimeData.stats) {
      // Fallback to mock data while loading
      return [
        {
          title: 'Total Claims',
          value: '...',
          change: '...',
          icon: <Assignment sx={{ fontSize: 40, color: 'primary.main' }} />,
          color: 'primary.main',
        },
        {
          title: 'Active Patients',
          value: '...',
          change: '...',
          icon: <People sx={{ fontSize: 40, color: 'success.main' }} />,
          color: 'success.main',
        },
        {
          title: 'Total Revenue',
          value: '...',
          change: '...',
          icon: <AttachMoney sx={{ fontSize: 40, color: 'warning.main' }} />,
          color: 'warning.main',
        },
        {
          title: 'Processing Rate',
          value: '...',
          change: '...',
          icon: <TrendingUp sx={{ fontSize: 40, color: 'info.main' }} />,
          color: 'info.main',
        },
      ];
    }

    const stats = realTimeData.stats;
    const totalClaims = parseInt(stats.total_claims) || 0;
    const activePatients = parseInt(stats.active_patients) || 0;
    const totalRevenue = parseFloat(stats.total_revenue) || 0;
    const processingRate = parseFloat(stats.processing_rate) || 0;

    return [
      {
        title: 'Total Claims',
        value: totalClaims.toLocaleString(),
        change: '+12%', // You can calculate this from historical data
        icon: <Assignment sx={{ fontSize: 40, color: 'primary.main' }} />,
        color: 'primary.main',
      },
      {
        title: 'Active Patients',
        value: activePatients.toLocaleString(),
        change: '+8%',
        icon: <People sx={{ fontSize: 40, color: 'success.main' }} />,
        color: 'success.main',
      },
      {
        title: 'Total Revenue',
        value: `$${totalRevenue.toLocaleString()}`,
        change: '+15%',
        icon: <AttachMoney sx={{ fontSize: 40, color: 'warning.main' }} />,
        color: 'warning.main',
      },
      {
        title: 'Processing Rate',
        value: `${processingRate.toFixed(1)}%`,
        change: '+2%',
        icon: <TrendingUp sx={{ fontSize: 40, color: 'info.main' }} />,
        color: 'info.main',
      },
    ];
  };

  const stats = getStatsFromRealTimeData();

  // Transform real-time claims data for charts
  const getClaimsChartData = () => {
    if (!realTimeData || !realTimeData.claims) {
      // Fallback data while loading
      return [
        { month: 'Jan', claims: 240, revenue: 45000 },
        { month: 'Feb', claims: 280, revenue: 52000 },
        { month: 'Mar', claims: 320, revenue: 61000 },
        { month: 'Apr', claims: 290, revenue: 55000 },
        { month: 'May', claims: 350, revenue: 68000 },
        { month: 'Jun', claims: 380, revenue: 72000 },
      ];
    }

    return realTimeData.claims.map(item => ({
      month: new Date(item.date).toLocaleDateString('en-US', { month: 'short' }),
      claims: parseInt(item.count) || 0,
      approved: parseInt(item.approved_count) || 0,
      revenue: (parseInt(item.count) || 0) * 150 // Estimated revenue per claim
    }));
  };

  const claimsData = getClaimsChartData();

  // Transform real-time status data for pie chart
  const getStatusChartData = () => {
    if (!realTimeData || !realTimeData.stats) {
      return [
        { name: 'Approved', value: 65, color: '#4caf50' },
        { name: 'Pending', value: 20, color: '#ff9800' },
        { name: 'Rejected', value: 10, color: '#f44336' },
        { name: 'Under Review', value: 5, color: '#2196f3' },
      ];
    }

    const stats = realTimeData.stats;
    const total = parseInt(stats.total_authorizations) || 1;
    const approved = parseInt(stats.approved) || 0;
    const pending = parseInt(stats.pending) || 0;
    const rejected = parseInt(stats.rejected) || 0;
    const underReview = Math.max(0, total - approved - pending - rejected);

    return [
      { name: 'Approved', value: Math.round((approved / total) * 100), color: '#4caf50' },
      { name: 'Pending', value: Math.round((pending / total) * 100), color: '#ff9800' },
      { name: 'Rejected', value: Math.round((rejected / total) * 100), color: '#f44336' },
      { name: 'Under Review', value: Math.round((underReview / total) * 100), color: '#2196f3' },
    ].filter(item => item.value > 0);
  };

  const statusData = getStatusChartData();

  // Transform real-time activities data
  const getRecentActivities = () => {
    if (!realTimeData || !realTimeData.recentActivities) {
      return [
        {
          id: 1,
          action: 'Claim #CLM-2024-001 approved',
          time: '2 minutes ago',
          icon: <CheckCircle sx={{ color: 'success.main' }} />,
        },
        {
          id: 2,
          action: 'New patient registration: John Doe',
          time: '15 minutes ago',
          icon: <People sx={{ color: 'primary.main' }} />,
        },
        {
          id: 3,
          action: 'Claim #CLM-2024-002 requires attention',
          time: '1 hour ago',
          icon: <Warning sx={{ color: 'warning.main' }} />,
        },
        {
          id: 4,
          action: 'Document uploaded for Claim #CLM-2024-003',
          time: '2 hours ago',
          icon: <Schedule sx={{ color: 'info.main' }} />,
        },
      ];
    }

    return realTimeData.recentActivities.map(activity => {
      const timeAgo = getTimeAgo(new Date(activity.updated_at));
      const iconMap = {
        'approved': <CheckCircle sx={{ color: 'success.main' }} />,
        'pending': <Warning sx={{ color: 'warning.main' }} />,
        'rejected': <Error sx={{ color: 'error.main' }} />,
        'submitted': <Schedule sx={{ color: 'info.main' }} />
      };

      return {
        id: activity.id,
        action: `Claim #CLM-${activity.id} ${activity.status} for ${activity.patient_name}`,
        time: timeAgo,
        icon: iconMap[activity.status] || <Schedule sx={{ color: 'info.main' }} />,
      };
    });
  };

  const getTimeAgo = (date) => {
    const now = new Date();
    const diffInMinutes = Math.floor((now - date) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes} minute${diffInMinutes > 1 ? 's' : ''} ago`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
  };

  const recentActivities = getRecentActivities();

  return (
    <Box>
      <Box display="flex" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
        <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold' }}>
          Dashboard Overview
        </Typography>
        <Box display="flex" alignItems="center" gap={2}>
          {connectionStatus === 'connected' && (
            <Chip
              icon={<Wifi />}
              label="Connected"
              color="success"
              size="small"
            />
          )}
          {connectionStatus === 'disconnected' && (
            <Chip
              icon={<WifiOff />}
              label="Disconnected"
              color="error"
              size="small"
            />
          )}
          {connectionStatus === 'connecting' && (
            <Chip
              icon={<CircularProgress size={16} />}
              label="Connecting..."
              color="warning"
              size="small"
            />
          )}
          {lastUpdate && (
            <Typography variant="caption" color="textSecondary">
              Last update: {lastUpdate.toLocaleTimeString()}
            </Typography>
          )}
        </Box>
      </Box>

      {connectionStatus === 'error' && (
        <Alert severity="error" sx={{ mb: 3 }}>
          Failed to connect to real-time data. Showing cached data.
        </Alert>
      )}

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {stats.map((stat, index) => (
          <Grid item xs={12} sm={6} md={3} key={index}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Box display="flex" alignItems="center" justifyContent="space-between">
                  <Box>
                    <Typography color="textSecondary" gutterBottom variant="body2">
                      {stat.title}
                    </Typography>
                    <Typography variant="h4" component="div" sx={{ fontWeight: 'bold' }}>
                      {stat.value}
                    </Typography>
                    <Chip
                      label={stat.change}
                      size="small"
                      sx={{
                        mt: 1,
                        backgroundColor: 'success.light',
                        color: 'success.dark',
                        fontWeight: 'bold',
                      }}
                    />
                  </Box>
                  <Box>{stat.icon}</Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={3}>
        {/* Claims Trend Chart */}
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold' }}>
                Claims & Revenue Trend
              </Typography>
              <Box sx={{ height: 300, mt: 2 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={claimsData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="claims"
                      stroke="#1976d2"
                      strokeWidth={3}
                      name="Claims"
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="revenue"
                      stroke="#dc004e"
                      strokeWidth={3}
                      name="Revenue ($)"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Claims Status Distribution */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold' }}>
                Claims Status Distribution
              </Typography>
              <Box sx={{ height: 200, mt: 2 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
              <Box sx={{ mt: 2 }}>
                {statusData.map((item, index) => (
                  <Box key={index} display="flex" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                    <Box display="flex" alignItems="center">
                      <Box
                        sx={{
                          width: 12,
                          height: 12,
                          backgroundColor: item.color,
                          borderRadius: '50%',
                          mr: 1,
                        }}
                      />
                      <Typography variant="body2">{item.name}</Typography>
                    </Box>
                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                      {item.value}%
                    </Typography>
                  </Box>
                ))}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Recent Activities */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold' }}>
                Recent Activities
              </Typography>
              <List>
                {recentActivities.map((activity) => (
                  <ListItem key={activity.id} divider>
                    <ListItemIcon>{activity.icon}</ListItemIcon>
                    <ListItemText
                      primary={activity.action}
                      secondary={activity.time}
                      primaryTypographyProps={{ fontWeight: 'medium' }}
                    />
                  </ListItem>
                ))}
              </List>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}

export default Dashboard