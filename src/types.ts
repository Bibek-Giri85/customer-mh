export type NavTab =
  | 'overview'
  | 'segments'
  | 'segmentation'
  | 'customers'
  | 'birthday'
  | 'alerts'
  | 'history';

export type SmsDeliveryStatus = 'Pending' | 'Queued' | 'Sent' | 'Delivered' | 'Failed';

export interface CustomerRecord {
  customer_id: string;
  customer_name: string;
  contact_no: string;
  age: number | null;
  dob: string | null;
  gender: string;
  first_visit_date: string;
  last_visit_date: string;
  total_visits: number;
  total_spend_inr: number;
  avg_spend_per_visit_inr: number;
  avg_group_size: number;
  total_children: number;
  discount_used_count: number;
  chicken_orders: number;
  veg_orders: number;
  mutton_orders: number;
  seafood_orders: number;
  biryani_rice_orders: number;
  chinese_fastfood_orders: number;
  dessert_beverage_orders: number;
  most_ordered_dish: string | null;
  preferred_day_type: string;
  preferred_meal_time: string;
  avg_rating_given: number | null;

  first_visit_days_ago: number;
  days_since_last_visit: number;
  discount_rate: number;
  spend_per_person: number;
  expected_visit_gap: number;
  overdue_ratio: number;
  top_food_category: string;
  top_food_orders: number;
  top_food_share_pct: number;
  cluster_id: number;
  cluster_name: string;
  churn_alert_flag: string;
  area: string;
  loyalty_member: string;
  preferred_order_channel: string;
}

export interface OrderRecord {
  order_id: string;
  customer_id: string;
  order_date: string;
  order_amount: number;
  group_size: number;
  children_count: number;
  discount_used: boolean;
  food_categories: string;
  dish_name: string;
  rating: number | null;
  day_type: string;
  meal_time: string;
  order_channel: string;
  order_status: string;
  processing_status: string;
  source: string;
  created_at: string;
}

export interface ClusterProfile {
  cluster_id: number;
  cluster_name: string;
  subtitle: string;
  customer_count: number;
  customer_share_pct: number;
  total_revenue_inr: number;
  avg_total_spend_inr: number;
  avg_spend_per_visit_inr: number;
  avg_visits: number;
  avg_group_size: number;
  avg_children: number;
  avg_rating: number;
  discount_usage_pct: number;
  high_alerts_count: number;
  top_food_category: string;
  preferred_meal_time: string;
  preferred_day_type: string;
  retention_risk: string;
  business_insights: string[];
  recommendations: string[];
}

export interface BirthdayOffer {
  id: string;
  title: string;
  description: string;
  applicable_item_or_category: string;
  discount_or_benefit: string;
  validity_days: number;
  min_order_amount_inr: number;
  terms_and_conditions: string;
  is_active: boolean;
  owner_approved: boolean;
  created_at: string;
  updated_at: string;
}

export interface BirthdaySmsOption {
  option_id: 1 | 2;
  label: string;
  description: string;
  message: string;
  uses_offer_id: string | null;
  uses_offer_title: string | null;
}

export interface EnrichedBirthdayCustomer {
  customer: CustomerRecord;
  has_valid_dob: boolean;
  dob: string | null;
  next_birthday_date: string | null;
  upcoming_birthday_label: string;
  days_remaining: number;
  is_today: boolean;
  is_urgent: boolean;
  leap_year_adjusted: boolean;
  sms_status: 'Not Sent' | SmsDeliveryStatus;
  last_birthday_campaign: {
    id: string;
    customer_id: string;
    birthday_occurrence: string;
    campaign_id: string;
    offer_id: string | null;
    sms_status: SmsDeliveryStatus;
    resend_authorized: boolean;
    resend_count: number;
    created_at: string;
  } | null;
  sms_options: [BirthdaySmsOption, BirthdaySmsOption];
}

export interface CampaignRecipient {
  id: string;
  campaign_id: string;
  customer_id: string;
  customer_name: string;
  phone_no: string;
  message_content: string;
  sms_status: SmsDeliveryStatus;
  delivery_status: SmsDeliveryStatus;
  processed_at: string;
}

export interface CampaignRecord {
  id: string;
  campaign_name: string;
  campaign_type: 'cluster' | 'birthday' | 'bulk_birthday' | 'alert' | 'bulk_alert';
  cluster_id: number | null;
  cluster_name: string | null;
  channel: 'SMS';
  message_content: string;
  language: 'en' | 'bn';
  recipient_count: number;
  sent_count: number;
  delivered_count: number;
  failed_count: number;
  status: 'Completed';
  created_at: string;
  recipients: CampaignRecipient[];
}

export interface ProcessingLog {
  id: string;
  event_type: string;
  reference_id: string;
  status: 'SUCCESS' | 'DUPLICATE_SKIPPED' | 'VALIDATION_ERROR' | 'FAILED';
  details: string;
  created_at: string;
}

export interface MlPipelineStatus {
  batch_threshold_min: number;
  batch_threshold_max: number;
  queued_count: number;
  queued_guests: Array<{
    customer_id: string;
    customer_name: string;
    action: 'new' | 'update';
    queued_at: string;
  }>;
  last_run: {
    run_id: string;
    executed_at: string;
    batch_size_processed: number;
    total_customers_after: number;
    silhouette_score: number;
    steps: Array<{
      step: 'data_cleaning' | 'preprocessing' | 'feature_engineering' | 'apply_algorithm';
      title: string;
      status: 'completed';
      summary: string;
    }>;
  } | null;
}

export interface DashboardSnapshot {
  metrics: {
    total_customers: number;
    active_customers: number;
    total_orders: number;
    total_revenue_inr: number;
    avg_customer_spend_inr: number;
    avg_visits_per_customer: number;
    cluster_count: number;
    upcoming_birthdays_7d: number;
    upcoming_birthdays_30d: number;
    urgent_birthdays_4d: number;
    high_alerts_remaining: number;
    total_campaigns: number;
    total_sms_sent: number;
    total_sms_delivered: number;
    total_sms_failed: number;
    last_sync_at?: string | null;
    last_sync_error?: string | null;
  };
  customers: CustomerRecord[];
  cluster_profiles: ClusterProfile[];
  birthdays: EnrichedBirthdayCustomer[];
  urgent_birthdays: EnrichedBirthdayCustomer[];
  birthday_offers: BirthdayOffer[];
  campaigns: CampaignRecord[];
  orders: OrderRecord[];
  processing_logs: ProcessingLog[];
  food_distribution: Array<{ category: string; count: number }>;
  ml_pipeline: MlPipelineStatus;
  model: {
    model_version: string;
    trained_at: string;
    n_clusters: number;
    silhouette_score: number;
    inertia: number;
    elbow_inertias: Record<string, number>;
    training_sample_count: number;
    feature_columns: string[];
  };
  contacted_alert_ids: string[];
}