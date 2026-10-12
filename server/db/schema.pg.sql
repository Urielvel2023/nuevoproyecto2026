-- ==========================================================
-- Esquema multi-tenant para SaaS de bares y restaurantes (PostgreSQL)
-- Equivalente a schema.sql (SQLite), usado en producción cuando
-- DATABASE_URL está definida. Las columnas de fecha/hora se guardan
-- como TEXT (ISO-like) para que las mismas consultas de la app
-- funcionen igual en ambos motores.
-- ==========================================================

CREATE TABLE IF NOT EXISTS restaurants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'CO',
  currency TEXT NOT NULL DEFAULT 'COP',
  currency_symbol TEXT NOT NULL DEFAULT '$',
  tax_name TEXT NOT NULL DEFAULT 'IVA',
  tax_rate DOUBLE PRECISION NOT NULL DEFAULT 0,
  service_charge_rate DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','mesero','cocina')),
  created_at TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  unit TEXT NOT NULL DEFAULT 'unidad',
  stock DOUBLE PRECISION NOT NULL DEFAULT 0,
  min_stock DOUBLE PRECISION NOT NULL DEFAULT 0,
  unit_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
  supplier TEXT,
  updated_at TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  item_id TEXT NOT NULL REFERENCES inventory_items(id),
  type TEXT NOT NULL CHECK (type IN ('entrada','salida','ajuste')),
  quantity DOUBLE PRECISION NOT NULL,
  reason TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS recipes (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'cocina' CHECK (type IN ('cocina','bar')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id),
  quantity DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS menu_categories (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS menu_items (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  category_id TEXT REFERENCES menu_categories(id),
  recipe_id TEXT REFERENCES recipes(id),
  name TEXT NOT NULL,
  description TEXT,
  price DOUBLE PRECISION NOT NULL DEFAULT 0,
  available INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS tables (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'libre' CHECK (status IN ('libre','ocupada'))
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  table_id TEXT REFERENCES tables(id),
  waiter_id TEXT REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'abierta' CHECK (status IN ('abierta','cerrada')),
  channel TEXT NOT NULL DEFAULT 'salon' CHECK (channel IN ('salon','domicilio','recoger')),
  delivery_platform TEXT,
  delivery_status TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  delivery_address TEXT,
  delivery_fee DOUBLE PRECISION NOT NULL DEFAULT 0,
  external_platform_order_id TEXT,
  opened_at TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
  closed_at TEXT
);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  menu_item_id TEXT REFERENCES menu_items(id),
  name_snapshot TEXT NOT NULL,
  price_snapshot DOUBLE PRECISION NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  kitchen_status TEXT NOT NULL DEFAULT 'pendiente' CHECK (kitchen_status IN ('pendiente','listo','entregado')),
  created_at TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

CREATE INDEX IF NOT EXISTS idx_users_restaurant ON users(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_restaurant ON inventory_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant ON menu_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_tables_restaurant ON tables(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant ON orders(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- ==========================================================
-- Facturación electrónica (DIAN/SAT/SUNAT)
-- ==========================================================

CREATE TABLE IF NOT EXISTS fiscal_settings (
  restaurant_id TEXT PRIMARY KEY REFERENCES restaurants(id),
  tax_id TEXT,
  legal_name TEXT,
  fiscal_regime TEXT,
  address TEXT,
  provider TEXT NOT NULL DEFAULT 'none',
  provider_api_key TEXT,
  provider_api_secret TEXT,
  provider_config TEXT,
  invoice_prefix TEXT NOT NULL DEFAULT 'FE',
  invoice_resolution_number TEXT,
  invoice_range_from INTEGER NOT NULL DEFAULT 1,
  invoice_range_to INTEGER NOT NULL DEFAULT 999999,
  next_invoice_number INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS tax_documents (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  order_id TEXT REFERENCES orders(id),
  document_type TEXT NOT NULL DEFAULT 'factura' CHECK (document_type IN ('factura','nota_credito')),
  number INTEGER NOT NULL,
  full_number TEXT NOT NULL,
  customer_name TEXT,
  customer_tax_id TEXT,
  customer_email TEXT,
  subtotal DOUBLE PRECISION NOT NULL DEFAULT 0,
  tax_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  total DOUBLE PRECISION NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente','emitida','rechazada','anulada')),
  provider TEXT NOT NULL DEFAULT 'manual',
  provider_document_id TEXT,
  cufe TEXT,
  xml_content TEXT,
  pdf_url TEXT,
  error_message TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
  issued_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_tax_documents_restaurant ON tax_documents(restaurant_id);

-- ==========================================================
-- Contabilidad básica: bancos y gastos/ingresos
-- ==========================================================

CREATE TABLE IF NOT EXISTS bank_accounts (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  name TEXT NOT NULL,
  account_type TEXT NOT NULL DEFAULT 'banco' CHECK (account_type IN ('banco','caja','otro')),
  bank_name TEXT,
  account_number TEXT,
  initial_balance DOUBLE PRECISION NOT NULL DEFAULT 0,
  is_default_sales_account INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_restaurant ON bank_accounts(restaurant_id);

CREATE TABLE IF NOT EXISTS expense_categories (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'gasto' CHECK (kind IN ('gasto','ingreso'))
);
CREATE INDEX IF NOT EXISTS idx_expense_categories_restaurant ON expense_categories(restaurant_id);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  bank_account_id TEXT REFERENCES bank_accounts(id),
  category_id TEXT REFERENCES expense_categories(id),
  type TEXT NOT NULL CHECK (type IN ('ingreso','gasto')),
  description TEXT,
  supplier TEXT,
  amount DOUBLE PRECISION NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','venta')),
  order_id TEXT REFERENCES orders(id),
  receipt_url TEXT,
  created_by TEXT REFERENCES users(id),
  occurred_at TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
  created_at TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);
CREATE INDEX IF NOT EXISTS idx_transactions_restaurant ON transactions(restaurant_id);

-- ==========================================================
-- Nómina y control de asistencia
-- ==========================================================

CREATE TABLE IF NOT EXISTS employee_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  position TEXT,
  salary_type TEXT NOT NULL DEFAULT 'mensual' CHECK (salary_type IN ('mensual','por_hora')),
  base_salary DOUBLE PRECISION NOT NULL DEFAULT 0,
  hire_date TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS attendance_records (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  clock_in TEXT NOT NULL,
  clock_out TEXT,
  created_at TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);
CREATE INDEX IF NOT EXISTS idx_attendance_restaurant ON attendance_records(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_attendance_user ON attendance_records(user_id);

CREATE TABLE IF NOT EXISTS payroll_periods (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'abierto' CHECK (status IN ('abierto','pagado')),
  created_at TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);
CREATE INDEX IF NOT EXISTS idx_payroll_periods_restaurant ON payroll_periods(restaurant_id);

CREATE TABLE IF NOT EXISTS payroll_items (
  id TEXT PRIMARY KEY,
  period_id TEXT NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  worked_hours DOUBLE PRECISION NOT NULL DEFAULT 0,
  gross_pay DOUBLE PRECISION NOT NULL DEFAULT 0,
  deductions DOUBLE PRECISION NOT NULL DEFAULT 0,
  bonuses DOUBLE PRECISION NOT NULL DEFAULT 0,
  net_pay DOUBLE PRECISION NOT NULL DEFAULT 0,
  details TEXT
);
CREATE INDEX IF NOT EXISTS idx_payroll_items_period ON payroll_items(period_id);

-- ==========================================================
-- Suscripción SaaS (cobro a los restaurantes por usar la plataforma)
-- ==========================================================

CREATE TABLE IF NOT EXISTS platform_subscriptions (
  restaurant_id TEXT PRIMARY KEY REFERENCES restaurants(id),
  plan TEXT NOT NULL DEFAULT 'trial' CHECK (plan IN ('trial','starter','pro')),
  status TEXT NOT NULL DEFAULT 'trialing' CHECK (status IN ('trialing','active','past_due','canceled')),
  provider TEXT NOT NULL DEFAULT 'stripe',   -- 'stripe' | 'wompi'
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  external_reference TEXT,                   -- referencia de la transacción/checkout (Wompi)
  trial_ends_at TEXT,
  current_period_end TEXT,
  updated_at TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);
