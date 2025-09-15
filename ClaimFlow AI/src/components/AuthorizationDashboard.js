import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Alert, AlertDescription } from './ui/alert';
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Search, 
  Filter,
  RefreshCw,
  Eye,
  Download,
  Bell
} from 'lucide-react';

const AuthorizationDashboard = () => {
  const [authorizations, setAuthorizations] = useState([]);
  const [filteredAuthorizations, setFilteredAuthorizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [selectedAuth, setSelectedAuth] = useState(null);
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    approved: 0,
    denied: 0,
    expired: 0
  });

  // Real-time updates using WebSocket or polling
  useEffect(() => {
    const fetchAuthorizations = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/authorizations/dashboard');
        if (!response.ok) throw new Error('Failed to fetch authorizations');
        
        const data = await response.json();
        setAuthorizations(data.authorizations || []);
        setStats(data.stats || stats);
        setError(null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchAuthorizations();
    
    // Set up polling for real-time updates
    const interval = setInterval(fetchAuthorizations, 30000); // 30 seconds
    
    return () => clearInterval(interval);
  }, []);

  // Filter authorizations based on search and filters
  useEffect(() => {
    let filtered = authorizations;

    if (searchTerm) {
      filtered = filtered.filter(auth => 
        auth.patient_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        auth.provider_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        auth.service_type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        auth.id?.toString().includes(searchTerm)
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(auth => auth.status === statusFilter);
    }

    if (priorityFilter !== 'all') {
      filtered = filtered.filter(auth => auth.priority === priorityFilter);
    }

    setFilteredAuthorizations(filtered);
  }, [authorizations, searchTerm, statusFilter, priorityFilter]);

  const getStatusIcon = (status) => {
    switch (status) {
      case 'approved': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'denied': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'pending': return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'expired': return <AlertTriangle className="h-4 w-4 text-gray-500" />;
      default: return <Clock className="h-4 w-4 text-blue-500" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'approved': return 'bg-green-100 text-green-800';
      case 'denied': return 'bg-red-100 text-red-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'expired': return 'bg-gray-100 text-gray-800';
      default: return 'bg-blue-100 text-blue-800';
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'urgent': return 'bg-red-100 text-red-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  const handleViewDetails = (auth) => {
    setSelectedAuth(auth);
  };

  const handleExport = async () => {
    try {
      const response = await fetch('/api/authorizations/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters: { status: statusFilter, priority: priorityFilter, search: searchTerm } })
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `authorizations-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
      }
    } catch (err) {
      setError('Failed to export data');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading dashboard...</span>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Authorization Dashboard</h1>
        <div className="flex space-x-2">
          <Button onClick={handleRefresh} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={handleExport} variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <Bell className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Pending</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Approved</p>
                <p className="text-2xl font-bold text-green-600">{stats.approved}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Denied</p>
                <p className="text-2xl font-bold text-red-600">{stats.denied}</p>
              </div>
              <XCircle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Expired</p>
                <p className="text-2xl font-bold text-gray-600">{stats.expired}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-gray-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex-1 min-w-64">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search by patient, provider, service type, or ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="denied">Denied</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priority</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Authorization List */}
      <Card>
        <CardHeader>
          <CardTitle>Authorization Requests ({filteredAuthorizations.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredAuthorizations.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No authorization requests found matching your criteria.
              </div>
            ) : (
              filteredAuthorizations.map((auth) => (
                <div key={auth.id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        {getStatusIcon(auth.status)}
                        <span className="font-semibold">#{auth.id}</span>
                        <Badge className={getStatusColor(auth.status)}>
                          {auth.status?.toUpperCase()}
                        </Badge>
                        <Badge className={getPriorityColor(auth.priority)}>
                          {auth.priority?.toUpperCase()}
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="font-medium">Patient</p>
                          <p className="text-gray-600">{auth.patient_name}</p>
                        </div>
                        <div>
                          <p className="font-medium">Provider</p>
                          <p className="text-gray-600">{auth.provider_name}</p>
                        </div>
                        <div>
                          <p className="font-medium">Service</p>
                          <p className="text-gray-600">{auth.service_type}</p>
                        </div>
                        <div>
                          <p className="font-medium">Payer</p>
                          <p className="text-gray-600">{auth.payer_name}</p>
                        </div>
                        <div>
                          <p className="font-medium">Submitted</p>
                          <p className="text-gray-600">{formatDate(auth.created_at)}</p>
                        </div>
                        <div>
                          <p className="font-medium">Due Date</p>
                          <p className="text-gray-600">{formatDate(auth.due_date)}</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex space-x-2">
                      <Button 
                        onClick={() => handleViewDetails(auth)} 
                        variant="outline" 
                        size="sm"
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Authorization Details Modal */}
      {selectedAuth && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Authorization Details #{selectedAuth.id}</h2>
              <Button onClick={() => setSelectedAuth(null)} variant="outline" size="sm">
                ×
              </Button>
            </div>
            
            <Tabs defaultValue="details" className="w-full">
              <TabsList>
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="workflow">Workflow</TabsTrigger>
                <TabsTrigger value="documents">Documents</TabsTrigger>
              </TabsList>
              
              <TabsContent value="details" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="font-semibold mb-2">Patient Information</h3>
                    <p><strong>Name:</strong> {selectedAuth.patient_name}</p>
                    <p><strong>DOB:</strong> {selectedAuth.patient_dob}</p>
                    <p><strong>Insurance:</strong> {selectedAuth.insurance_id}</p>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Provider Information</h3>
                    <p><strong>Name:</strong> {selectedAuth.provider_name}</p>
                    <p><strong>NPI:</strong> {selectedAuth.provider_npi}</p>
                    <p><strong>Practice:</strong> {selectedAuth.practice_name}</p>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Service Details</h3>
                    <p><strong>Type:</strong> {selectedAuth.service_type}</p>
                    <p><strong>CPT Code:</strong> {selectedAuth.cpt_codes}</p>
                    <p><strong>Diagnosis:</strong> {selectedAuth.diagnosis_codes}</p>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Authorization Info</h3>
                    <p><strong>Status:</strong> {selectedAuth.status}</p>
                    <p><strong>Priority:</strong> {selectedAuth.priority}</p>
                    <p><strong>Due Date:</strong> {formatDate(selectedAuth.due_date)}</p>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="workflow">
                <div className="space-y-4">
                  <h3 className="font-semibold">Workflow History</h3>
                  {/* Workflow steps would be rendered here */}
                  <p className="text-gray-500">Workflow history will be displayed here</p>
                </div>
              </TabsContent>
              
              <TabsContent value="documents">
                <div className="space-y-4">
                  <h3 className="font-semibold">Supporting Documents</h3>
                  {/* Documents would be listed here */}
                  <p className="text-gray-500">Supporting documents will be listed here</p>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuthorizationDashboard;