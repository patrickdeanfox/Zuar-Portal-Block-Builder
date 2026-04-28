# currentBlock — Complete Instruction Set for Block Code Generation

This document is the authoritative reference for how to read and work with `currentBlock` inside zPortal HTML blocks. Any code generated for a portal HTML block **must** follow these rules exactly.

---

## What is `currentBlock`?

`currentBlock` is a JavaScript variable **automatically injected by zPortal** into every HTML block's script context at page load. It is not a function, not a global, and not fetched — it is simply available as a plain object the moment the block's `<script>` runs.

It contains two top-level keys:

```
currentBlock
├── data     → the result of the block's query (columns + row data)
└── query    → the query configuration that produced that data
```

---

## Top-Level Shape

```javascript
{
  data: {
    columns: [ /* column descriptor objects */ ],
    data:    [ /* row arrays */ ]
  },
  query: {
    __source__: '<DATASOURCE_UUID>',
    columns:    ['col1', 'col2'],   // or ['*']
    limit:      500,
    where:      '...',              // optional
    group_by:   '...',              // optional
    order_by:   '...',              // optional
    distinct:   false               // optional
  }
}
```

---

## `currentBlock.data` — Full Shape

### `currentBlock.data.columns`

An **array of column descriptor objects**, one per column returned by the query. Order matches the column order in `currentBlock.data.data`.

```javascript
currentBlock.data.columns = [
  {
    name:          "username",    // string  — the column alias or field name. ALWAYS use this to look up column index.
    type_code:     25,            // integer — PostgreSQL OID type code (e.g. 25 = TEXT, 701 = FLOAT8, 20 = INT8)
    display_size:  null,          // integer | null — display width hint; usually null
    internal_size: -1,            // integer — internal byte size; -1 means variable-length
    precision:     null,          // integer | null — numeric precision; null for non-numeric types
    scale:         null,          // integer | null — numeric scale; null for non-numeric types
    null_ok:       null,          // boolean | null — whether column allows NULLs; often null (not populated)
    type:          "TEXT"         // string  — human-readable type label. Use this for type-based branching.
  },
  {
    name:          "login_month",
    type_code:     701,
    display_size:  null,
    internal_size: 8,
    precision:     null,
    scale:         null,
    null_ok:       null,
    type:          "FLOAT(8)"
  },
  {
    name:          "login_count",
    type_code:     20,
    display_size:  null,
    internal_size: 8,
    precision:     null,
    scale:         null,
    null_ok:       null,
    type:          "INTEGER(8)"
  }
]
```

#### Column type reference (common `type_code` values)

| type_code | type string      | Notes                              |
|-----------|------------------|------------------------------------|
| 25        | TEXT             | Variable-length string             |
| 701       | FLOAT(8)         | Double-precision float             |
| 700       | FLOAT(4)         | Single-precision float             |
| 20        | INTEGER(8)       | 64-bit integer (BIGINT)            |
| 23        | INTEGER(4)       | 32-bit integer (INT)               |
| 21        | INTEGER(2)       | 16-bit integer (SMALLINT)          |
| 16        | BOOLEAN          | true / false                       |
| 1114      | TIMESTAMP        | Timestamp without timezone         |
| 1184      | TIMESTAMPTZ      | Timestamp with timezone            |
| 1082      | DATE             | Date only                          |
| 1700      | NUMERIC          | Arbitrary precision decimal        |
| 114       | JSON             | JSON object                        |
| 3802      | JSONB            | Binary JSON                        |

**Rule:** Always branch on `type` (the string) for human-readable logic. Use `type_code` only when you need exact PostgreSQL type identity.

---

### `currentBlock.data.data`

An **array of row arrays**. Each row is a positional array — values align with `currentBlock.data.columns` by index.

```javascript
currentBlock.data.data = [
  ["admin",                  1,  9],   // row 0
  ["admin",                  2, 10],   // row 1
  ["patrick.mcgrory@zuar.com", 2,  1]  // row 2
  // ...
]
```

**Critical rules:**
- Rows are **not objects** — they are plain arrays. There are no named keys.
- A value at `data[rowIndex][colIndex]` corresponds to `columns[colIndex].name`.
- Values can be `null` for nullable columns.
- The data is always pre-sorted/filtered/limited per the `query` config.

---

## `currentBlock.query` — Full Shape

```javascript
currentBlock.query = {
  __source__: "a2b3474b-054b-4131-96fa-710ff1e8f3a5",  // DATASOURCE UUID — always present
  columns:    ["*"],           // array of column expressions — always present
  limit:      500,             // integer or string — always present; "0" means unlimited
  where:      "total > 0",     // string | undefined — raw SQL WHERE body, no WHERE keyword
  group_by:   "state",         // string | undefined — raw SQL GROUP BY expression
  order_by:   "total DESC",    // string | undefined — raw SQL ORDER BY expression
  distinct:   false            // boolean | undefined — true for deduplication/filter blocks
}
```

### Field-by-field rules

| Field | Type | Always present | Notes |
|---|---|---|---|
| `__source__` | string (UUID) | ✅ Yes | The datasource UUID this block is bound to. Use to call `zPortal.dataSource` methods. |
| `columns` | string[] | ✅ Yes | SQL column expressions. May be `["*"]` or named like `["count(*) as \"cnt\"", "state"]`. |
| `limit` | number \| string | ✅ Yes | Row cap. `"0"` or `0` = unlimited. Never assume a default. |
| `where` | string | ❌ Optional | Raw SQL predicate body. Absent if no filter applied. Never include the `WHERE` keyword. |
| `group_by` | string | ❌ Optional | Raw SQL GROUP BY expression. Absent if not grouping. |
| `order_by` | string | ❌ Optional | Raw SQL ORDER BY expression. Absent if not ordered. |
| `distinct` | boolean | ❌ Optional | `true` on filter/multiselect blocks. Absent or `false` otherwise. |

**Rule:** Always use optional chaining (`?.`) when reading `where`, `group_by`, `order_by`, and `distinct` — they may not exist.

---

## Canonical Data Extraction Patterns

### 1 — Get column names and rows (baseline — always do this first)

```javascript
const cols = currentBlock?.data?.columns?.map(c => c.name) || [];
const rows = currentBlock?.data?.data || [];
```

### 2 — Find a column index by name

```javascript
const idx = cols.indexOf('login_count');   // returns -1 if not found
```

Always check for `-1` before using the index.

### 3 — Get a single column as a flat array

```javascript
const idx = cols.indexOf('login_month');
const months = rows.map(r => r[idx]);
```

### 4 — Convert rows to array of objects (for amCharts, table renders, etc.)

```javascript
const records = rows.map(row =>
  Object.fromEntries(cols.map((name, i) => [name, row[i]]))
);
// Result: [{ username: "admin", login_month: 1, login_count: 9 }, ...]
```

### 5 — Single-value stat card (first column of first row)

```javascript
const value = currentBlock?.data?.data?.[0]?.[0];
```

### 6 — Multi-column stat card (first row, named columns)

```javascript
const cols = currentBlock?.data?.columns?.map(c => c.name) || [];
const firstRow = currentBlock?.data?.data?.[0] || [];
const stat = Object.fromEntries(cols.map((name, i) => [name, firstRow[i]]));
// stat.login_count, stat.username, etc.
```

### 7 — Get the datasource UUID from the query

```javascript
const dsId = currentBlock?.query?.__source__;
```

Use this when calling `zPortal.dataSource.on('load', dsId, handler)` to re-render after filter changes.

### 8 — Branch on column type

```javascript
cols.forEach((name, i) => {
  const colMeta = currentBlock.data.columns[i];
  if (colMeta.type.startsWith('INTEGER') || colMeta.type.startsWith('FLOAT') || colMeta.type === 'NUMERIC') {
    // numeric column — safe to sum, average, format as number
  } else if (colMeta.type === 'TEXT') {
    // string column — use as label/category
  } else if (colMeta.type.includes('TIMESTAMP') || colMeta.type === 'DATE') {
    // date/time column — parse with Date() or a date library
  }
});
```

### 9 — Re-render on filter change (reactive pattern)

`currentBlock` is only valid at initial page load. After a filter fires, re-read data via the datasource event:

```javascript
const dsId = currentBlock?.query?.__source__;
const cols = currentBlock?.data?.columns?.map(c => c.name) || [];

function render(payload) {
  const rows = payload?.results?.[0]?.data || [];
  const records = rows.map(row => Object.fromEntries(cols.map((name, i) => [name, row[i]])));
  // use records to update chart/table/UI
}

// Initial render from currentBlock
render({ results: [{ data: currentBlock?.data?.data || [] }] });

// Re-render when datasource reloads
zPortal.dataSource.on('load', dsId, render);
```

---

## Important Constraints and Rules

| Rule | Detail |
|---|---|
| `currentBlock` is synchronous only | It reflects the page-load query result. After filters change, it does **not** update. Always use `zPortal.dataSource.on('load', dsId, fn)` for reactivity. |
| Rows are positional arrays, not objects | Never try `row.username` — always `row[cols.indexOf('username')]`. |
| Column order matters | The order of `columns[]` and `data[n][]` is always aligned. Never assume alphabetical or any other order. |
| `null` values are real | Any value in a row array can be `null`. Always guard against null before formatting or computing. |
| `limit: "0"` means unlimited | String `"0"` and number `0` are both valid and mean no row cap. |
| `columns: ["*"]` means all datasource columns | The actual column metadata is in `currentBlock.data.columns`, not the query config. |
| `where` is raw SQL | Never add `WHERE` keyword. Do not URL-encode. It is injected directly into the SQL. |
| `distinct` is for filter blocks | Only `true` on multiselect/filter-type blocks. Never set it on chart or table blocks. |

---

## Anti-Patterns (Never Do These)

```javascript
// ❌ WRONG — rows are not objects
rows.forEach(row => console.log(row.username));

// ✅ CORRECT
const idx = cols.indexOf('username');
rows.forEach(row => console.log(row[idx]));

// ❌ WRONG — currentBlock.data is not updated after filters
zPortal.dataSource.on('load', dsId, () => {
  const freshRows = currentBlock.data.data;  // STALE — still the page-load snapshot
});

// ✅ CORRECT — use the payload from the event
zPortal.dataSource.on('load', dsId, payload => {
  const freshRows = payload?.results?.[0]?.data || [];
});

// ❌ WRONG — assuming columns exist without guard
const val = currentBlock.data.data[0][0];   // throws if data is empty

// ✅ CORRECT
const val = currentBlock?.data?.data?.[0]?.[0];

// ❌ WRONG — adding WHERE keyword to query.where
const filter = "WHERE total > 0";

// ✅ CORRECT
const filter = "total > 0";
```
