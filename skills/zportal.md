---
name: zportal
description: >
  Expert knowledge for building HTML blocks within Zuar Portal (zPortal), including use of the
  global `zPortal` API, `currentBlock` data access, amCharts 5 chart integration, and the
  two-section HTML block structure (HTML+JS / CSS). Use this skill whenever the user mentions
  zPortal, zuar portal, currentBlock, zPortal.dataSource, zPortal.block, portal blocks, or is
  writing code intended to run inside a zPortal HTML block. Also trigger when the user asks about
  filtering datasources, showing/hiding blocks, reading portal data, embedding amCharts 5 charts
  in a portal page, block CSS custom properties, theme switching, navigation, stat cards, or data
  tables. Also trigger when the user asks about writing data back to a database from a portal block,
  form submissions, db_modifications, inserting rows from a portal page, the /api/db_modifications/run
  endpoint, or calling any Zuar Portal REST API endpoint (/api or /auth). Always use this skill
  before writing any portal-related code.
---

# zPortal Skill

Guide for writing HTML blocks inside Zuar Portal (v1.16.x).

---

## CRITICAL: HTML Block Structure

zPortal HTML blocks have **two completely separate sections**. Never combine them into a full HTML file.

### Section 1 — HTML + JS
Only the content that would go **between `<body>` tags**. No `<html>`, `<head>`, `<body>`, or `<!DOCTYPE>` tags ever.

```html
<div id="wrapper">
  <div id="chart"></div>
  <script>
    // all JavaScript goes here, inline in a <script> tag
    // or in multiple <script> tags if needed
  </script>
</div>
```

### Section 2 — CSS (separate field)
Only raw CSS rules. No `<style>` tags. Just the selectors and rules.

```css
#wrapper {
  display: flex;
  align-items: center;
  height: 100%;
}

#chart {
  width: 100%;
  height: 400px;
}
```

> **Always output these as two clearly labeled separate blocks.** Never wrap CSS in `<style>` tags and never include `<html>/<head>/<body>` in the HTML section.

---

## Key Concepts

- **Block IID**: Instance ID of a block — always formatted as `content-1-<uuid>` in JS and DOM
- **Datasource ID**: UUID identifying a datasource — used with `zPortal.dataSource`
- **currentBlock**: Auto-injected variable inside HTML blocks with the block's own query results
- **Block `data` field**: The query config (`__source__`, `columns`, `limit`, `where`, `group_by`, `order_by`, `distinct`)

---

## `currentBlock` — Reading Data in HTML Blocks

```javascript
// Shape of currentBlock
{
  data: {
    columns: [{ name: 'col1', type: 'text' }, ...],
    data: [[val1, val2, ...], ...]   // row arrays — NOT objects
  },
  query: {
    __source__: '<DATASOURCE_UUID>',
    columns: ['col1', 'col2'],
    limit: 500,
    where: 'category1 = \'Road\'',
    group_by: '"bikeshop_state"',
    order_by: 'order_id',
    distinct: true
  }
}
```

### Common Patterns

```javascript
// Extract columns and rows
const cols = currentBlock?.data?.columns?.map(c => c.name) || [];
const rows = currentBlock?.data?.data || [];

// Convert rows to array of objects (useful for amCharts dataFields)
const records = rows.map(row => Object.fromEntries(cols.map((c, i) => [c, row[i]])));

// Get single column as flat array
const idx = cols.indexOf('sales');
const sales = rows.map(r => r[idx]);

// Get the block's datasource ID
const dsId = currentBlock?.query?.__source__;

// Single-value stat card (most common pattern)
// data[0][0] = first column of first row
const value = currentBlock?.data?.data?.[0]?.[0];
```

> **Important:** `currentBlock` is only valid synchronously at page load. After filter changes, use `zPortal.dataSource.on('load', dsId, handler)` to re-read data.

---

## Block Query Config (`data` field)

```json
{
  "__source__": "<DATASOURCE_UUID>",
  "columns": ["count(*) as \"cnt\"", "bikeshop_state"],
  "limit": "20000",
  "where": "category1 = 'Road'",
  "group_by": "\"bikeshop_state\"",
  "order_by": "order_id",
  "distinct": true
}
```

- `columns` — SQL expressions OK; use `as "alias"` for column alias
- `limit` — string or number; use `"0"` for unlimited (exports)
- `where` — raw SQL WHERE body, no `WHERE` keyword
- `group_by` — raw SQL GROUP BY expression
- `distinct` — boolean; used on filter blocks

---

## amCharts 5 in HTML Blocks

**Always use amCharts 5** (`am5.*`) — never amCharts 4 (`am4core`, `am4charts`, `am4maps`).

### Two-block loading pattern (required)

amCharts must be loaded via the **global `AMCHARTS_LOADER`** block. This is a dedicated HTML block placed once on the page (in the page header or as a non-visible block). It defines `window.AMCHARTS_LOADER` and handles script loading, deduplication, and licensing.

**Individual chart blocks must never load amCharts scripts directly.** Instead, wrap all chart code in:

```javascript
window.AMCHARTS_LOADER.load().then(function() {
  // all am5.* code goes here
});
```

The `AMCHARTS_LOADER` block itself looks like this (add it once per page, not per chart):

```html
<script>
window.AMCHARTS_LOADER = (function() {
  const AMCHARTS_CONFIG = {
    licenseKey: 'AM5C-3736-6373-6263',
    cdnBase: 'https://cdn.amcharts.com/lib/5/',
    scripts: [
      'index.js',
      'xy.js', 'percent.js', 'radar.js', 'flow.js',
      'hierarchy.js', 'map.js', 'stock.js',
      'themes/Animated.js'
    ]
  };
  let loadingPromise = null;
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(src); return; }
      const s = document.createElement('script');
      s.src = src; s.onload = () => resolve(src); s.onerror = () => reject(new Error('Failed: ' + src));
      document.head.appendChild(s);
    });
  }
  async function loadAmCharts() {
    for (const file of AMCHARTS_CONFIG.scripts)
      await loadScript(AMCHARTS_CONFIG.cdnBase + file);
    if (window.am5 && AMCHARTS_CONFIG.licenseKey) am5.addLicense(AMCHARTS_CONFIG.licenseKey);
    return true;
  }
  return {
    load: function() {
      if (loadingPromise) return loadingPromise;
      if (window.am5 && window.am5xy && window.am5themes_Animated) return Promise.resolve(true);
      loadingPromise = loadAmCharts();
      return loadingPromise;
    }
  };
})();
</script>
```

### amCharts 5 Bar Chart — Full Block Example

**HTML + JS:**
```html
<div id="chartdiv"></div>
<script>
  window.AMCHARTS_LOADER.load().then(function() {

    var root = am5.Root.new("chartdiv");
    root.setThemes([am5themes_Animated.new(root)]);

    var chart = root.container.children.push(
      am5xy.XYChart.new(root, {
        panX: false, panY: false,
        wheelX: "none", wheelY: "none"
      })
    );

    var xAxis = chart.xAxes.push(
      am5xy.CategoryAxis.new(root, {
        categoryField: "category",
        renderer: am5xy.AxisRendererX.new(root, { minGridDistance: 30 })
      })
    );

    var yAxis = chart.yAxes.push(
      am5xy.ValueAxis.new(root, {
        renderer: am5xy.AxisRendererY.new(root, {})
      })
    );

    var series = chart.series.push(
      am5xy.ColumnSeries.new(root, {
        xAxis: xAxis,
        yAxis: yAxis,
        valueYField: "value",
        categoryXField: "category",
        tooltip: am5.Tooltip.new(root, { labelText: "{valueY}" })
      })
    );

    // Build data from currentBlock
    const cols = currentBlock?.data?.columns?.map(c => c.name) || [];
    const rows = currentBlock?.data?.data || [];
    const chartData = rows.map(row => Object.fromEntries(cols.map((c, i) => [c, row[i]])));

    xAxis.data.setAll(chartData);
    series.data.setAll(chartData);
    series.appear(1000);
    chart.appear(1000, 100);

  });
</script>
```

**CSS:**
```css
#chartdiv {
  width: 100%;
  height: 400px;
}
```

### amCharts 5 Line Chart

**HTML + JS:**
```html
<div id="chartdiv"></div>
<script>
  window.AMCHARTS_LOADER.load().then(function() {

    var root = am5.Root.new("chartdiv");
    root.setThemes([am5themes_Animated.new(root)]);

    var chart = root.container.children.push(
      am5xy.XYChart.new(root, { panX: true, panY: false, wheelX: "panX" })
    );

    var xAxis = chart.xAxes.push(
      am5xy.DateAxis.new(root, {
        baseInterval: { timeUnit: "day", count: 1 },
        renderer: am5xy.AxisRendererX.new(root, {})
      })
    );

    var yAxis = chart.yAxes.push(
      am5xy.ValueAxis.new(root, {
        renderer: am5xy.AxisRendererY.new(root, {})
      })
    );

    var series = chart.series.push(
      am5xy.LineSeries.new(root, {
        xAxis: xAxis,
        yAxis: yAxis,
        valueYField: "value",
        valueXField: "date",
        tooltip: am5.Tooltip.new(root, { labelText: "{valueY}" })
      })
    );

    const cols = currentBlock?.data?.columns?.map(c => c.name) || [];
    const rows = currentBlock?.data?.data || [];
    const chartData = rows.map(row => {
      const rec = Object.fromEntries(cols.map((c, i) => [c, row[i]]));
      rec.date = new Date(rec.date).getTime(); // convert date strings to ms timestamp
      return rec;
    });

    series.data.setAll(chartData);
    chart.appear(1000, 100);

  });
</script>
```

**CSS:**
```css
#chartdiv {
  width: 100%;
  height: 400px;
}
```

### amCharts 5 Pie / Donut Chart

**HTML + JS:**
```html
<div id="chartdiv"></div>
<script>
  window.AMCHARTS_LOADER.load().then(function() {

    var root = am5.Root.new("chartdiv");
    root.setThemes([am5themes_Animated.new(root)]);

    var chart = root.container.children.push(
      am5percent.PieChart.new(root, {
        innerRadius: am5.percent(60)  // remove for solid pie
      })
    );

    var series = chart.series.push(
      am5percent.PieSeries.new(root, {
        valueField: "value",
        categoryField: "category",
        tooltip: am5.Tooltip.new(root, { labelText: "{category}: {value}" })
      })
    );

    const cols = currentBlock?.data?.columns?.map(c => c.name) || [];
    const rows = currentBlock?.data?.data || [];
    const chartData = rows.map(row => Object.fromEntries(cols.map((c, i) => [c, row[i]])));

    series.data.setAll(chartData);
    series.appear(1000, 100);

  });
</script>
```

**CSS:**
```css
#chartdiv {
  width: 100%;
  height: 350px;
}
```

### amCharts 5 US Map

**HTML + JS:**
```html
<div id="chartdiv"></div>
<script>
  window.AMCHARTS_LOADER.load().then(function() {

    var root = am5.Root.new("chartdiv");
    root.setThemes([am5themes_Animated.new(root)]);

    var chart = root.container.children.push(
      am5map.MapChart.new(root, {
        projection: am5map.geoAlbersUsa()
      })
    );

    var polygonSeries = chart.series.push(
      am5map.MapPolygonSeries.new(root, {
        geoJSON: am5geodata_usaLow,
        valueField: "value",
        calculateAggregates: true
      })
    );

    polygonSeries.mapPolygons.template.setAll({
      tooltipText: "{name}: {value}",
      fill: am5.color("#D7D9CE"),
      stroke: am5.color("#ffffff"),
      strokeWidth: 1
    });

    polygonSeries.set("heatRules", [{
      target: polygonSeries.mapPolygons.template,
      min: am5.color("#C8E6C9"),
      max: am5.color("#119DA4"),
      dataField: "value",
      key: "fill"
    }]);

    // Build data from currentBlock — expects columns: [value_col, state_id_col]
    const cols = currentBlock?.data?.columns?.map(c => c.name) || [];
    const rows = currentBlock?.data?.data || [];
    const mapData = rows.map(row => {
      const rec = Object.fromEntries(cols.map((c, i) => [c, row[i]]));
      return { id: "US-" + rec.state, value: Number(rec.value) };
    });

    polygonSeries.data.setAll(mapData);
    chart.appear(1000, 100);

  });
</script>
```

**CSS:**
```css
#chartdiv {
  width: 100%;
  height: 400px;
}
```

### Reacting to Filter Changes with amCharts 5

```html
<div id="chartdiv"></div>
<script>
  window.AMCHARTS_LOADER.load().then(function() {

    const dsId = currentBlock?.query?.__source__;

    // Initial render
    const root = am5.Root.new("chartdiv");
    root.setThemes([am5themes_Animated.new(root)]);
    // ... build chart, store series reference

    function buildData(payload) {
      const ds = payload?.dataSource;
      zPortal.dataSource.fetchResults({
        dataSourceId: dsId,
        filters: ds?.filters || {},
        queries: [currentBlock?.query]
      }).then(res => {
        const cols = (res.results?.[0]?.columns || []).map(c => c.name);
        const rows = res.results?.[0]?.data || [];
        const chartData = rows.map(row => Object.fromEntries(cols.map((c, i) => [c, row[i]])));
        series.data.setAll(chartData);  // update chart with new data
      });
    }

    zPortal.dataSource.on('load', dsId, buildData);

  });
</script>
```

---

## HTML Block Patterns (Non-Chart)

### Stat Card (single value)

**HTML + JS:**
```html
<div id="wrapper">
  <div class="stat-value">{{data[0][0] | number}}</div>
  <div class="stat-label">ORDER COUNT</div>
</div>
```
Angular-style filters: `number`, `currency`  
Currency example: `{{data[0][0] / 100 | currency}}` (cents to dollars)

**CSS:**
```css
#wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.stat-value {
  font-size: 2.5rem;
  font-weight: 700;
  color: var(--color-primary);
}

.stat-label {
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-text);
  opacity: 0.7;
  margin-top: 4px;
}
```

### Revert Tableau Dashboard Button

**HTML + JS:**
```html
<div class="wrapper">
  <button class="btn btn-primary" onclick="zPortal.tableau.getViz('content-1-<BLOCK_UUID>').revertAllAsync();">
    Revert Dashboard
  </button>
</div>
```

**CSS:**
```css
.wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}
```

### Theme Switcher Button (Tableau)

**HTML + JS:**
```html
<div class="wrapper">
  <script>
    const dashBlockIid = 'content-1-<TABLEAU_BLOCK_UUID>';
    const LS_KEY = "portal.custom.selectedTheme";
    const lightDash = "https://tableau.../LightView",
          darkDash  = "https://tableau.../DarkView";

    let selectedTheme = localStorage.getItem(LS_KEY);
    switchTheme(selectedTheme || 'light');

    function switchTheme(to) {
      if (to === 'light') {
        document.querySelector('#darkButton').classList.remove('hidden');
        document.querySelector('#lightButton').classList.add('hidden');
        zPortal.tableau.setUrl(dashBlockIid, lightDash);
      } else {
        document.querySelector('#lightButton').classList.remove('hidden');
        document.querySelector('#darkButton').classList.add('hidden');
        zPortal.tableau.setUrl(dashBlockIid, darkDash);
      }
      localStorage.setItem(LS_KEY, to);
    }
  </script>
  <button id="lightButton" class="btn btn-primary hidden" onClick="switchTheme('light')">Light</button>
  <button id="darkButton" class="btn btn-primary hidden" onClick="switchTheme('dark')">Dark</button>
</div>
```

**CSS:**
```css
.wrapper {
  display: flex;
  align-items: center;
  height: 100%;
}

.hidden {
  display: none !important;
}
```

### Side Nav (Bootstrap collapse)

**HTML + JS:**
```html
<div id="sidenav">
  <script type="text/javascript">
    styleNavSelectedItem();

    function styleNavSelectedItem(e) {
      const href = e ? e.target.href : window.location.href;
      let slug = getSlugFromUrlString(href);
      const navItemEl = document.querySelector(`.nav-link[href='${slug}'`);
      document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
      if (navItemEl) {
        navItemEl.classList.add('active');
        navItemEl.parentElement.parentElement.parentElement.parentElement.classList.add('active');
        $(navItemEl.parentElement.parentElement.parentElement).collapse('show');
      }
    }

    function getSlugFromUrlString(url) {
      if (url.includes('#')) {
        return `/p/${url.split('/p/').pop().split('?')[0].split('#')[0]}#${url.split('#').pop()}`;
      }
      return `/p/${url.split('/p/').pop().split('?')[0]}`;
    }
  </script>
  <ul class="nav flex-column">
    <li class="nav-item">
      <a class="nav-link has-arrow collapsed" data-toggle="collapse" data-target="#section1">
        <i class="fa fa-chart-pie"></i> <span class="d-none d-sm-inline">Analytics</span>
      </a>
      <div class="collapse" id="section1">
        <ul class="nav subnav flex-column">
          <li class="nav-item"><a class="nav-link" href="/p/home">Home</a></li>
          <li class="nav-item"><a class="nav-link" href="/p/operations-dashboard">Operations</a></li>
        </ul>
      </div>
    </li>
  </ul>
</div>
```

**CSS:**
```css
#sidenav {
  padding: 10px 0;
}

.nav-link {
  color: var(--color-text);
  padding: 8px 16px;
}

.nav-link.active {
  color: var(--color-primary);
  font-weight: 600;
}

.subnav .nav-link {
  padding-left: 32px;
  font-size: 0.9rem;
}
```

### Video Gallery (show/hide by URL hash)

**HTML + JS:**
```html
<div id="video-container">
  <script>
    const videoHash = {
      'video-slug-1': 'content-1-<BLOCK_UUID_1>',
      'video-slug-2': 'content-1-<BLOCK_UUID_2>',
    };

    function setVideo() {
      const videoSlug = location.hash.substring(1);
      const requestedIid = videoHash[videoSlug];
      Object.values(videoHash).forEach(iid => {
        if (iid === requestedIid) {
          zPortal.block.show(iid);
        } else {
          zPortal.block.hide(iid);
        }
      });
    }

    window.addEventListener('hashchange', setVideo);
    setVideo();
  </script>
</div>
```

**CSS:**
```css
#video-container {
  width: 100%;
  height: 100%;
}
```

---

## CSS Custom Properties (Theme Variables)

Always use these variables instead of hardcoded colors so blocks respect the active theme:

| Variable | Light | Dark |
|---|---|---|
| `--color-primary` | `#119DA4` | `#0C7489` |
| `--color-text` | `#040404` | `#DCDEE5` |
| `--color-link` | `#040404` | `#DCDEE5` |
| `--color-success` | `#93C54B` | `#93C54B` |
| `--color-danger` | `#d9534f` | `#d9534f` |
| `--body-bg-color` | `#fafdff` | `#22252f` |
| `--header-bg-color` | `#fff` | `#2D313E` |
| `--sidebar-bg-color` | `#e6edf2` | `#2D313E` |
| `--header-height` | `70px` | `70px` |
| `--footer-height` | `68px` | `68px` |
| `--sidebar-left-width` | `250px` | `250px` |

```css
/* Good — adapts to theme */
.my-element {
  color: var(--color-primary);
  background: var(--body-bg-color);
}
```

---

## Block Types Reference

| Type | Description |
|---|---|
| `html` | **Primary type — used 99.9% of the time.** Custom HTML+JS block with separate CSS. |
| `data-table` | Built-in data grid |
| `amchart` | Native amCharts block (config-driven, less flexible than html block) |
| `multiselect` | Dropdown filter block |
| `date-time` | Date range filter block |
| `clear-filters-button` | Clears all active filters |
| `tableau-dashboard` | Embedded Tableau viz |
| `user-menu` | User account menu |

### Multiselect filter config
```json
{
  "inputLabel": "State",
  "help": "",
  "filter": "bikeshop_state",
  "optionValues": "bikeshop_state",
  "optionLabels": "bikeshop_state",
  "defaults": []
}
```
The `filter` value is the column name passed to `zPortal.dataSource.setFilters()`.

---

## zPortal API Quick Reference

```javascript
// === DATA & FILTERING ===
zPortal.dataSource.setFilters('state', ['CA', 'TX']);   // set filter + refresh
zPortal.dataSource.setFilters('state', []);              // clear one filter
zPortal.dataSource.setRangeFilters('date', { min: '2023-01-01', max: '2023-12-31' });
zPortal.dataSource.clearFilters();                       // clears ALL filters everywhere

// Inspect datasources on the page
zPortal.dataSource.get().forEach(ds =>
  console.log(ds.name, ds.id, Object.keys(ds.filtersParams || {}))
);

// Ad-hoc fetch
zPortal.dataSource.fetchResults({
  dataSourceId: '<UUID>',
  filters: {},
  queries: [{ columns: ['*'], limit: '0' }]
}).then(res => {
  const cols = res.results?.[0]?.columns?.map(c => c.name);
  const rows = res.results?.[0]?.data;
});

// Listen for datasource reload
zPortal.dataSource.on('load', '<DATASOURCE_UUID>', payload => { /* re-render */ });
zPortal.dataSource.off('load', '<DATASOURCE_UUID>', handler); // must pass same fn ref

// === BLOCK VISIBILITY ===
zPortal.block.show('content-1-<UUID>');
zPortal.block.hide('content-1-<UUID>');
zPortal.block.getData('content-1-<UUID>');  // returns [[v1,v2],[...]] row arrays
zPortal.block.once('load', 'content-1-<UUID>', () => { /* init once */ });

// === USER ===
zPortal.user?.is_admin      // boolean
zPortal.user?.fullname      // string
zPortal.user?.groups        // string[]
zPortal.user.logout()

// === TABLEAU ===
zPortal.tableau.setUrl('content-1-<UUID>', 'https://...');
zPortal.tableau.getViz('content-1-<UUID>').revertAllAsync();

// === MODAL ===
zPortal.modal.show({
  title: 'Confirm', body: 'Sure?',
  dismissButton: 'Cancel', confirmButton: 'OK', size: 'md'
}).then(() => {}).catch(() => {});

// === PAGE ===
console.log(zPortal.page?.name, zPortal.page?.id);
zPortal.page.generateFetchResultsReport();

// === RESOURCES ===
zPortal.resources.load('https://...');

// === PARTIALS ===
zPortal.partial.slide('header', 'height');
```

---

## Known Bugs / Quirks

| Issue | Detail |
|---|---|
| `setRangeFitlers()` typo alias | Both spellings work; prefer `setRangeFilters()` |
| `clearFilters()` is always global | Cannot clear one datasource — use `setFilters(col, [])` |
| `.off()` needs exact function reference | Store callbacks in variables; anonymous fns can't unsubscribe |
| Inactive datasources ignore refresh | `isActive: false` datasources won't re-fetch |
| `block.getData()` returns row arrays | Returns `[[v1,v2],...]` — not objects. Access by index. |

---

## Writing Data Back: `db_modifications` Service

Use Portal's Database Modification Service when a block needs to **write data** (insert, update, delete) to a database. This is the correct approach for feedback forms, logging, user input capture, etc.

**How it works:**
1. A Portal admin pre-defines named SQL templates (with `:named_params`) via `/api/db_modifications/`
2. Browser JS POSTs to `/api/db_modifications/run` with the template name + param values
3. Authentication is automatic (JWT cookie)

**Quick example — single insert from a block:**
```javascript
await fetch('/api/db_modifications/run', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    db_modifications: [
      {
        name: 'your_modification_name',   // defined by admin
        params: { col_a: 'value', col_b: 42 }
      }
    ]
  })
});
```

Key options on the POST body:
- `params` — single row of values
- `params_list` — array of rows (bulk insert)
- `autocommit: true` — each modification runs in its own transaction (partial success allowed)
- `ignore_sql_errors: true` — skip failing modifications instead of aborting

> **Read `references/db-modifications.md`** for the full guide, including admin setup, transaction behavior, error handling, and a complete working form block example.

---

## Reference Files

Read these files when building the relevant block type — they are authoritative templates to follow closely.

- `references/table-currentblock-template.html` — **Read this when building any table/data display block.** Full working HTML block that safely reads `currentBlock`, renders a styled responsive table, handles array and object rows, and auto-refreshes via polling when data changes.

- `references/amchart-currentblock-template.html` — **Read this when building any amCharts 5 chart block.** Shows the correct pattern: wrapping all chart code in `window.AMCHARTS_LOADER.load().then(...)`, reading `currentBlock`, and building the chart. Does not load scripts directly — requires the global AMCHARTS_LOADER block to be present on the page.

- `references/csv-download-pattern.md` — Full working CSV download button HTML block (fetches all rows via `zPortal.dataSource.fetchResults`, respects active filters, triggers browser download).

- `references/api-full.md` — Complete zPortal API reference (all namespaces and full signatures). Read when you need a less-common method or full detail on a specific API.

- `references/db-modifications.md` — **Read this when building any block that writes data back to a database** (form submissions, feedback capture, logging, etc.). Covers the `db_modifications` service: how to define modifications via the Portal admin API, how to POST to `/api/db_modifications/run` from JS, transaction modes (`autocommit`), error handling (`ignore_sql_errors`), and a complete feedback form example.

- `references/rest-api.md` — **Full REST API reference for both Portal (`/api`) and Auth (`/auth`) services.** Read this when you need to call the Portal API directly (e.g., fetching datasource data, creating/updating blocks, managing users/groups/permissions, running db_modifications via the admin API, uploading assets, or working with access policies). Covers all endpoints, request body shapes, and response formats.
