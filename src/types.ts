export type TaskStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export type RiskLevel = 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface FormField {
  field_type: string;
  name?: string;
  placeholder?: string;
  label?: string;
  is_personal_data: boolean;
  pd_category?: string;
}

export interface CheckboxAnalysis {
  exists: boolean;
  is_required: boolean;
  is_prechecked: boolean;
  associated_text?: string;
  has_consent_keywords: boolean;
  has_policy_link: boolean;
  policy_link_url?: string;
  policy_link_status_code?: number;
  policy_link_is_broken?: boolean;
}

export interface FormAuditResult {
  page_url: string;
  form_id?: string;
  form_action?: string;
  form_selector: string;
  fields_count: number;
  personal_data_fields: FormField[];
  checkbox_analysis: CheckboxAnalysis;
  is_compliant: boolean;
  violations: string[];
}

export interface PrivacyPolicyAudit {
  found: boolean;
  policy_urls: string[];
  anchor_texts: string[];
  is_accessible_200: boolean;
  http_status_code?: number;
  has_company_requisites: boolean;
  is_direct_footer_link: boolean;
  violations: string[];
}

export interface CookieBannerAudit {
  detected: boolean;
  banner_type?: string;
  has_accept_button: boolean;
  has_policy_mention: boolean;
  raw_banner_text?: string;
  third_party_trackers: string[];
  is_compliant: boolean;
  violations: string[];
}

export interface SslAudit {
  is_https: boolean;
  is_valid: boolean;
  issuer?: string;
  valid_to?: string;
  days_left?: number;
  protocols: string[];
  violations: string[];
}

export interface LocalizationAudit {
  ip_address?: string;
  hostname?: string;
  country_code?: string;
  country_name?: string;
  city?: string;
  isp?: string;
  is_located_in_rf: boolean;
  violations: string[];
}

export interface LegalViolation {
  code: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  koap_article: string;
  title: string;
  description: string;
  location?: string;
  fine_range_rub: string;
  remediation_guide: string;
}

export interface ComplianceReport {
  target_url: string;
  audit_date: string;
  compliance_score: number; // 0 - 100
  risk_level: RiskLevel;
  max_potential_fine_rub: number;
  scanned_pages_count: number;
  scanned_pages: string[];
  forms_audit: FormAuditResult[];
  privacy_policy_audit: PrivacyPolicyAudit;
  cookie_audit: CookieBannerAudit;
  ssl_audit: SslAudit;
  localization_audit: LocalizationAudit;
  violations: LegalViolation[];
  summary_text: string;
  quick_fix_checklist: string[];
}

export interface TaskStatusResponse {
  task_id: string;
  status: TaskStatus;
  progress: number;
  current_step: string;
  created_at: string;
  completed_at?: string;
  error_message?: string;
}

export interface PresetSite {
  id: string;
  name: string;
  url: string;
  description: string;
  expectedScore: number;
  tag: string;
}
