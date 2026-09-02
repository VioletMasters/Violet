-- Violet Enterprise — database schema
-- Applied idempotently on first boot (errors for existing objects are ignored)

CREATE TABLE IF NOT EXISTS public.tenants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    plan_id uuid,
    license_status text DEFAULT 'valid'::text NOT NULL,
    license_validated_at timestamp with time zone DEFAULT now() NOT NULL,
    license_valid_until timestamp with time zone,
    pending_paid_signup boolean DEFAULT false NOT NULL,
    pending_paid_signup_expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.subscription_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    tier text NOT NULL,
    description text,
    price numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    annual_price numeric(10,2),
    billing_type text DEFAULT 'one_time'::text NOT NULL,
    currency text DEFAULT 'JMD'::text NOT NULL,
    checkout_price numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    checkout_currency text DEFAULT 'USD'::text NOT NULL,
    whop_plan_id text,
    max_users integer DEFAULT 2 NOT NULL,
    max_registers integer DEFAULT 1 NOT NULL,
    max_branches integer DEFAULT 1 NOT NULL,
    max_products integer DEFAULT 500 NOT NULL,
    max_customers integer DEFAULT 500 NOT NULL,
    features text[] DEFAULT '{}'::text[] NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    is_popular boolean DEFAULT false NOT NULL,
    trial_days integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    plan_id uuid NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    payment_status text DEFAULT 'not_required'::text NOT NULL,
    whop_plan_id text,
    whop_checkout_configuration_id text,
    pending_whop_checkout_configuration_id text,
    pending_whop_tier text,
    pending_whop_claim text,
    pending_whop_user_id uuid,
    whop_membership_id text,
    last_whop_sync_at timestamp with time zone,
    current_period_start timestamp with time zone,
    current_period_end timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    role text DEFAULT 'employee'::text NOT NULL,
    avatar_url text,
    is_active text DEFAULT 'true'::text NOT NULL,
    must_change_password boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token text NOT NULL,
    license_token text,
    license_validated_at timestamp with time zone,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.sessions
    ADD COLUMN IF NOT EXISTS license_token text,
    ADD COLUMN IF NOT EXISTS license_validated_at timestamp with time zone;
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS must_change_password boolean DEFAULT false NOT NULL;

CREATE TABLE IF NOT EXISTS public.license_sessions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    token_hash text NOT NULL UNIQUE,
    tenant_id uuid NOT NULL,
    user_id uuid,
    user_id uuid NOT NULL,
    installation_id text NOT NULL,
    last_verified_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS license_sessions_tenant_idx ON public.license_sessions (tenant_id);
CREATE INDEX IF NOT EXISTS license_sessions_expires_idx ON public.license_sessions (expires_at);

CREATE TABLE IF NOT EXISTS public.settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    business_name text NOT NULL,
    business_email text NOT NULL,
    business_phone text,
    address text,
    currency text DEFAULT 'JMD'::text NOT NULL,
    currency_symbol text DEFAULT 'J$'::text NOT NULL,
    tax_rate numeric(5,2) DEFAULT '0'::numeric NOT NULL,
    tax_name text DEFAULT 'Tax'::text NOT NULL,
    receipt_footer text,
    logo_url text,
    timezone text DEFAULT 'UTC'::text NOT NULL,
    require_manager_password_for_cart_removal boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    color text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.brands (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    category_id uuid,
    brand_id uuid,
    name text NOT NULL,
    description text,
    sku text NOT NULL,
    barcode text,
    price numeric(10,2) NOT NULL,
    cost_price numeric(10,2),
    stock integer DEFAULT 0 NOT NULL,
    min_stock integer DEFAULT 5 NOT NULL,
    image_url text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Keep existing self-hosted databases compatible with newer app versions.
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS require_manager_password_for_cart_removal boolean DEFAULT false NOT NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS brand_id uuid;
ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS currency text DEFAULT 'JMD'::text NOT NULL;
ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS whop_plan_id text;
ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS checkout_price numeric(10,2) DEFAULT '0'::numeric NOT NULL;
ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS checkout_currency text DEFAULT 'USD'::text NOT NULL;
UPDATE public.subscription_plans
SET
    price = CASE tier
        WHEN 'free' THEN 0
        WHEN 'starter' THEN 7500
        WHEN 'professional' THEN 20000
        WHEN 'enterprise' THEN 150000
        ELSE price
    END,
    currency = CASE
        WHEN tier IN ('free', 'starter', 'professional', 'enterprise') THEN 'JMD'
        ELSE currency
    END,
    checkout_price = CASE tier
        WHEN 'starter' THEN 49
        WHEN 'professional' THEN 129
        WHEN 'enterprise' THEN 999
        ELSE 0
    END,
    checkout_currency = 'USD',
    updated_at = now()
WHERE tier IN ('free', 'starter', 'professional', 'enterprise');
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS whop_plan_id text;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS whop_checkout_configuration_id text;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS pending_whop_checkout_configuration_id text;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS pending_whop_tier text;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS pending_whop_claim text;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS pending_whop_user_id uuid;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS whop_membership_id text;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS last_whop_sync_at timestamp with time zone;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS pending_paid_signup boolean DEFAULT false NOT NULL;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS pending_paid_signup_expires_at timestamp with time zone;

CREATE TABLE IF NOT EXISTS public.customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    email text,
    phone text,
    loyalty_points integer DEFAULT 0 NOT NULL,
    store_credit numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    total_purchases numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    total_orders integer DEFAULT 0 NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.sales (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    receipt_number text NOT NULL,
    customer_id uuid,
    cashier_id uuid NOT NULL,
    subtotal numeric(10,2) NOT NULL,
    tax_amount numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    discount_amount numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    total_amount numeric(10,2) NOT NULL,
    payment_method text DEFAULT 'cash'::text NOT NULL,
    status text DEFAULT 'completed'::text NOT NULL,
    cash_tendered numeric(10,2),
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.sale_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sale_id uuid NOT NULL,
    product_id uuid NOT NULL,
    product_name text NOT NULL,
    quantity integer NOT NULL,
    unit_price numeric(10,2) NOT NULL,
    discount numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    total_price numeric(10,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.inventory_movements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    product_id uuid NOT NULL,
    adjustment integer NOT NULL,
    reason text NOT NULL,
    note text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.employees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    email text,
    phone text,
    role text DEFAULT 'employee'::text NOT NULL,
    department text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.suppliers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    contact_name text,
    email text,
    phone text,
    address text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Reporting operating hierarchy and immutable financial records.
CREATE TABLE IF NOT EXISTS public.stores (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY, tenant_id uuid NOT NULL, code text NOT NULL,
    name text NOT NULL, address text, timezone text DEFAULT 'UTC' NOT NULL,
    is_active boolean DEFAULT true NOT NULL, created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS stores_tenant_code_uidx ON public.stores (tenant_id, code);
CREATE TABLE IF NOT EXISTS public.registers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY, tenant_id uuid NOT NULL, store_id uuid NOT NULL,
    code text NOT NULL, name text NOT NULL, is_active boolean DEFAULT true NOT NULL, created_at timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS registers_tenant_store_code_uidx ON public.registers (tenant_id, store_id, code);
CREATE TABLE IF NOT EXISTS public.register_shifts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY, tenant_id uuid NOT NULL, store_id uuid NOT NULL, register_id uuid NOT NULL,
    cashier_id uuid NOT NULL, opened_by uuid NOT NULL, closed_by uuid, status text DEFAULT 'open' NOT NULL,
    opening_cash numeric(14,2) DEFAULT 0 NOT NULL, expected_cash numeric(14,2), closing_cash numeric(14,2), variance numeric(14,2),
    opened_at timestamptz DEFAULT now() NOT NULL, closed_at timestamptz
);
CREATE INDEX IF NOT EXISTS register_shifts_tenant_opened_idx ON public.register_shifts (tenant_id, opened_at);
CREATE TABLE IF NOT EXISTS public.cash_events (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY, tenant_id uuid NOT NULL, store_id uuid NOT NULL, register_id uuid NOT NULL,
    shift_id uuid NOT NULL, sale_id uuid, type text NOT NULL, amount numeric(14,2) NOT NULL, reason text,
    created_by uuid NOT NULL, approved_by uuid, idempotency_key text, created_at timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS cash_events_tenant_created_idx ON public.cash_events (tenant_id, created_at);
CREATE TABLE IF NOT EXISTS public.sale_payments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY, tenant_id uuid NOT NULL, sale_id uuid NOT NULL, method text NOT NULL,
    amount numeric(14,2) NOT NULL, tendered_amount numeric(14,2), reference text, status text DEFAULT 'captured' NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS sale_payments_tenant_created_idx ON public.sale_payments (tenant_id, created_at);
CREATE TABLE IF NOT EXISTS public.sale_discounts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY, tenant_id uuid NOT NULL, sale_id uuid NOT NULL, sale_item_id uuid,
    type text DEFAULT 'amount' NOT NULL, amount numeric(14,2) NOT NULL, reason text, applied_by uuid NOT NULL,
    approved_by uuid, created_at timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.refunds (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY, tenant_id uuid NOT NULL, sale_id uuid NOT NULL, payment_id uuid,
    amount numeric(14,2) NOT NULL, tax_amount numeric(14,2) DEFAULT 0 NOT NULL, method text NOT NULL, reason text,
    status text DEFAULT 'completed' NOT NULL, created_by uuid NOT NULL, approved_by uuid, created_at timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS refunds_tenant_created_idx ON public.refunds (tenant_id, created_at);
CREATE TABLE IF NOT EXISTS public.refund_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY, tenant_id uuid NOT NULL, refund_id uuid NOT NULL, sale_item_id uuid NOT NULL,
    quantity integer NOT NULL, amount numeric(14,2) NOT NULL, cost_amount numeric(14,2), restocked boolean DEFAULT false NOT NULL
);
CREATE TABLE IF NOT EXISTS public.sale_voids (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY, tenant_id uuid NOT NULL, sale_id uuid NOT NULL, reason text NOT NULL,
    voided_by uuid NOT NULL, approved_by uuid, snapshot jsonb NOT NULL, created_at timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.supplier_products (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY, tenant_id uuid NOT NULL, supplier_id uuid NOT NULL, product_id uuid NOT NULL,
    supplier_sku text, last_unit_cost numeric(14,4), created_at timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS supplier_products_tenant_pair_uidx ON public.supplier_products (tenant_id, supplier_id, product_id);
CREATE TABLE IF NOT EXISTS public.purchase_orders (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY, tenant_id uuid NOT NULL, store_id uuid, supplier_id uuid NOT NULL,
    order_number text NOT NULL, status text DEFAULT 'draft' NOT NULL, subtotal numeric(14,2) DEFAULT 0 NOT NULL,
    tax_amount numeric(14,2) DEFAULT 0 NOT NULL, total_amount numeric(14,2) DEFAULT 0 NOT NULL,
    expected_at timestamptz, ordered_at timestamptz, created_by uuid NOT NULL, idempotency_key text,
    created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_tenant_number_uidx ON public.purchase_orders (tenant_id, order_number);
CREATE TABLE IF NOT EXISTS public.purchase_order_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY, tenant_id uuid NOT NULL, purchase_order_id uuid NOT NULL, product_id uuid NOT NULL,
    quantity_ordered integer NOT NULL, unit_cost numeric(14,4) NOT NULL, tax_amount numeric(14,2) DEFAULT 0 NOT NULL
);
CREATE TABLE IF NOT EXISTS public.purchase_receipts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY, tenant_id uuid NOT NULL, purchase_order_id uuid NOT NULL, store_id uuid,
    reference text, received_by uuid NOT NULL, idempotency_key text, received_at timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.purchase_receipt_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY, tenant_id uuid NOT NULL, receipt_id uuid NOT NULL,
    purchase_order_item_id uuid NOT NULL, product_id uuid NOT NULL, quantity_received integer NOT NULL,
    unit_cost numeric(14,4) NOT NULL, discrepancy_reason text
);
CREATE TABLE IF NOT EXISTS public.receiving_discrepancies (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY, tenant_id uuid NOT NULL, receipt_id uuid NOT NULL,
    purchase_order_item_id uuid NOT NULL, type text NOT NULL, expected_quantity integer NOT NULL,
    received_quantity integer NOT NULL, expected_unit_cost numeric(14,4) NOT NULL, received_unit_cost numeric(14,4),
    reason text NOT NULL, created_at timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS receiving_discrepancies_tenant_receipt_idx ON public.receiving_discrepancies (tenant_id, receipt_id);
CREATE TABLE IF NOT EXISTS public.audit_events (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY, tenant_id uuid NOT NULL, actor_id uuid, store_id uuid,
    action text NOT NULL, entity_type text NOT NULL, entity_id uuid, reason text, before jsonb, after jsonb,
    ip_address text, created_at timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_events_tenant_created_idx ON public.audit_events (tenant_id, created_at);
ALTER TABLE public.cash_events ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE public.purchase_receipts ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS cash_events_tenant_idempotency_uidx ON public.cash_events (tenant_id, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS purchase_receipts_tenant_idempotency_uidx ON public.purchase_receipts (tenant_id, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_tenant_idempotency_uidx ON public.purchase_orders (tenant_id, idempotency_key);

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS store_id uuid;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS register_id uuid;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS shift_id uuid;
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS unit_cost_snapshot numeric(14,4);
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS category_id_snapshot uuid;
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS store_id uuid;
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS sale_id uuid;
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS purchase_receipt_id uuid;
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS reference_type text;
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS reference_id uuid;
CREATE INDEX IF NOT EXISTS sales_tenant_created_idx ON public.sales (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS sales_tenant_store_created_idx ON public.sales (tenant_id, store_id, created_at);
CREATE INDEX IF NOT EXISTS sales_tenant_cashier_created_idx ON public.sales (tenant_id, cashier_id, created_at);
CREATE INDEX IF NOT EXISTS inventory_movements_tenant_created_idx ON public.inventory_movements (tenant_id, created_at);

-- Primary keys (IF NOT EXISTS not supported for constraints; wrapped in DO blocks)
DO $$ BEGIN ALTER TABLE ONLY public.tenants ADD CONSTRAINT tenants_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ONLY public.tenants ADD CONSTRAINT tenants_email_unique UNIQUE (email); EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ONLY public.subscription_plans ADD CONSTRAINT subscription_plans_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ONLY public.subscriptions ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ONLY public.subscriptions ADD CONSTRAINT subscriptions_tenant_id_unique UNIQUE (tenant_id); EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ONLY public.users ADD CONSTRAINT users_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ONLY public.users ADD CONSTRAINT users_email_unique UNIQUE (email); EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ONLY public.sessions ADD CONSTRAINT sessions_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ONLY public.sessions ADD CONSTRAINT sessions_token_unique UNIQUE (token); EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ONLY public.settings ADD CONSTRAINT settings_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ONLY public.settings ADD CONSTRAINT settings_tenant_id_unique UNIQUE (tenant_id); EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ONLY public.categories ADD CONSTRAINT categories_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ONLY public.brands ADD CONSTRAINT brands_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ONLY public.products ADD CONSTRAINT products_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ONLY public.customers ADD CONSTRAINT customers_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ONLY public.sales ADD CONSTRAINT sales_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ONLY public.sale_items ADD CONSTRAINT sale_items_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ONLY public.inventory_movements ADD CONSTRAINT inventory_movements_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ONLY public.employees ADD CONSTRAINT employees_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ONLY public.suppliers ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id); EXCEPTION WHEN duplicate_table THEN NULL; END $$;
