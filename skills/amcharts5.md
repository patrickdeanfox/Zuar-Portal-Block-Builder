---
name: amcharts5
description: >
  Expert knowledge for building amCharts 5 data visualizations and charts in JavaScript, TypeScript, React, Vue, Angular, or plain HTML. Use this skill whenever the user asks to create, modify, fix, or explain any amCharts 5 chart — including line charts, bar charts, pie/donut charts, maps, treemaps, Sankey diagrams, stock charts, Gantt charts, radar charts, scatter plots, word clouds, Venn diagrams, timeline charts, or any other amCharts visualization. Also trigger for questions about amCharts 5 API, theming, animations, tooltips, legends, scrollbars, cursors, data formats, React/Vue/Angular integration, exporting, or migration from amCharts 4. Always use this skill instead of relying on general knowledge about amCharts when building or debugging charts. When building amCharts for Zuar Portal, always use the two-block pattern: a global AMCHARTS_LOADER in the page header (loaded once) and individual chart blocks that call window.AMCHARTS_LOADER.load() — never have chart blocks load amCharts scripts directly.
---

# amCharts 5 Skill

## Quick Reference: Chart Type → Reference File

| Chart Type | Reference File |
|---|---|
| Line, area, bar, column, scatter, candlestick, step | `references/xy.md` |
| Pie, donut, funnel, pyramid, pictorial | `references/pie.md` |
| World maps, country maps, choropleth, bubble map | `references/map.md` |
| Treemap, force-directed, sunburst, pack, tree, voronoi | `references/hierarchy.md` |
| Sankey, chord, arc diagram | `references/flow.md` |
| Radar, spider, gauge, clock | `references/radar.md` |
| Financial/stock charts, OHLC, candlestick, indicators | `references/stock.md` |
| Gantt, project timelines | `references/gantt.md` |
| Word cloud, tag cloud | `references/wordcloud.md` |
| Venn, set overlap | `references/venn.md` |
| Serpentine/spiral/curve timelines | `references/timeline.md` |

**Always read the relevant reference file before writing chart code.**

---

## ⚡ Zuar Portal: Multi-Chart Pattern (REQUIRED when building for zPortal)

When building amCharts for **Zuar Portal**, always use the **two-block pattern** — a global loader block in the header plus individual chart blocks. This is critical because:
- Multiple charts on a page will race to load the same library if each tries to load it independently
- The global loader uses a singleton promise so libraries only load once, no matter how many charts exist

### Block 1 — Global Loader (add ONCE to the page header)

```html
<script>
// ============================================================================
// GLOBAL AMCHARTS v5 LOADER - Add this ONCE at the top of your page
// ============================================================================
window.AMCHARTS_LOADER = (function() {
  const AMCHARTS_CONFIG = {
    licenseKey: 'AM5C-XXXX-XXXX-XXXX', // ← replace with actual license key
    cdnBase: 'https://cdn.amcharts.com/lib/5/',
    scripts: [
      'index.js',
      'percent.js',
      'xy.js',
      'themes/Animated.js',
      'radar.js'
    ]
  };

  let loadingPromise = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) { resolve(src); return; }
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => resolve(src);
      script.onerror = () => reject(new Error(`Failed to load: ${src}`));
      document.head.appendChild(script);
    });
  }

  async function loadAmCharts() {
    for (const file of AMCHARTS_CONFIG.scripts) {
      await loadScript(AMCHARTS_CONFIG.cdnBase + file);
    }
    if (window.am5 && AMCHARTS_CONFIG.licenseKey) {
      am5.addLicense(AMCHARTS_CONFIG.licenseKey);
    }
    return true;
  }

  return {
    load: function() {
      if (loadingPromise) return loadingPromise;
      if (window.am5 && window.am5percent && window.am5xy && window.am5themes_Animated) {
        return Promise.resolve(true);
      }
      loadingPromise = loadAmCharts();
      return loadingPromise;
    }
  };
})();
</script>
```

> **Only include scripts you need.** Remove `radar.js`, `percent.js`, etc. if unused.
> **Add extra modules** (e.g. `map.js`, `hierarchy.js`) to the `scripts` array in the loader.

---

### Block 2 — Individual Chart Block (one per chart)

Each chart block calls `window.AMCHARTS_LOADER.load()` and waits — never loads scripts itself.

```html
<div id="chartdiv1" style="width: 100%; height: 400px;"></div>

<script>
// Wait for data helper
function waitForData(timeoutMs = 5000, intervalMs = 100) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (typeof currentBlock !== 'undefined' &&
          currentBlock?.data?.length > 0 &&
          currentBlock?.columns?.length > 0) {
        resolve(currentBlock); return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error('Data timeout')); return;
      }
      setTimeout(check, intervalMs);
    };
    check();
  });
}

(async function init() {
  try {
    // Step 1: wait for libraries via global loader
    await window.AMCHARTS_LOADER.load();

    // Step 2: wait for currentBlock data
    const block = await waitForData();
    const { columns, data } = block;

    // Step 3: extract your column values
    const myValueIndex = columns.indexOf('my_column');
    const myValue = data[0][myValueIndex];

    // Step 4: build the chart
    const root = am5.Root.new("chartdiv1");
    root.setThemes([am5themes_Animated.new(root)]);

    // ... rest of chart code ...

  } catch (e) {
    console.error('Chart init error:', e);
  }
})();
</script>
```

### Key Rules for Zuar Portal Charts

| Rule | Details |
|---|---|
| **Unique div IDs** | Each chart needs a unique `id` (e.g. `chartdiv1`, `chartdiv2`) |
| **Always `await AMCHARTS_LOADER.load()`** | Never load scripts directly in a chart block |
| **Always `await waitForData()`** | `currentBlock` is async — never read it synchronously |
| **Add modules to loader, not chart blocks** | Need `map.js`? Add it to the loader's `scripts` array |
| **Dispose roots on cleanup** | Call `root.dispose()` if rebuilding (e.g. on portal refresh) |

---

## Core Rules (apply to ALL chart types)

### Package Imports
```js
// Core — always required
import * as am5 from "@amcharts/amcharts5";

// Themes
import am5themes_Animated from "@amcharts/amcharts5/themes/Animated";
import am5themes_Dark from "@amcharts/amcharts5/themes/Dark";
import am5themes_Material from "@amcharts/amcharts5/themes/Material";
import am5themes_Kelly from "@amcharts/amcharts5/themes/Kelly";

// Chart packages (import only what you need)
import * as am5xy from "@amcharts/amcharts5/xy";           // XY charts
import * as am5percent from "@amcharts/amcharts5/percent"; // Pie/donut/funnel
import * as am5map from "@amcharts/amcharts5/map";         // Maps
import * as am5hierarchy from "@amcharts/amcharts5/hierarchy"; // Treemap etc.
import * as am5flow from "@amcharts/amcharts5/flow";       // Sankey, chord
import * as am5radar from "@amcharts/amcharts5/radar";     // Radar/gauge
import * as am5stock from "@amcharts/amcharts5/stock";     // Stock charts
import * as am5plugins_exporting from "@amcharts/amcharts5/plugins/Exporting";
import * as am5plugins_wordCloud from "@amcharts/amcharts5/plugins/WordCloud";
import * as am5plugins_venn from "@amcharts/amcharts5/plugins/Venn";
import * as am5plugins_timeline from "@amcharts/amcharts5/plugins/Timeline";

// CDN usage (no build tool)
// <script src="https://cdn.amcharts.com/lib/5/index.js"></script>
// <script src="https://cdn.amcharts.com/lib/5/xy.js"></script>
// etc.
```

### Root Element — Always First
```js
// Create root (MUST target an existing div with a fixed height)
const root = am5.Root.new("chartdiv");

// Apply theme(s) — ALWAYS apply at least Animated
root.setThemes([am5themes_Animated.new(root)]);

// CRITICAL: Dispose on cleanup (React/Vue/Angular)
// return () => root.dispose();
```

### HTML Container Requirements
```html
<!-- Container MUST have explicit height -->
<div id="chartdiv" style="width: 100%; height: 500px;"></div>
```

### Critical v4 → v5 Differences (NEVER use v4 syntax)
| v4 (WRONG) | v5 (CORRECT) |
|---|---|
| `am4core.create()` | `am5.Root.new()` |
| `chart.series.push(...)` | `chart.series.push(Series.new(root, {...}))` |
| `series.dataFields.valueY` | `series.set("valueYField", "value")` |
| `am4core.color("#fff")` | `am5.color("#fff")` |
| `series.tooltip.background.fill` | `series.set("tooltip", am5.Tooltip.new(root, {...}))` |
| `chart.scrollbarX` | `chart.set("scrollbarX", am5xy.XYChartScrollbar.new(...))` |
| `chart.cursor` | `chart.set("cursor", am5xy.XYCursor.new(...))` |
| `am4charts.XYChart` | `am5xy.XYChart` |

### Settings API Pattern
```js
// Everything uses .new(root, { settings }) and .set() / .get()
const series = chart.series.push(
  am5xy.LineSeries.new(root, {
    name: "Series",
    xAxis: xAxis,
    yAxis: yAxis,
    valueYField: "value",
    valueXField: "date",
    tooltip: am5.Tooltip.new(root, {
      labelText: "{valueY}"
    })
  })
);

// Modify after creation
series.set("stroke", am5.color("#ff0000"));
series.get("tooltip").set("labelText", "{valueY} units");
```

### Data
```js
// Set data on the series (or chart for pie/hierarchy)
series.data.setAll([
  { date: new Date("2024-01-01").getTime(), value: 100 },
  { date: new Date("2024-02-01").getTime(), value: 150 },
]);
// Dates MUST be Unix timestamps (milliseconds) for DateAxis
```

### Animations
```js
// Play intro animation after data is set
series.appear(1000);
chart.appear(1000, 100);
```

### Cleanup Pattern (React/Vue/Angular)
```js
useEffect(() => {
  const root = am5.Root.new("chartdiv");
  // ... build chart ...
  return () => { root.dispose(); }; // CRITICAL - prevents memory leaks
}, []);
```

### Common Pitfalls
- ❌ Never use `am4core`, `am4charts`, or any v4 API
- ❌ Never set hex color strings directly — use `am5.color("#hex")`
- ❌ Never forget `root.dispose()` in component cleanup
- ❌ Never use DOM manipulation to change chart container size dynamically without calling `root.resize()`
- ❌ DateAxis expects timestamps in **milliseconds**, not seconds
- ✅ Always apply at least one theme (Animated is the default)
- ✅ Always set explicit height on the chart container div
- ✅ Call `series.appear()` and `chart.appear()` for animations

---

## Theming

```js
// Multiple themes stack
root.setThemes([
  am5themes_Animated.new(root),
  am5themes_Dark.new(root)
]);

// Custom theme
const myTheme = am5.Theme.new(root);
myTheme.rule("Label").setAll({ fontSize: 14, fill: am5.color("#333") });
myTheme.rule("Grid").setAll({ stroke: am5.color("#eee") });
root.setThemes([am5themes_Animated.new(root), myTheme]);
```

---

## Legend
```js
const legend = chart.children.push(am5.Legend.new(root, {
  centerX: am5.percent(50),
  x: am5.percent(50)
}));
legend.data.setAll(chart.series.values);
```

---

## Exporting
```js
import * as am5plugins_exporting from "@amcharts/amcharts5/plugins/Exporting";

const exporting = am5plugins_exporting.Exporting.new(root, {
  menu: am5plugins_exporting.ExportingMenu.new(root, {})
});
// Programmatic export
exporting.export("png");
exporting.export("csv");
exporting.export("xlsx");
exporting.export("pdf");
```

---

## Responsive
```js
root.events.on("frameended", () => {
  // chart auto-reflows on container resize
});
// Use am5.p100 (percent(100)) for width, fixed px for height
```

---

## Docs
Full documentation: https://www.amcharts.com/docs/v5/
API reference: https://www.amcharts.com/docs/v5/reference/
Demos gallery: https://www.amcharts.com/demos/
