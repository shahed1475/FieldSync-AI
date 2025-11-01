/**
 * OCCAM Configuration Types
 */

export interface OCCAMConfig {
  logging?: {
    level?: string;
    format?: string;
  };
  telemetry?: {
    enabled?: boolean;
    endpoint?: string;
  };
  agents?: {
    timeout?: number;
    retries?: number;
  };
}
