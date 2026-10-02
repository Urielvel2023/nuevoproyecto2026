# Plantillas de migración desde Excel

Formato de carga para pasar el recetario y la operación del Excel al sistema (ver §10 de `../SISTEMA_INTEGRAL_LIVING.md`).
Las filas de ejemplo solo ilustran el formato; **no son datos reales**.

| Archivo | Contenido | Reglas clave |
|---|---|---|
| `insumos.csv` | Maestro único de insumos | Un costo vigente por insumo, con fecha y moneda; `rendimiento_pct` = peso neto / bruto. |
| `recetas.csv` | Platos, cócteles, bebidas, subrecetas y combos | `rendimiento_cantidad` obligatorio; `misc_pct` = 0 en subrecetas. |
| `receta_lineas.csv` | Ingredientes de cada receta | Una línea usa **o** `codigo_insumo` **o** `codigo_subreceta`; cantidad > 0. |
| `pvp.csv` | Precios de carta e histórico | Una fila por precio y fecha de vigencia (`PVP 010721`, `PVP150821`, `PVP131021` → filas históricas normalizadas a una moneda). |
| `mesas.csv` | Plano de mesas | Salón con mínimo 30 mesas. |
| `empleados.csv` | Personal | `rol_sistema`: gerencia, contaduria, rrhh, cocina, bar, mesero, caja, almacen, auditoria. |

Las columnas `origen_hoja` y `origen_celda` conservan la trazabilidad hacia el Excel original para la reconciliación.
