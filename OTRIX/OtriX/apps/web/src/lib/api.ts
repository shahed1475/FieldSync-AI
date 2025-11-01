/**
 * API Client Utilities
 * Provides typed fetcher and mutator helpers for admin dashboard API calls
 */

export class APIError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: any
  ) {
    super(message);
    this.name = 'APIError';
  }
}

export interface APIResponse<T> {
  data?: T;
  error?: string;
  details?: any;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasMore: boolean;
    cursor?: string;
  };
}

/**
 * Generic fetcher for GET requests
 */
export async function fetcher<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new APIError(
      data.error || `HTTP ${response.status}`,
      response.status,
      data.details
    );
  }

  return data;
}

/**
 * POST request helper
 */
export async function post<T, R = T>(
  url: string,
  body: T
): Promise<R> {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new APIError(
      data.error || `HTTP ${response.status}`,
      response.status,
      data.details
    );
  }

  return data;
}

/**
 * PATCH request helper
 */
export async function patch<T, R = T>(
  url: string,
  body: T
): Promise<R> {
  const response = await fetch(url, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new APIError(
      data.error || `HTTP ${response.status}`,
      response.status,
      data.details
    );
  }

  return data;
}

/**
 * DELETE request helper
 */
export async function del(url: string): Promise<void> {
  const response = await fetch(url, {
    method: 'DELETE',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (response.status !== 204 && response.status !== 200) {
    const data = await response.json().catch(() => ({}));
    throw new APIError(
      data.error || `HTTP ${response.status}`,
      response.status,
      data.details
    );
  }
}

/**
 * Build query string from params object
 */
export function buildQueryString(params: Record<string, any>): string {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.append(key, String(value));
    }
  });

  const qs = searchParams.toString();
  return qs ? `?${qs}` : '';
}

/**
 * API client object with typed methods
 */
export const api = {
  get: fetcher,
  post,
  patch,
  delete: del,
  buildQueryString,
};
