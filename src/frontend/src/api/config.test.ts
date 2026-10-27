import { afterEach, describe, expect, it, vi } from 'vitest';
import { getBaseUrl } from './config';

describe('API base URL', () => {
  afterEach(() => {
    delete window.RUNTIME_CONFIG;
    vi.unstubAllEnvs();
  });

  it('uses the frontend origin from runtime configuration', () => {
    window.RUNTIME_CONFIG = { API_URL: window.location.origin };
    vi.stubEnv('VITE_API_URL', 'http://localhost:3000');

    expect(getBaseUrl()).toBe(window.location.origin);
  });

  it('preserves the local Vite API URL when no runtime config is present', () => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:3000');

    expect(getBaseUrl()).toBe('http://localhost:3000');
  });
});
