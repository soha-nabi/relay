export interface User {
  id?: string;
  user_id?: string;
  username: string;
  role: 'admin' | 'merchant' | 'user' | string;
  name: string;
  merchant_id?: string;
  email?: string;
}

export interface AuthResponse {
  status: string;
  session_id: string;
  user: User;
}

export interface DashboardData {
  summary: {
    total_transactions: number;
    total_amount: number;
    successful_transactions: number;
    failed_transactions: number;
    pending_transactions: number;
  };
  primary_metrics: {
    total_failed_payments: number;
    total_failed_amount: number;
    total_revenue_at_risk: number;
    recovery_rate: number;
  };
  recovery_metrics: {
    total_recovered: number;
    average_recovery_per_failed: number;
    unrecovered_amount: number;
  };
  rates: {
    success_rate: number;
    failure_rate: number;
    recovery_rate: number;
  };
  amounts: {
    total_amount: number;
    successful_amount: number;
    failed_amount: number;
    revenue_at_risk: number;
  };
  recommendations?: Array<{
    title: string;
    description: string;
    impact: string;
    strategy: string;
  }>;
}

export interface StatusStat {
  count: number;
  total_amount: number;
  average_amount: number;
  total_recovered: number;
}

export type StatusStats = Record<string, StatusStat>;

export interface CustomerProfile {
  customer_id: string;
  total_transactions: number;
  average_amount: number;
  preferred_payment_method: string;
  failure_count: number;
  recovery_rate: number;
  risk_score: number;
  last_failure_reason?: string;
  last_failed_amount?: number;
}

export interface Diagnosis {
  customer_id: string;
  is_recoverable: boolean;
  failure_category: string;
  failure_reason: string;
  amount: number;
  payment_method: string;
  recommended_strategy: string;
  confidence: number;
  explanation: string;
  created_at: string;
}

export interface SmartRetryInfo {
  retry_recommended: boolean;
  confidence: number;
  reason: string;
  recommended_retry_time: string;
  display_retry_time: string;
  expected_recovery: number;
  recommended_delay_hours: number;
}

export interface Recommendation {
  customer_id: string;
  recommended_strategy: string;
  confidence: number;
  reason: string;
  expected_recovery?: number;
  retry_time?: string;
  display_retry_time?: string;
  diagnosis?: Diagnosis;
  smart_retry?: SmartRetryInfo;
}

export interface Simulation {
  customer_id: string;
  strategy: string;
  success_probability: number;
  expected_recovered_revenue: number;
  summary: string;
}

export interface AuditEvent {
  event: string;
  timestamp: string;
  details?: Record<string, any>;
  actor?: string;
}

export interface RecoverySession {
  session_id: string;
  customer_id: string;
  strategy: string;
  status: string;
  retry_count: number;
  max_retries: number;
  amount: number;
  recovered_amount: number;
  payment_url?: string;
  retry_time?: string;
  retry_schedule?: number[];
  current_attempt_index?: number;
  confidence?: number;
  expected_recovery?: number;
  diagnosis?: Diagnosis;
  audit_trail?: AuditEvent[];
  created_at: string;
  updated_at: string;
}

export interface CustomerPaymentDetails {
  session_id: string;
  customer_id: string;
  transaction_id?: string;
  amount: number;
  recovered_amount: number;
  failure_reason: string;
  failure_category: string;
  is_recoverable: boolean;
  status: string;
  payment_url: string;
  title: string;
  message: string;
  can_pay: boolean;
  methods: Array<{
    id: string;
    type: string;
    label: string;
    recommended: boolean;
    description: string;
  }>;
  audit_events?: string[];
}

export interface CustomerPaymentResult {
  status: string;
  recovered: boolean;
  amount: number;
  payment_method: string;
  session_status: string;
  message: string;
}

export interface AutomationCondition {
  field: string;
  operator: string;
  value: any;
}

export interface AutomationAction {
  type: string;
  retry_schedule?: number[];
  template?: string;
}

export interface Automation {
  id: string;
  merchant_id?: string;
  name: string;
  status: 'active' | 'paused' | string;
  trigger: string;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  stop_rules: string[];
  description?: string;
  customers_affected: number;
  times_triggered: number;
  execution_count: number;
  last_triggered?: string | null;
  last_executed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutomationMeta {
  trigger_options: string[];
  condition_fields: string[];
  condition_operators: string[];
  action_options: string[];
  stop_rule_options: string[];
}

export interface AutomationListResponse {
  automations: Automation[];
  meta: AutomationMeta;
}

export interface WebhookEventRequest {
  event: 'payment.failed' | 'payment.captured' | string;
  transaction_id: string;
  amount: number;
  customer_id?: string;
  reason?: string;
  event_id?: string;
  merchant_id?: string;
}

export interface WebhookEventResponse {
  status: string;
  event?: string;
  customer_id?: string;
  transaction_id?: string;
  amount?: number;
  session_id?: string;
  session_status?: string;
  message?: string;
  recovery_started?: boolean;
}

// ---------------------------------------------------------------------------
// Admin & User Models
// ---------------------------------------------------------------------------
export interface AdminPlatformStats {
  platform_overview: {
    total_volume: number;
    total_recovered: number;
    global_recovery_rate: number;
    total_transactions: number;
    active_merchants: number;
    active_users: number;
    active_recovery_sessions: number;
    system_uptime: string;
    system_status: string;
  };
  recovery_breakdown: {
    card_recovery_rate: number;
    upi_recovery_rate: number;
    wallet_recovery_rate: number;
    netbanking_recovery_rate: number;
  };
}

export interface AdminMerchant {
  id: string;
  name: string;
  username: string;
  status: string;
  plan: string;
  datasets_count: number;
  total_volume: string;
  recovery_rate: string;
  last_active: string;
}

export interface AdminUser {
  username: string;
  name: string;
  role: string;
  status: string;
  last_login: string;
}

export interface UserTransaction {
  id: string;
  merchant: string;
  amount: number;
  currency: string;
  status: 'failed' | 'success' | 'pending' | string;
  reason: string;
  date: string;
  recovery_available: boolean;
  recovery_strategy: string;
}

export interface UserDashboardData {
  user_profile: {
    username: string;
    name: string;
    email: string;
    default_payment_method: string;
  };
  summary: {
    total_transactions: number;
    failed_payments: number;
    total_amount_failed: number;
    successful_payments: number;
  };
  transactions: UserTransaction[];
}

export interface RecoveryInstruction {
  title: string;
  description: string;
  action: string;
}
