/**
 * Canonical list of named feature flags stored in subscription_plans.features[].
 * The `value` string is stored in the DB; `label` is shown in the UI.
 */
export const FEATURE_FLAGS = [
  { value: "employee_management",  label: "Employee management",   description: "Track staff, roles, and assignments" },
  { value: "supplier_management",  label: "Supplier management",   description: "Manage supplier contacts and orders" },
  { value: "advanced_reports",     label: "Advanced reports",      description: "Margin analysis, trend charts, and exports" },
  { value: "multi_branch",         label: "Multi-branch support",  description: "Manage multiple store locations" },
  { value: "api_access",           label: "API access",            description: "Programmatic access via REST API" },
  { value: "customer_crm",         label: "Customer CRM",          description: "Loyalty points, store credit, purchase history" },
  { value: "inventory_movements",  label: "Inventory adjustments", description: "Log stock movements with reasons" },
  { value: "white_label",          label: "White-label branding",  description: "Remove Violet branding from receipts and UI" },
  { value: "priority_support",     label: "Priority support",      description: "Dedicated support channel with SLA" },
] as const;

export type FeatureFlagValue = (typeof FEATURE_FLAGS)[number]["value"];
