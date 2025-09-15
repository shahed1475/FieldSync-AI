import React, { useState } from 'react'
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  Grid,
  Avatar,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Divider,
} from '@mui/material'
import {
  Add as AddIcon,
  Search as SearchIcon,
  Person as PersonIcon,
  Phone as PhoneIcon,
  Email as EmailIcon,
  LocationOn as LocationIcon,
  CalendarToday as CalendarIcon,
  Visibility as ViewIcon,
  Edit as EditIcon,
} from '@mui/icons-material'
import { DataGrid } from '@mui/x-data-grid'

const Patients = () => {
  const [searchTerm, setSearchTerm] = useState('')
  const [openDialog, setOpenDialog] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState(null)

  // Mock patients data
  const patientsData = [
    {
      id: 1,
      patientId: 'PAT-001',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@email.com',
      phone: '(555) 123-4567',
      dateOfBirth: '1985-03-15',
      address: '123 Main St, City, State 12345',
      insuranceProvider: 'Blue Cross Blue Shield',
      policyNumber: 'BC123456789',
      lastVisit: '2024-01-15',
      totalClaims: 5,
      status: 'active',
    },
    {
      id: 2,
      patientId: 'PAT-002',
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane.smith@email.com',
      phone: '(555) 234-5678',
      dateOfBirth: '1990-07-22',
      address: '456 Oak Ave, City, State 12345',
      insuranceProvider: 'Aetna',
      policyNumber: 'AET987654321',
      lastVisit: '2024-01-18',
      totalClaims: 3,
      status: 'active',
    },
    {
      id: 3,
      patientId: 'PAT-003',
      firstName: 'Bob',
      lastName: 'Wilson',
      email: 'bob.wilson@email.com',
      phone: '(555) 345-6789',
      dateOfBirth: '1978-11-08',
      address: '789 Pine St, City, State 12345',
      insuranceProvider: 'Cigna',
      policyNumber: 'CIG456789123',
      lastVisit: '2024-01-10',
      totalClaims: 8,
      status: 'inactive',
    },
    {
      id: 4,
      patientId: 'PAT-004',
      firstName: 'Alice',
      lastName: 'Johnson',
      email: 'alice.johnson@email.com',
      phone: '(555) 456-7890',
      dateOfBirth: '1992-05-30',
      address: '321 Elm St, City, State 12345',
      insuranceProvider: 'United Healthcare',
      policyNumber: 'UHC789123456',
      lastVisit: '2024-01-20',
      totalClaims: 2,
      status: 'active',
    },
  ]

  const columns = [
    {
      field: 'patientId',
      headerName: 'Patient ID',
      width: 120,
      renderCell: (params) => (
        <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
          {params.value}
        </Typography>
      ),
    },
    {
      field: 'fullName',
      headerName: 'Full Name',
      width: 180,
      valueGetter: (params) => params.row ? `${params.row.firstName} ${params.row.lastName}` : '',
      renderCell: (params) => (
        <Box display="flex" alignItems="center">
          <Avatar sx={{ width: 32, height: 32, mr: 1, bgcolor: 'primary.main' }}>
            {params.row?.firstName?.[0] || ''}{params.row?.lastName?.[0] || ''}
          </Avatar>
          <Typography variant="body2">{params.value}</Typography>
        </Box>
      ),
    },
    { field: 'email', headerName: 'Email', width: 200 },
    { field: 'phone', headerName: 'Phone', width: 140 },
    { field: 'insuranceProvider', headerName: 'Insurance', width: 180 },
    {
      field: 'totalClaims',
      headerName: 'Total Claims',
      width: 120,
      renderCell: (params) => (
        <Chip
          label={params.value}
          size="small"
          color={params.value > 5 ? 'warning' : 'default'}
          variant="outlined"
        />
      ),
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 100,
      renderCell: (params) => (
        <Chip
          label={params.value.toUpperCase()}
          size="small"
          color={params.value === 'active' ? 'success' : 'default'}
          variant="outlined"
        />
      ),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 120,
      sortable: false,
      renderCell: (params) => (
        <Box>
          <IconButton
            size="small"
            onClick={() => handleViewPatient(params.row)}
            sx={{ color: 'primary.main' }}
          >
            <ViewIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => handleEditPatient(params.row)}
            sx={{ color: 'warning.main' }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
        </Box>
      ),
    },
  ]

  const handleViewPatient = (patient) => {
    setSelectedPatient(patient)
    setOpenDialog(true)
  }

  const handleEditPatient = (patient) => {
    console.log('Edit patient:', patient)
  }

  const filteredPatients = patientsData.filter((patient) => {
    const searchLower = searchTerm.toLowerCase()
    return (
      patient.firstName.toLowerCase().includes(searchLower) ||
      patient.lastName.toLowerCase().includes(searchLower) ||
      patient.email.toLowerCase().includes(searchLower) ||
      patient.patientId.toLowerCase().includes(searchLower)
    )
  })

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
          Patient Management
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          sx={{ borderRadius: 2 }}
        >
          Add New Patient
        </Button>
      </Box>

      {/* Search Controls */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={8}>
              <TextField
                fullWidth
                placeholder="Search patients by name, email, or patient ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                InputProps={{
                  startAdornment: <SearchIcon sx={{ color: 'text.secondary', mr: 1 }} />,
                }}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <Typography variant="body2" color="text.secondary">
                Total Patients: <strong>{filteredPatients.length}</strong>
              </Typography>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Patients Table */}
      <Card>
        <CardContent>
          <Box sx={{ height: 500, width: '100%' }}>
            <DataGrid
              rows={filteredPatients}
              columns={columns}
              pageSize={10}
              rowsPerPageOptions={[5, 10, 20]}
              disableSelectionOnClick
              sx={{
                '& .MuiDataGrid-cell:hover': {
                  color: 'primary.main',
                },
              }}
            />
          </Box>
        </CardContent>
      </Card>

      {/* Patient Details Dialog */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          <Box display="flex" alignItems="center">
            <Avatar sx={{ width: 48, height: 48, mr: 2, bgcolor: 'primary.main' }}>
              {selectedPatient?.firstName?.[0] || ''}{selectedPatient?.lastName?.[0] || ''}
            </Avatar>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                {selectedPatient?.firstName} {selectedPatient?.lastName}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Patient ID: {selectedPatient?.patientId}
              </Typography>
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent>
          {selectedPatient && (
            <Box>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 'bold' }}>
                Contact Information
              </Typography>
              <List>
                <ListItem>
                  <ListItemAvatar>
                    <Avatar sx={{ bgcolor: 'primary.light' }}>
                      <EmailIcon />
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary="Email"
                    secondary={selectedPatient.email}
                  />
                </ListItem>
                <ListItem>
                  <ListItemAvatar>
                    <Avatar sx={{ bgcolor: 'success.light' }}>
                      <PhoneIcon />
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary="Phone"
                    secondary={selectedPatient.phone}
                  />
                </ListItem>
                <ListItem>
                  <ListItemAvatar>
                    <Avatar sx={{ bgcolor: 'warning.light' }}>
                      <LocationIcon />
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary="Address"
                    secondary={selectedPatient.address}
                  />
                </ListItem>
                <ListItem>
                  <ListItemAvatar>
                    <Avatar sx={{ bgcolor: 'info.light' }}>
                      <CalendarIcon />
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary="Date of Birth"
                    secondary={selectedPatient.dateOfBirth}
                  />
                </ListItem>
              </List>
              
              <Divider sx={{ my: 2 }} />
              
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 'bold' }}>
                Insurance Information
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle2" color="text.secondary">Insurance Provider</Typography>
                  <Typography variant="body1" sx={{ mb: 2 }}>{selectedPatient.insuranceProvider}</Typography>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle2" color="text.secondary">Policy Number</Typography>
                  <Typography variant="body1" sx={{ mb: 2 }}>{selectedPatient.policyNumber}</Typography>
                </Grid>
              </Grid>
              
              <Divider sx={{ my: 2 }} />
              
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 'bold' }}>
                Medical History Summary
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle2" color="text.secondary">Total Claims</Typography>
                  <Typography variant="body1" sx={{ mb: 2, fontWeight: 'bold' }}>
                    {selectedPatient.totalClaims}
                  </Typography>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle2" color="text.secondary">Last Visit</Typography>
                  <Typography variant="body1" sx={{ mb: 2 }}>{selectedPatient.lastVisit}</Typography>
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="subtitle2" color="text.secondary">Status</Typography>
                  <Chip
                    label={selectedPatient.status.toUpperCase()}
                    color={selectedPatient.status === 'active' ? 'success' : 'default'}
                    variant="outlined"
                  />
                </Grid>
              </Grid>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Close</Button>
          <Button variant="contained" onClick={() => setOpenDialog(false)}>
            Edit Patient
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default Patients