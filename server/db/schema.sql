-- ==========================================================
-- Esquema multi-tenant para SaaS de bares y restaurantes
-- ==========================================================

-- Cada restaurante es un tenant aislado
CREATE TABLE IF NOT EXISTS restaurants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'CO',      -- código de país (CO, MX, PE, AR, CL, ...)
  currency TEXT NOT NULL DEFAULT 'COP',    -- moneda ISO (COP, MXN, USD, PEN, ARS, CLP...)
  currency_symbol TEXT NOT NULL DEFAULT '$',
  tax_name TEXT NOT NULL DEFAULT 'IVA',    -- nombre del impuesto local
  tax_rate REAL NOT NULL DEFAULT 0,        -- porcentaje, ej 19 = 19%
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Usuarios del sistema, pertenecen a un restaurante y tienen un rol
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','mesero','cocina')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Unidades de medida usadas en inventario/recetas (kg, g, l, ml, unidad, etc.)
-- (se maneja como texto libre validado en la app, no requiere tabla separada)

-- Inventario / almacén: productos e insumos
CREATE TABLE IF NOT EXISTS inventory_items (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general', -- ej: cocina, bar, insumos
  unit TEXT NOT NULL DEFAULT 'unidad',      -- kg, g, l, ml, unidad
  stock REAL NOT NULL DEFAULT 0,
  min_stock REAL NOT NULL DEFAULT 0,
  unit_cost REAL NOT NULL DEFAULT 0,        -- costo por unidad, actualizable
  supplier TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Movimientos de inventario: entradas y salidas (auditoría)
CREATE TABLE IF NOT EXISTS inventory_movements (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  item_id TEXT NOT NULL REFERENCES inventory_items(id),
  type TEXT NOT NULL CHECK (type IN ('entrada','salida','ajuste')),
  quantity REAL NOT NULL,
  reason TEXT,                              -- 'compra', 'venta:<order_item_id>', 'merma', etc.
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Recetas / fichas técnicas: un plato o bebida del menú tiene una receta
CREATE TABLE IF NOT EXISTS recipes (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'cocina' CHECK (type IN ('cocina','bar')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Ingredientes de cada receta (referencian inventario)
CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id),
  quantity REAL NOT NULL  -- cantidad usada en la unidad del inventory_item
);

-- Categorías del menú (entradas, platos fuertes, bebidas, postres, cocteles...)
CREATE TABLE IF NOT EXISTS menu_categories (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Items del menú (plato o bebida), enlazado opcionalmente a una receta para costeo
CREATE TABLE IF NOT EXISTS menu_items (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  category_id TEXT REFERENCES menu_categories(id),
  recipe_id TEXT REFERENCES recipes(id),
  name TEXT NOT NULL,
  description TEXT,
  price REAL NOT NULL DEFAULT 0,
  available INTEGER NOT NULL DEFAULT 1,  -- 1 = disponible, 0 = agotado
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Mesas físicas del restaurante
CREATE TABLE IF NOT EXISTS tables (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  name TEXT NOT NULL,          -- "Mesa 1", "Barra 3"
  status TEXT NOT NULL DEFAULT 'libre' CHECK (status IN ('libre','ocupada'))
);

-- Pedidos (una "cuenta" abierta por mesa)
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  table_id TEXT NOT NULL REFERENCES tables(id),
  waiter_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'abierta' CHECK (status IN ('abierta','cerrada')),
  opened_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT
);

-- Items dentro de un pedido (cada plato/bebida agregado por el mesero)
CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  menu_item_id TEXT NOT NULL REFERENCES menu_items(id),
  name_snapshot TEXT NOT NULL,   -- nombre del plato al momento de pedir
  price_snapshot REAL NOT NULL,  -- precio al momento de pedir
  quantity INTEGER NOT NULL DEFAULT 1,
  kitchen_status TEXT NOT NULL DEFAULT 'pendiente' CHECK (kitchen_status IN ('pendiente','listo','entregado')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_restaurant ON users(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_restaurant ON inventory_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant ON menu_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_tables_restaurant ON tables(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant ON orders(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
