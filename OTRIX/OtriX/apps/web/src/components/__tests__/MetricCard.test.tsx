import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

// Simple MetricCard component for testing
const MetricCard = ({ title, value, trend }: { title: string; value: string | number; trend?: string }) => {
  return (
    <div data-testid="metric-card" className="p-4 bg-white rounded-lg shadow">
      <h3 className="text-sm font-medium text-gray-600">{title}</h3>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {trend && <span className="text-xs text-green-600">{trend}</span>}
    </div>
  );
};

describe('MetricCard', () => {
  it('renders with title and value', () => {
    render(<MetricCard title="Total Users" value={1247} />);

    expect(screen.getByText('Total Users')).toBeInTheDocument();
    expect(screen.getByText('1247')).toBeInTheDocument();
  });

  it('renders with optional trend', () => {
    render(<MetricCard title="Revenue" value="$124,567" trend="+12%" />);

    expect(screen.getByText('Revenue')).toBeInTheDocument();
    expect(screen.getByText('$124,567')).toBeInTheDocument();
    expect(screen.getByText('+12%')).toBeInTheDocument();
  });

  it('renders without trend when not provided', () => {
    render(<MetricCard title="Active Projects" value={42} />);

    const card = screen.getByTestId('metric-card');
    expect(card).not.toHaveTextContent('+');
  });

  it('handles string values correctly', () => {
    render(<MetricCard title="Status" value="Operational" />);

    expect(screen.getByText('Operational')).toBeInTheDocument();
  });
});
