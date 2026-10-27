// Add runtime config type definition
declare global {
  interface Window {
    RUNTIME_CONFIG?: {
      API_URL: string;
    };
  }
}

export const getBaseUrl = () => {
  // First check runtime configuration (from runtime-config.js)
  if (typeof window !== 'undefined' && window.RUNTIME_CONFIG?.API_URL) {
    return window.RUNTIME_CONFIG.API_URL;
  }

  // During local dev, make targets set VITE_API_URL to the chosen backend port.
  const viteApiUrl = import.meta.env.VITE_API_URL;
  if (viteApiUrl) {
    return viteApiUrl;
  }

  return typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
};

export const API_BASE_URL = getBaseUrl();

export const api = {
  baseURL: API_BASE_URL,
  endpoints: {
    products: '/api/products',
    suppliers: '/api/suppliers',
    orders: '/api/orders',
    branches: '/api/branches',
    headquarters: '/api/headquarters',
    deliveries: '/api/deliveries',
    orderDetails: '/api/order-details',
    orderDetailDeliveries: '/api/order-detail-deliveries',
  },
};
