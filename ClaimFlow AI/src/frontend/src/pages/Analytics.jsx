import React, { useState } from 'react'
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material'
import {
  TrendingUp,
  TrendingDown,
  Assessment,
  Timeline,
  PieChart as PieChartIcon,
  BarChart as BarChartIcon,
  Download as DownloadIcon,
} from '@mui/icons-material'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from 'recharts'

const Analytics = () => {
  const [timeRange, setTimeRange] = useState('6months')
  const [reportType, setReportType] = useState('overview')

  // Mock analytics data
  const monthlyData = [
    { month: 'Jul', claims: 245, revenue: 48500, approvalRate: 92 },
    { month: 'Aug', claims: 280, revenue: 52000, approvalRate: 89 },
    { month: 'Sep', claims: 320, revenue: 61000, approvalRate: 94 },
    { month: 'Oct', claims: 290, revenue: 55000, approvalRate: 91 },
    { month: 'Nov', claims: 350, revenue: 68000, approvalRate: 96 },
    { month: 'Dec', claims: 380, revenue: 72000, approvalRate: 93 },
  ]

  const claimsByProvider = [
    { name: 'Dr. Smith', claims: 145, revenue: 28500, approvalRate: 95 },
    { name: 'Dr. Johnson', claims: 132, revenue: 26400, approvalRate: 92 },
    { name: 'Dr. Brown', claims: 98, revenue: 19600, approvalRate: 89 },
    { name: 'Dr. Davis', claims: 87, revenue: 17400, approvalRate: 94 },
    { name: 'Dr. Wilson', claims: 76, revenue: 15200, approvalRate: 91 },
  ]

  const claimsByInsurance = [
    { name: 'Blue Cross', value: 35, color: '#1976d2' },
    { name: 'Aetna', value: 25, color: '#dc004e' },
    { name: 'Cigna', value: 20, color: '#ed6c02' },
    { name: 'United Healthcare', value: 15, color: '#2e7d32' },
    { name: 'Others', value: 5, color: '#9c27b0' },
  ]

  const processingTimeData = [
    { day: 'Mon', avgTime: 2.3, volume: 45 },
    { day: 'Tue', avgTime: 1.8, volume: 52 },
    { day: 'Wed', avgTime: 2.1, volume: 48 },
    { day: 'Thu', avgTime: 1.9, volume: 56 },
    { day: 'Fri', avgTime: 2.4, volume: 41 },
    { day: 'Sat', avgTime: 1.6, volume: 23 },
    { day: 'Sun', avgTime: 1.4, volume: 18 },
  ]

  const keyMetrics = [
    {
      title: 'Total Revenue',
      value: '$342,500',
      change: '+15.3%',
      trend: 'up',
      icon: <TrendingUp sx={{ fontSize: 32, color: 'success.main' }} />,
    },
    {
      title: 'Approval Rate',
      value: '92.8%',
      change: '+2.1%',
      trend: 'up',
      icon: <Assessment sx={{ fontSize: 32, color: 'primary.main' }} />,
    },
    {
      title: 'Avg Processing Time',
      value: '1.9 days',
      change: '-0.3 days',
      trend: 'down',
      icon: <Timeline sx={{ fontSize: 32, color: 'warning.main' }} />,
    },
    {
      title: 'Claims Volume',
      value: '1,865',
      change: '+8.7%',
      trend: 'up',
      icon: <BarChartIcon sx={{ fontSize: 32, color: 'info.main' }} />,
    },
  ]

  const topDenialReasons = [
    { reason: 'Incomplete Documentation', count: 23, percentage: 35 },
    { reason: 'Prior Authorization Required', count: 18, percentage: 27 },
    { reason: 'Service Not Covered', count: 12, percentage: 18 },
    { reason: 'Duplicate Claim', count: 8, percentage: 12 },
    { reason: 'Patient Information Mismatch', count: 5, percentage: 8 },
  ]

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
          Analytics & Reports
        </Typography>
        <Box display="flex" gap={2}>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Time Range</InputLabel>
            <Select
              value={timeRange}
              label="Time Range"
              onChange={(e) => setTimeRange(e.target.value)}
            >
              <MenuItem value="1month">Last Month</MenuItem>
              <MenuItem value="3months">Last 3 Months</MenuItem>
              <MenuItem value="6months">Last 6 Months</MenuItem>
              <MenuItem value="1year">Last Year</MenuItem>
            </Select>
          </FormControl>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            sx={{ borderRadius: 2 }}
          >
            Export Report
          </Button>
        </Box>
      </Box>

      {/* Key Metrics */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {keyMetrics.map((metric, index) => (
          <Grid item xs={12} sm={6} md={3} key={index}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" justifyContent="space-between">
                  <Box>
                    <Typography color="textSecondary" gutterBottom variant="body2">
                      {metric.title}
                    </Typography>
                    <Typography variant="h4" component="div" sx={{ fontWeight: 'bold' }}>
                      {metric.value}
                    </Typography>
                    <Box display="flex" alignItems="center" sx={{ mt: 1 }}>
                      {metric.trend === 'up' ? (
                        <TrendingUp sx={{ fontSize: 16, color: 'success.main', mr: 0.5 }} />
                      ) : (
                        <TrendingDown sx={{ fontSize: 16, color: 'success.main', mr: 0.5 }} />
                      )}
                      <Typography
                        variant="body2"
                        sx={{ color: 'success.main', fontWeight: 'bold' }}
                      >
                        {metric.change}
                      </Typography>
                    </Box>
                  </Box>
                  <Box>{metric.icon}</Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={3}>
        {/* Revenue & Claims Trend */}
        <Grid item xs={12} lg={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold' }}>
                Revenue & Claims Trend
              </Typography>
              <Box sx={{ height: 300, mt: 2 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlyData}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#1976d2" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#1976d2" stopOpacity={0.1} />
                      </linearGradient>
                      <linearGradient id="colorClaims" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#dc004e" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#dc004e" stopOpacity={0.1} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip />
                    <Area
                      yAxisId="right"
                      type="monotone"
                      dataKey="revenue"
                      stroke="#1976d2"
                      fillOpacity={1}
                      fill="url(#colorRevenue)"
                      name="Revenue ($)"
                    />
                    <Area
                      yAxisId="left"
                      type="monotone"
                      dataKey="claims"
                      stroke="#dc004e"
                      fillOpacity={1}
                      fill="url(#colorClaims)"
                      name="Claims"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Claims by Insurance */}
        <Grid item xs={12} lg={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold' }}>
                Claims by Insurance Provider
              </Typography>
              <Box sx={{ height: 200, mt: 2 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={claimsByInsurance}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {claimsByInsurance.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
              <Box sx={{ mt: 2 }}>
                {claimsByInsurance.map((item, index) => (
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

        {/* Processing Time Analysis */}
        <Grid item xs={12} lg={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold' }}>
                Processing Time by Day
              </Typography>
              <Box sx={{ height: 250, mt: 2 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={processingTimeData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip />
                    <Bar yAxisId="left" dataKey="avgTime" fill="#1976d2" name="Avg Time (days)" />
                    <Bar yAxisId="right" dataKey="volume" fill="#dc004e" name="Volume" />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Top Denial Reasons */}
        <Grid item xs={12} lg={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold' }}>
                Top Denial Reasons
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Reason</TableCell>
                      <TableCell align="right">Count</TableCell>
                      <TableCell align="right">%</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {topDenialReasons.map((row, index) => (
                      <TableRow key={index}>
                        <TableCell component="th" scope="row">
                          <Typography variant="body2">{row.reason}</Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Chip
                            label={row.count}
                            size="small"
                            color="error"
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                            {row.percentage}%
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* Provider Performance */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold' }}>
                Provider Performance Summary
              </Typography>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Provider</TableCell>
                      <TableCell align="right">Total Claims</TableCell>
                      <TableCell align="right">Revenue</TableCell>
                      <TableCell align="right">Approval Rate</TableCell>
                      <TableCell align="right">Performance</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {claimsByProvider.map((provider, index) => (
                      <TableRow key={index}>
                        <TableCell component="th" scope="row">
                          <Typography variant="body1" sx={{ fontWeight: 'medium' }}>
                            {provider.name}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2">{provider.claims}</Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                            ${provider.revenue.toLocaleString()}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2">{provider.approvalRate}%</Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Chip
                            label={provider.approvalRate >= 95 ? 'Excellent' : provider.approvalRate >= 90 ? 'Good' : 'Needs Improvement'}
                            size="small"
                            color={provider.approvalRate >= 95 ? 'success' : provider.approvalRate >= 90 ? 'primary' : 'warning'}
                            variant="outlined"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}

export default Analytics