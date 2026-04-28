---
name: currentblock
description: >
  Authoritative reference for reading and working with `currentBlock` inside zPortal HTML blocks.
  Use this skill whenever writing, reviewing, or debugging any JavaScript that touches `currentBlock`,
  `currentBlock.data`, `currentBlock.data.columns`, `currentBlock.data.data`, or `currentBlock.query`
  inside a zPortal HTML block. Also trigger when the user asks how to extract data from a portal block,
  how to get column names or row values from a block's query result, how to make a block reactive to
  filter changes, or how to pass block data into an amCharts chart or table. If the code involves
  `cols.indexOf`, `rows.map`, `__source__`, or any pattern for reading positional row arrays from a
  portal block datasource, always consult this skill first. Never guess at the currentBlock shape —
  always use this skill.
---
 
# currentBlock — How to Read Data Inside zPortal HTML Blocks
 
`currentBlock` is automatically injected by zPortal into every HTML block's script context at page load.
It is a plain synchronous object — not a function, not a Promise, not a global API call.
 
**Always read this skill before writing any code that accesses `currentBlock`.**
For the complete field-level schema and all extraction patterns, read `references/currentblock-schema.md`.
 
---
 
## Top-Level Shape
 
```javascript
currentBlock = {
  data: {
    columns: [ /* column descriptor objects — see schema reference */ ],
    data:    [ /* row arrays — positional, NOT objects */ ]
  },
  query: {
    __source__: '<DATASOURCE_UUID>',  // always present
    columns:    ['col1', 'col2'],     // always present; may be ['*']
    limit:      500,                  // always present; "0" or 0 = unlimited
    where:      '...',                // optional — raw SQL, no WHERE keyword
    group_by:   '...',                // optional
    order_by:   '...',                // optional
    distinct:   false                 // optional — true only on filter blocks
  }
}
```
 
---
 
## The Three Rules That Must Never Be Broken
 
**Rule 1 — Rows are positional arrays, never objects.**
```javascript
// ❌ NEVER
rows.forEach(row => console.log(row.username));
 
// ✅ ALWAYS
const idx = cols.indexOf('username');
rows.forEach(row => console.log(row[idx]));
```
 
**Rule 2 — `currentBlock` is a page-load snapshot. It does not update after filters.**
```javascript
// ❌ NEVER — currentBlock.data is stale inside a load handler
zPortal.dataSource.on('load', dsId, () => {
  const rows = currentBlock.data.data; // WRONG — this is the original page-load data
});
 
// ✅ ALWAYS — use the payload from the event
zPortal.dataSource.on('load', dsId, payload => {
  const rows = payload?.results?.[0]?.data || [];
});
```
 
**Rule 3 — Always use optional chaining. Data can be empty or partially absent.**
```javascript
// ❌ NEVER
const val = currentBlock.data.data[0][0];
 
// ✅ ALWAYS
const val = currentBlock?.data?.data?.[0]?.[0];
```
 
---
 
## Canonical Extraction Patterns
 
These are the only approved patterns for reading currentBlock data.
Copy them exactly — do not improvise variations.
 
```javascript
// 1. Baseline — always start here
const cols = currentBlock?.data?.columns?.map(c => c.name) || [];
const rows = currentBlock?.data?.data || [];
 
// 2. Find a column index by name
const idx = cols.indexOf('my_column');  // returns -1 if not found — always check
 
// 3. Single column as flat array
const values = rows.map(r => r[cols.indexOf('my_column')]);
 
// 4. Rows as objects (for amCharts, tables, etc.)
const records = rows.map(row =>
  Object.fromEntries(cols.map((name, i) => [name, row[i]]))
);
 
// 5. Single-value stat card
const value = currentBlock?.data?.data?.[0]?.[0];
 
// 6. Multi-column first row as object
const cols = currentBlock?.data?.columns?.map(c => c.name) || [];
const firstRow = currentBlock?.data?.data?.[0] || [];
const stat = Object.fromEntries(cols.map((name, i) => [name, firstRow[i]]));
 
// 7. Get datasource UUID from query
const dsId = currentBlock?.query?.__source__;
 
// 8. Reactive re-render pattern (use when block must respond to filter changes)
const dsId = currentBlock?.query?.__source__;
const cols = currentBlock?.data?.columns?.map(c => c.name) || [];
 
function render(payload) {
  const rows = payload?.results?.[0]?.data || [];
  const records = rows.map(row => Object.fromEntries(cols.map((name, i) => [name, row[i]])));
  // update chart / table / UI with records
}
 
// Initial render from currentBlock
render({ results: [{ data: currentBlock?.data?.data || [] }] });
 
// Re-render on every subsequent filter change
zPortal.dataSource.on('load', dsId, render);
```
 
---
 
## When to Read the Schema Reference
 
Read `references/currentblock-schema.md` when you need:
- The full `columns[]` descriptor — all 8 fields with types, nullability, and meaning
- The `type_code` → `type` string mapping table (PostgreSQL OID reference)
- The type-branching pattern for handling numeric vs text vs date columns differently
- The complete `query` field-by-field rules table
- The full anti-patterns list