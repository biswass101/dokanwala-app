import type { HealthStatusPayload } from '@dokanwala/shared';
import { unwrapApiGet } from './client';

export async function fetchHealthStatus(): Promise<HealthStatusPayload> {
  return unwrapApiGet<HealthStatusPayload>('/health');
}
