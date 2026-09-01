import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import type {
  AdminMerchant,
  AdminPlatformStats,
  AdminUser,
  AuthResponse,
  Automation,
  AutomationListResponse,
  CustomerPaymentDetails,
  CustomerPaymentResult,
  CustomerProfile,
  DashboardData,
  Recommendation,
  RecoveryInstruction,
  RecoverySession,
  Simulation,
  StatusStats,
  User,
  UserDashboardData,
  WebhookEventRequest,
  WebhookEventResponse,
} from '../types';

// ---------------------------------------------------------------------------
// Base Configuration
// ---------------------------------------------------------------------------
const getBaseUrl = (): string => {
  const envUrl = (import.meta as any).env?.VITE_API_BASE_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '');
  }
  return 'http://127.0.0.1:8001';
};

export const API_BASE_URL = getBaseUrl();

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ---------------------------------------------------------------------------
// Request Interceptor: Attach Session ID / Token
// ---------------------------------------------------------------------------
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const sessionId = localStorage.getItem('relay_session_id');
  if (sessionId) {
    config.headers.set('X-Session-ID', sessionId);
    config.headers.set('Authorization', `Bearer ${sessionId}`);
  }
  return config;
});

// ---------------------------------------------------------------------------
// Response Interceptor: Handle 401 and 403
// ---------------------------------------------------------------------------
let onUnauthorizedCallback: (() => void) | null = null;
let onForbiddenCallback: ((detail: string) => void) | null = null;

export const setOnUnauthorized = (cb: () => void) => {
  onUnauthorizedCallback = cb;
};

export const setOnForbidden = (cb: (detail: string) => void) => {
  onForbiddenCallback = cb;
};

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('relay_session_id');
      localStorage.removeItem('relay_user');
      if (onUnauthorizedCallback) {
        onUnauthorizedCallback();
      }
    } else if (error.response?.status === 403) {
      const detail = (error.response?.data as any)?.detail || 'Access forbidden: insufficient permissions';
      if (onForbiddenCallback) {
        onForbiddenCallback(detail);
      }
    }
    return Promise.reject(error);
  }
);

// ---------------------------------------------------------------------------
// 1. Authentication APIs
// ---------------------------------------------------------------------------
export const authApi = {
  login: async (username: string, password: string): Promise<AuthResponse> => {
    const { data } = await api.post<AuthResponse>('/auth/login', { username, password });
    if (data.session_id) {
      localStorage.setItem('relay_session_id', data.session_id);
      localStorage.setItem('relay_user', JSON.stringify(data.user));
    }
    return data;
  },

  logout: async (): Promise<void> => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Best-effort logout
    } finally {
      localStorage.removeItem('relay_session_id');
      localStorage.removeItem('relay_user');
    }
  },

  getMe: async (): Promise<{ user: User }> => {
    const { data } = await api.get<{ user: User }>('/auth/me');
    if (data.user) {
      localStorage.setItem('relay_user', JSON.stringify(data.user));
    }
    return data;
  },
};

// ---------------------------------------------------------------------------
// 2. Merchant Dashboard & Analytics APIs
// ---------------------------------------------------------------------------
export const getDashboard = async (): Promise<DashboardData> => {
  const { data } = await api.get<DashboardData>('/dashboard');
  return data;
};

export const getStatusStats = async (): Promise<StatusStats> => {
  const { data } = await api.get<StatusStats>('/stats/by-status');
  return data;
};

export const getRawData = async (limit = 1000): Promise<any[]> => {
  const { data } = await api.get<{ data: any[] }>(`/data?limit=${limit}`);
  return data.data || [];
};

export const uploadCsv = async (file: File): Promise<{ status: string; rows_loaded: number; file_name: string }> => {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
};

// ---------------------------------------------------------------------------
// 3. Customer Intelligence APIs
// ---------------------------------------------------------------------------
export const getCustomer = async (customerId: string): Promise<CustomerProfile> => {
  const { data } = await api.get<CustomerProfile>(`/customer/${encodeURIComponent(customerId.trim())}`);
  return data;
};

// ---------------------------------------------------------------------------
// 4. Recovery Workflow APIs
// ---------------------------------------------------------------------------
export const getRecommendation = async (customerId: string): Promise<Recommendation> => {
  const { data } = await api.post<Recommendation>('/recommend', {
    customer_id: customerId.trim(),
  });
  return data;
};

export const runSimulation = async (customerId: string, strategy: string): Promise<Simulation> => {
  const { data } = await api.post<Simulation>('/simulate', {
    customer_id: customerId.trim(),
    strategy,
  });
  return data;
};

export const validateSchedule = async (customerId: string, retrySchedule: number[]): Promise<any> => {
  const { data } = await api.post('/recover/validate-schedule', {
    customer_id: customerId.trim(),
    retry_schedule: retrySchedule,
  });
  return data;
};

export const startRecovery = async (
  customerId: string,
  strategy: string,
  expectedRecoveredRevenue: number,
  retrySchedule?: number[]
): Promise<RecoverySession> => {
  const { data } = await api.post<RecoverySession>('/recover', {
    customer_id: customerId.trim(),
    strategy,
    expected_recovered_revenue: expectedRecoveredRevenue,
    retry_schedule: retrySchedule,
  });
  return data;
};

export const getRecoverySession = async (sessionId: string): Promise<RecoverySession> => {
  const { data } = await api.get<RecoverySession>(`/recover/${encodeURIComponent(sessionId)}`);
  return data;
};

export const retryRecoveryAction = async (sessionId: string): Promise<RecoverySession> => {
  const { data } = await api.post<RecoverySession>(`/recover/${encodeURIComponent(sessionId)}/retry`);
  return data;
};

export const scheduleRecoveryAction = async (sessionId: string): Promise<RecoverySession> => {
  const { data } = await api.post<RecoverySession>(`/recover/${encodeURIComponent(sessionId)}/schedule`);
  return data;
};

export const completeRecovery = async (sessionId: string): Promise<RecoverySession> => {
  const { data } = await api.post<RecoverySession>(`/recover/${encodeURIComponent(sessionId)}/complete`);
  return data;
};

// ---------------------------------------------------------------------------
// 5. Customer-Facing Payment Checkout APIs
// ---------------------------------------------------------------------------
export const getPaymentSession = async (sessionId: string): Promise<CustomerPaymentDetails> => {
  const { data } = await api.get<CustomerPaymentDetails>(`/api/pay/${encodeURIComponent(sessionId)}`);
  return data;
};

export const selectPaymentMethod = async (sessionId: string, paymentMethod: string): Promise<{ status: string }> => {
  const { data } = await api.post(`/api/pay/${encodeURIComponent(sessionId)}/select-method`, {
    payment_method: paymentMethod,
  });
  return data;
};

export const processPayment = async (
  sessionId: string,
  paymentMethod: string = 'UPI',
  simulateOutcome: string = 'success'
): Promise<CustomerPaymentResult> => {
  const { data } = await api.post<CustomerPaymentResult>(`/api/pay/${encodeURIComponent(sessionId)}/process`, {
    payment_method: paymentMethod,
    simulate_outcome: simulateOutcome,
  });
  return data;
};

// ---------------------------------------------------------------------------
// 6. No-Code Automations APIs
// ---------------------------------------------------------------------------
export const listAutomations = async (): Promise<AutomationListResponse> => {
  const { data } = await api.get<AutomationListResponse>('/automations');
  return data;
};

export const createAutomation = async (automationData: Partial<Automation>): Promise<Automation> => {
  const { data } = await api.post<Automation>('/automations', automationData);
  return data;
};

export const getAutomation = async (automationId: string): Promise<Automation> => {
  const { data } = await api.get<Automation>(`/automations/${encodeURIComponent(automationId)}`);
  return data;
};

export const updateAutomation = async (automationId: string, automationData: Partial<Automation>): Promise<Automation> => {
  const { data } = await api.put<Automation>(`/automations/${encodeURIComponent(automationId)}`, automationData);
  return data;
};

export const deleteAutomation = async (automationId: string): Promise<{ status: string; id: string }> => {
  const { data } = await api.delete(`/automations/${encodeURIComponent(automationId)}`);
  return data;
};

export const pauseAutomation = async (automationId: string): Promise<Automation> => {
  const { data } = await api.post<Automation>(`/automations/${encodeURIComponent(automationId)}/pause`);
  return data;
};

export const resumeAutomation = async (automationId: string): Promise<Automation> => {
  const { data } = await api.post<Automation>(`/automations/${encodeURIComponent(automationId)}/resume`);
  return data;
};

export const duplicateAutomation = async (automationId: string): Promise<Automation> => {
  const { data } = await api.post<Automation>(`/automations/${encodeURIComponent(automationId)}/duplicate`);
  return data;
};

export const previewAutomation = async (automationData: Partial<Automation>): Promise<{ steps: string[] }> => {
  const { data } = await api.post<{ steps: string[] }>('/automations/preview', automationData);
  return data;
};

export const triggerAutomation = async (
  customerId: string,
  triggerEvent: string = 'payment_failed'
): Promise<any> => {
  const { data } = await api.post('/automations/trigger', {
    customer_id: customerId,
    trigger_event: triggerEvent,
  });
  return data;
};

// ---------------------------------------------------------------------------
// 7. Webhook Ingestion Demo APIs
// ---------------------------------------------------------------------------
export const sendWebhookDemo = async (payload: WebhookEventRequest): Promise<WebhookEventResponse> => {
  const { data } = await api.post<WebhookEventResponse>('/webhooks/payment', payload);
  return data;
};

// ---------------------------------------------------------------------------
// 8. Admin APIs
// ---------------------------------------------------------------------------
export const adminApi = {
  getPlatformStats: async (): Promise<AdminPlatformStats> => {
    const { data } = await api.get<AdminPlatformStats>('/admin/platform-stats');
    return data;
  },

  getMerchants: async (): Promise<{ merchants: AdminMerchant[]; total_count: number }> => {
    const { data } = await api.get<{ merchants: AdminMerchant[]; total_count: number }>('/admin/merchants');
    return data;
  },

  getUsers: async (): Promise<{ users: AdminUser[]; total_count: number }> => {
    const { data } = await api.get<{ users: AdminUser[]; total_count: number }>('/admin/users');
    return data;
  },

  getDatasets: async (): Promise<{ datasets: any[]; total_count: number }> => {
    const { data } = await api.get<{ datasets: any[]; total_count: number }>('/admin/datasets');
    return data;
  },

  getWebhooks: async (): Promise<{ webhook_events: any[]; total_count: number }> => {
    const { data } = await api.get<{ webhook_events: any[]; total_count: number }>('/admin/webhooks');
    return data;
  },

  getAuditLogs: async (): Promise<{ audit_logs: any[] }> => {
    const { data } = await api.get<{ audit_logs: any[] }>('/admin/audit-logs');
    return data;
  },
};

// ---------------------------------------------------------------------------
// 9. User / Customer APIs
// ---------------------------------------------------------------------------
export const userApi = {
  getPayments: async (): Promise<UserDashboardData> => {
    const { data } = await api.get<UserDashboardData>('/user/payments');
    return data;
  },

  getInstructions: async (): Promise<{ instructions: RecoveryInstruction[]; support_contacts: any }> => {
    const { data } = await api.get<{ instructions: RecoveryInstruction[]; support_contacts: any }>('/user/instructions');
    return data;
  },
};
