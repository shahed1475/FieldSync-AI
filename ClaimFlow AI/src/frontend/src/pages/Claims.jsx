import React, { useState } from 'react'
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  Grid,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tabs,
  Tab,
  Paper,
} from '@mui/material'
import {
  Add as AddIcon,
  Search as SearchIcon,
  FilterList as FilterIcon,
  Visibility as ViewIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  CheckCircle,
  Schedule,
  Error,
  Warning,
} from '@mui/icons-material'
import { DataGrid } from '@mui/x-data-grid'

const Claims = () => {
  const [tabValue, setTabValue] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [openDialog, setOpenDialog] = useState(false)
  const [selectedClaim, setSelectedClaim] = useState(null)

  // Mock claims data
  const claimsData = [
    {
      id: 1,
      claimId: 'CLM-2024-001',
      patientName: 'John Doe',
      provider: 'Dr. Smith',
      service: 'Consultation',
      amount: 250.00,
      status: 'approved',
      submittedDate: '2024-01-15',
      processedDate: '2024-01-18',
      insuranceCompany: 'Blue Cross',
    },
    {
      id: 2,
      claimId: 'CLM-2024-002',
      patientName: 'Jane Smith',
      provider: 'Dr. Johnson',
      service: 'X-Ray',
      amount: 180.00,
      status: 'pending',
      submittedDate: '2024-01-16',
      processedDate: null,
      insuranceCompany: 'Aetna',
    },
    {
      id: 3,
      claimId: 'CLM-2024-003',
      patientName: 'Bob Wilson',
      provider: 'Dr. Brown',
      service: 'Blood Test',
      amount: 120.00,
      status: 'rejected',
      submittedDate: '2024-01-14',
      processedDate: '2024-01-17',
      insuranceCompany: 'Cigna',
    },
    {
      id: 4,
      claimId: 'CLM-2024-004',
      patientName: 'Alice Johnson',
      provider: 'Dr. Davis',
      service: 'MRI Scan',
      amount: 850.00,
      status: 'under_review',
      submittedDate: '2024-01-17',
      processedDate: null,
      insuranceCompany: 'United Healthcare',
    },
    {
      id: 5,
      claimId: 'CLM-2024-005',
      patientName: 'Charlie Brown',
      provider: 'Dr. Wilson',
      service: 'Physical Therapy',
      amount: 95.00,
      status: 'approved',
      submittedDate: '2024-01-18',
      processedDate: '2024-01-19',
      insuranceCompany: 'Humana',
    },
  ]

  const getStatusIcon = (status) => {
    switch (status) {
      case 'approved':
        return <CheckCircle sx={{ color: 'success.main', fontSize: 16 }} />
      case 'pending':
        return <Schedule sx={{ color: 'warning.main', fontSize: 16 }} />
      case 'rejected':
        return <Error sx={{ color: 'error.main', fontSize: 16 }} />
      case 'under_review':
        return <Warning sx={{ color: 'info.main', fontSize: 16 }} />
      default:
        return null
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'approved':
        return 'success'
      case 'pending':
        return 'warning'
      case 'rejected':
        return 'error'
      case 'under_review':
        return 'info'
      default:
        return 'default'
    }
  }

  const columns = [
    {
      field: 'claimId',
      headerName: 'Claim ID',
      width: 130,
      renderCell: (params) => (
        <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
          {params.value}
        </Typography>
      ),
    },
    { field: 'patientName', headerName: 'Patient', width: 150 },
    { field: 'provider', headerName: 'Provider', width: 130 },
    { field: 'service', headerName: 'Service', width: 150 },
    {
      field: 'amount',
      headerName: 'Amount',
      width: 100,
      renderCell: (params) => (
        <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
          ${params.value.toFixed(2)}
        </Typography>
      ),
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 130,
      renderCell: (params) => (
        <Chip
          icon={getStatusIcon(params.value)}
          label={params.value.replace('_', ' ').toUpperCase()}
          color={getStatusColor(params.value)}
          size="small"
          variant="outlined"
        />
      ),
    },
    { field: 'submittedDate', headerName: 'Submitted', width: 120 },
    { field: 'insuranceCompany', headerName: 'Insurance', width: 150 },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 120,
      sortable: false,
      renderCell: (params) => (
        <Box>
          <IconButton
            size="small"
            onClick={() => handleViewClaim(params.row)}
            sx={{ color: 'primary.main' }}
          >
            <ViewIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => handleEditClaim(params.row)}
            sx={{ color: 'warning.main' }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
        </Box>
      ),
    },
  ]

  const handleViewClaim = (claim) => {
    setSelectedClaim(claim)
    setOpenDialog(true)
  }

  const handleEditClaim = (claim) => {
    // Handle edit claim logic
    console.log('Edit claim:', claim)
  }

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue)
  }

  const filteredClaims = claimsData.filter((claim) => {
    const matchesSearch = claim.claimId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         claim.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         claim.provider.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === 'all' || claim.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const getClaimsByStatus = (status) => {
    if (status === 'all') return filteredClaims
    return filteredClaims.filter(claim => claim.status === status)
  }

  const renderClaimsTable = (claims) => (
    <Box sx={{ height: 400, width: '100%' }}>
      <DataGrid
        rows={claims}
        columns={columns}
        pageSize={5}
        rowsPerPageOptions={[5, 10, 20]}
        disableSelectionOnClick
        sx={{
          '& .MuiDataGrid-cell:hover': {
            color: 'primary.main',
          },
        }}
      />
    </Box>
  )

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
          Claims Management
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          sx={{ borderRadius: 2 }}
        >
          New Claim
        </Button>
      </Box>

      {/* Search and Filter Controls */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                placeholder="Search claims by ID, patient, or provider..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                InputProps={{
                  startAdornment: <SearchIcon sx={{ color: 'text.secondary', mr: 1 }} />,
                }}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControl fullWidth>
                <InputLabel>Status Filter</InputLabel>
                <Select
                  value={statusFilter}
                  label="Status Filter"
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <MenuItem value="all">All Status</MenuItem>
                  <MenuItem value="approved">Approved</MenuItem>
                  <MenuItem value="pending">Pending</MenuItem>
                  <MenuItem value="rejected">Rejected</MenuItem>
                  <MenuItem value="under_review">Under Review</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={3}>
              <Button
                fullWidth
                variant="outlined"
                startIcon={<FilterIcon />}
                sx={{ height: 56 }}
              >
                Advanced Filters
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Claims Tabs */}
      <Paper sx={{ mb: 2 }}>
        <Tabs value={tabValue} onChange={handleTabChange} sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tab label={`All Claims (${filteredClaims.length})`} />
          <Tab label={`Approved (${getClaimsByStatus('approved').length})`} />
          <Tab label={`Pending (${getClaimsByStatus('pending').length})`} />
          <Tab label={`Under Review (${getClaimsByStatus('under_review').length})`} />
          <Tab label={`Rejected (${getClaimsByStatus('rejected').length})`} />
        </Tabs>
      </Paper>

      {/* Claims Table */}
      <Card>
        <CardContent>
          {tabValue === 0 && renderClaimsTable(filteredClaims)}
          {tabValue === 1 && renderClaimsTable(getClaimsByStatus('approved'))}
          {tabValue === 2 && renderClaimsTable(getClaimsByStatus('pending'))}
          {tabValue === 3 && renderClaimsTable(getClaimsByStatus('under_review'))}
          {tabValue === 4 && renderClaimsTable(getClaimsByStatus('rejected'))}
        </CardContent>
      </Card>

      {/* Claim Details Dialog */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
            Claim Details - {selectedClaim?.claimId}
          </Typography>
        </DialogTitle>
        <DialogContent>
          {selectedClaim && (
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle2" color="text.secondary">Patient Name</Typography>
                <Typography variant="body1" sx={{ mb: 2 }}>{selectedClaim.patientName}</Typography>
                
                <Typography variant="subtitle2" color="text.secondary">Provider</Typography>
                <Typography variant="body1" sx={{ mb: 2 }}>{selectedClaim.provider}</Typography>
                
                <Typography variant="subtitle2" color="text.secondary">Service</Typography>
                <Typography variant="body1" sx={{ mb: 2 }}>{selectedClaim.service}</Typography>
              </Grid>
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle2" color="text.secondary">Amount</Typography>
                <Typography variant="body1" sx={{ mb: 2, fontWeight: 'bold' }}>
                  ${selectedClaim.amount.toFixed(2)}
                </Typography>
                
                <Typography variant="subtitle2" color="text.secondary">Status</Typography>
                <Box sx={{ mb: 2 }}>
                  <Chip
                    icon={getStatusIcon(selectedClaim.status)}
                    label={selectedClaim.status.replace('_', ' ').toUpperCase()}
                    color={getStatusColor(selectedClaim.status)}
                    variant="outlined"
                  />
                </Box>
                
                <Typography variant="subtitle2" color="text.secondary">Insurance Company</Typography>
                <Typography variant="body1" sx={{ mb: 2 }}>{selectedClaim.insuranceCompany}</Typography>
              </Grid>
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="text.secondary">Submitted Date</Typography>
                <Typography variant="body1" sx={{ mb: 2 }}>{selectedClaim.submittedDate}</Typography>
                
                {selectedClaim.processedDate && (
                  <>
                    <Typography variant="subtitle2" color="text.secondary">Processed Date</Typography>
                    <Typography variant="body1">{selectedClaim.processedDate}</Typography>
                  </>
                )}
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Close</Button>
          <Button variant="contained" onClick={() => setOpenDialog(false)}>
            Edit Claim
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default Claims