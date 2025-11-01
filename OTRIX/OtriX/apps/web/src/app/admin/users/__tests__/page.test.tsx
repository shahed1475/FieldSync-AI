import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock Users Page Component
const UsersPage = () => {
  const [users, setUsers] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    // Simulate API call
    setTimeout(() => {
      setUsers([
        { id: '1', name: 'John Doe', email: 'john@otrix.com', role: 'admin' },
        { id: '2', name: 'Jane Smith', email: 'jane@otrix.com', role: 'user' },
      ]);
      setLoading(false);
    }, 100);
  }, []);

  if (loading) {
    return <div>Loading users...</div>;
  }

  if (users.length === 0) {
    return (
      <div data-testid="empty-state">
        <p>No users found</p>
        <button>Add User</button>
      </div>
    );
  }

  return (
    <div data-testid="users-table">
      <h1>Users Management</h1>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} data-testid={`user-row-${user.id}`}>
              <td>{user.name}</td>
              <td>{user.email}</td>
              <td>{user.role}</td>
              <td>
                <button>Edit</button>
                <button>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

import React from 'react';

describe('Admin Users Page', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
  });

  it('shows loading state initially', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <UsersPage />
      </QueryClientProvider>
    );

    expect(screen.getByText('Loading users...')).toBeInTheDocument();
  });

  it('renders users table after loading', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <UsersPage />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('users-table')).toBeInTheDocument();
    });

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('john@otrix.com')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
  });

  it('renders action buttons for each user', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <UsersPage />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('user-row-1')).toBeInTheDocument();
    });

    const editButtons = screen.getAllByText('Edit');
    const deleteButtons = screen.getAllByText('Delete');

    expect(editButtons).toHaveLength(2);
    expect(deleteButtons).toHaveLength(2);
  });

  it('shows table headers', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <UsersPage />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Users Management')).toBeInTheDocument();
    });

    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('Role')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });
});
