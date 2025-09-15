import React, { useState, useCallback } from 'react'
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Grid,
  Paper,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Chip,
  LinearProgress,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
} from '@mui/material'
import {
  CloudUpload as UploadIcon,
  InsertDriveFile as FileIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  Schedule as PendingIcon,
} from '@mui/icons-material'

const Upload = () => {
  const [dragActive, setDragActive] = useState(false)
  const [files, setFiles] = useState([])
  const [documentType, setDocumentType] = useState('')
  const [patientId, setPatientId] = useState('')
  const [claimId, setClaimId] = useState('')

  // Mock uploaded documents
  const [uploadedDocuments] = useState([
    {
      id: 1,
      name: 'medical_report_001.pdf',
      type: 'Medical Report',
      size: '2.4 MB',
      uploadDate: '2024-01-15',
      status: 'processed',
      patientId: 'PAT-001',
      claimId: 'CLM-2024-001',
    },
    {
      id: 2,
      name: 'insurance_card_scan.jpg',
      type: 'Insurance Card',
      size: '1.2 MB',
      uploadDate: '2024-01-16',
      status: 'processing',
      patientId: 'PAT-002',
      claimId: 'CLM-2024-002',
    },
    {
      id: 3,
      name: 'prescription_form.pdf',
      type: 'Prescription',
      size: '856 KB',
      uploadDate: '2024-01-17',
      status: 'error',
      patientId: 'PAT-003',
      claimId: 'CLM-2024-003',
    },
  ])

  const documentTypes = [
    'Medical Report',
    'Insurance Card',
    'Prescription',
    'Lab Results',
    'X-Ray',
    'MRI Scan',
    'CT Scan',
    'Discharge Summary',
    'Referral Letter',
    'Other',
  ]

  const handleDrag = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const newFiles = Array.from(e.dataTransfer.files).map((file, index) => ({
        id: Date.now() + index,
        file,
        name: file.name,
        size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
        progress: 0,
        status: 'pending',
      }))
      setFiles(prev => [...prev, ...newFiles])
    }
  }, [])

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      const newFiles = Array.from(e.target.files).map((file, index) => ({
        id: Date.now() + index,
        file,
        name: file.name,
        size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
        progress: 0,
        status: 'pending',
      }))
      setFiles(prev => [...prev, ...newFiles])
    }
  }

  const removeFile = (id) => {
    setFiles(prev => prev.filter(file => file.id !== id))
  }

  const uploadFiles = () => {
    if (!documentType || !patientId) {
      alert('Please select document type and enter patient ID')
      return
    }

    files.forEach((file, index) => {
      // Simulate upload progress
      const interval = setInterval(() => {
        setFiles(prev => prev.map(f => {
          if (f.id === file.id) {
            const newProgress = Math.min(f.progress + 10, 100)
            return {
              ...f,
              progress: newProgress,
              status: newProgress === 100 ? 'completed' : 'uploading'
            }
          }
          return f
        }))
      }, 200)

      setTimeout(() => {
        clearInterval(interval)
      }, 2000)
    })
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'processed':
        return <CheckIcon sx={{ color: 'success.main' }} />
      case 'processing':
        return <PendingIcon sx={{ color: 'warning.main' }} />
      case 'error':
        return <ErrorIcon sx={{ color: 'error.main' }} />
      default:
        return <FileIcon sx={{ color: 'text.secondary' }} />
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'processed':
        return 'success'
      case 'processing':
        return 'warning'
      case 'error':
        return 'error'
      default:
        return 'default'
    }
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom sx={{ mb: 3, fontWeight: 'bold' }}>
        Document Upload & Management
      </Typography>

      <Grid container spacing={3}>
        {/* Upload Section */}
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold' }}>
                Upload New Documents
              </Typography>
              
              {/* Document Information */}
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={12} md={4}>
                  <FormControl fullWidth>
                    <InputLabel>Document Type</InputLabel>
                    <Select
                      value={documentType}
                      label="Document Type"
                      onChange={(e) => setDocumentType(e.target.value)}
                    >
                      {documentTypes.map((type) => (
                        <MenuItem key={type} value={type}>{type}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="Patient ID"
                    value={patientId}
                    onChange={(e) => setPatientId(e.target.value)}
                    placeholder="e.g., PAT-001"
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="Claim ID (Optional)"
                    value={claimId}
                    onChange={(e) => setClaimId(e.target.value)}
                    placeholder="e.g., CLM-2024-001"
                  />
                </Grid>
              </Grid>

              {/* Drag and Drop Area */}
              <Paper
                sx={{
                  border: dragActive ? '2px dashed #1976d2' : '2px dashed #ccc',
                  borderRadius: 2,
                  p: 4,
                  textAlign: 'center',
                  backgroundColor: dragActive ? 'action.hover' : 'background.paper',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  '&:hover': {
                    backgroundColor: 'action.hover',
                    borderColor: 'primary.main',
                  },
                }}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => document.getElementById('file-input').click()}
              >
                <input
                  id="file-input"
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
                <UploadIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
                <Typography variant="h6" gutterBottom>
                  Drag & drop files here, or click to select
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Supported formats: PDF, JPG, PNG, DOC, DOCX (Max 10MB per file)
                </Typography>
              </Paper>

              {/* File List */}
              {files.length > 0 && (
                <Box sx={{ mt: 3 }}>
                  <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold' }}>
                    Files to Upload ({files.length})
                  </Typography>
                  <List>
                    {files.map((file) => (
                      <ListItem key={file.id} divider>
                        <ListItemIcon>
                          <FileIcon />
                        </ListItemIcon>
                        <ListItemText
                          primary={file.name}
                          secondary={
                            <Box>
                              <Typography variant="body2" color="text.secondary">
                                {file.size}
                              </Typography>
                              {file.status === 'uploading' && (
                                <LinearProgress
                                  variant="determinate"
                                  value={file.progress}
                                  sx={{ mt: 1 }}
                                />
                              )}
                            </Box>
                          }
                        />
                        <ListItemSecondaryAction>
                          {file.status === 'completed' ? (
                            <CheckIcon sx={{ color: 'success.main' }} />
                          ) : (
                            <IconButton
                              edge="end"
                              onClick={() => removeFile(file.id)}
                              sx={{ color: 'error.main' }}
                            >
                              <DeleteIcon />
                            </IconButton>
                          )}
                        </ListItemSecondaryAction>
                      </ListItem>
                    ))}
                  </List>
                  <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
                    <Button
                      variant="contained"
                      onClick={uploadFiles}
                      disabled={files.some(f => f.status === 'uploading')}
                      startIcon={<UploadIcon />}
                    >
                      Upload Files
                    </Button>
                    <Button
                      variant="outlined"
                      onClick={() => setFiles([])}
                      disabled={files.some(f => f.status === 'uploading')}
                    >
                      Clear All
                    </Button>
                  </Box>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Upload Guidelines */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold' }}>
                Upload Guidelines
              </Typography>
              <Alert severity="info" sx={{ mb: 2 }}>
                <Typography variant="body2">
                  Ensure all documents are clear and legible for accurate processing.
                </Typography>
              </Alert>
              <List dense>
                <ListItem>
                  <ListItemText
                    primary="File Size"
                    secondary="Maximum 10MB per file"
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Supported Formats"
                    secondary="PDF, JPG, PNG, DOC, DOCX"
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Image Quality"
                    secondary="Minimum 300 DPI for scanned documents"
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Processing Time"
                    secondary="2-5 minutes for AI analysis"
                  />
                </ListItem>
              </List>
            </CardContent>
          </Card>
        </Grid>

        {/* Recent Uploads */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold' }}>
                Recent Uploads
              </Typography>
              <List>
                {uploadedDocuments.map((doc) => (
                  <ListItem key={doc.id} divider>
                    <ListItemIcon>
                      {getStatusIcon(doc.status)}
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Box display="flex" alignItems="center" gap={1}>
                          <Typography variant="body1" sx={{ fontWeight: 'medium' }}>
                            {doc.name}
                          </Typography>
                          <Chip
                            label={doc.type}
                            size="small"
                            variant="outlined"
                            color="primary"
                          />
                        </Box>
                      }
                      secondary={
                        <Box>
                          <Typography variant="body2" color="text.secondary">
                            Patient: {doc.patientId} | Claim: {doc.claimId} | Size: {doc.size}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Uploaded: {doc.uploadDate}
                          </Typography>
                        </Box>
                      }
                    />
                    <Box display="flex" alignItems="center" gap={1}>
                      <Chip
                        label={doc.status.toUpperCase()}
                        size="small"
                        color={getStatusColor(doc.status)}
                        variant="outlined"
                      />
                      <IconButton size="small" sx={{ color: 'primary.main' }}>
                        <ViewIcon fontSize="small" />
                      </IconButton>
                    </Box>
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

export default Upload