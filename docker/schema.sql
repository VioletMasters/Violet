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
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

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
