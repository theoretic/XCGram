# XCGram — Windy.com sounding plugin for pilots

An interactive **aerological sounding** (Skew-T log-P) for Windy.com, built for
free-flight and cross-country pilots. It draws the vertical profile at any point
you click and — the part that matters — **explains every feature in plain
language**: where the cumulus base sits, how high thermals will go, whether the
day is capped by an inversion, how strong and sheared the wind is, and what the
CAPE/CIN numbers mean for your flight. It can also paint those derived values as
**colour overlays across the map**.

## Tabs

The right-hand panel has three tabs. The **model selector** and **forecast time
slider** are shared by Diagram and Layers, so both stay on the same model and
hour. On open, a sounding is auto-loaded for the **map centre** so the timeline
is live before you click anything.

### Diagram

- **Skew-T log-P** with skewed isotherms, dry & moist adiabats, mixing-ratio
  lines, environmental temperature (red) and dew point (blue), a lifted surface
  **parcel** (green), and wind barbs.
- **Markers** for cumulus cloud base (LCL) and thermal top (EL).
- **Hover readout**: height, pressure, temperature, dew point and wind at the cursor.
- **Zoom & pan**: mouse wheel (zoom about cursor), pinch (touch), drag to pan in
  both directions, double-click or the ⤢ button to reset. Zoom is a uniform
  affine transform, so curve **inclinations stay fixed** at any scale.
- **Explanation cards** for cloud base, thermal top, CAPE, CIN, trigger
  temperature, freezing level, inversions, boundary-layer wind, wind shear and a
  thermal-strength estimate — each colour-coded and expandable into *what it is*
  and *why it matters in the air*.

### Layers

Colours the map with values computed by the plugin from soundings sampled across
the current view. Six layers:

| Layer | Scale |
|-------|-------|
| Cloud base | red (low) → blue (high) |
| Thermal top | red (low) → blue (high) |
| Inversion strength | red (weak) → blue (strong) |
| Thermal activity | transparent → red |
| CAPE | transparent → red |
| Thermal clouds | transparent → grey (α = condensation likelihood below the thermal top) |

Controls: layer picker, grid size **S / M / L** (8×6 / 12×9 / 16×12 points),
**AGL/MSL** toggle for the height layers, a **Compute overlay** button, an opacity
slider and a legend.

> **How it works.** Windy keeps only the *active* overlay's data on the client,
> so sounding-derived fields can't be read per map pixel. Instead the plugin
> samples a coarse grid over the viewport — **one meteogram fetch per grid point**
> (concurrency-limited, cached per ~0.1° bucket) — paints the result into a small
> canvas and places it as an `L.ImageOverlay` that the browser upscales smoothly.
> Changing the **time** re-derives from cache (no network); only changing the
> viewport, grid size or model re-samples. A wide view at **L** is ~192 fetches —
> start small.

### Guide

An in-panel field guide to reading a Windy sounding: diagram elements,
forecasting convection, convection-layer thickness and cloud base / condensation
level, plus a quick workflow.

## Outdated-data warning

The plugin records the model run its data came from (`header.updateTs`) and
compares it against the model's latest published run, read live from
`@windy/products` (`products[model].calendar.updateTs`, no refetch, re-checked
each minute). When a newer run exists it shows an amber **"data outdated — refresh
advised"** banner with a **Refresh** button that re-fetches in place (no page
reload) and invalidates the map overlay.

## Data

Profiles come from Windy's own forecast via `@windy/fetch`
(`getMeteogramForecastData`) — temperature, dew point, wind and geopotential
height at the standard pressure levels (1000…150 hPa) plus the surface. No API
key is needed; the plugin only runs on the windy.com domain. Derived quantities
(LCL, CAPE/CIN, parcel ascent, etc.) are computed locally in `src/lib/thermo.ts`
using standard parcel theory (Bolton 1980).

## Project layout

```
src/
  pluginConfig.ts      plugin metadata (right-pane, context menu, single-click)
  plugin.svelte        shell: tabs, shared model/time state, map picker, refresh
  types.ts             SoundingProfile / Derived index types
  content/
    guide.ts           the in-panel Guide content
  lib/
    levels.ts          pressure levels + thermodynamic constants
    thermo.ts          parcel theory: LCL, CAPE/CIN, thermal top, lapse rates …
    windyData.ts       Windy meteogram payload → SoundingProfile[] (+ updateTs)
    explain.ts         the plain-language explanation cards
    grid.ts            coarse-grid viewport sampler + per-point profile cache
    layers.ts          the six overlay definitions + colour ramps
    heatmap.ts         grid → canvas → L.ImageOverlay on the map
  components/
    Sounding.svelte    the interactive d3 Skew-T (zoom/pan/hover)
    TimeSlider.svelte  forecast-hour scrubber
    Explainer.svelte   expandable explanation cards
    Guide.svelte       the Guide tab
    MapLayers.svelte   the Layers tab (controls, sampling, legend)
```

## Develop & run locally

```bash
npm install      # one-time; pulls build tooling + d3
npm start        # builds in watch mode, serves https://localhost:9999/plugin.js
```

### TLS certificate (do this once)

Windy.com (public HTTPS) loads the plugin from `https://localhost:9999`
cross-origin. The dev cert bundled with `@windycom/plugin-devtools` has **no
Subject Alternative Name**, so Chromium (Edge/Chrome) rejects it even if trusted.
Issue a proper localhost cert with [mkcert](https://github.com/FiloSottile/mkcert):

```bash
mkcert -install
mkcert -cert-file certs/localhost.pem -key-file certs/localhost-key.pem localhost 127.0.0.1 ::1
```

`rollup.config.js` automatically uses `certs/localhost.pem` when present (else it
falls back to the bundled cert). `mkcert -install` trusts the CA in Windows **and**
Firefox. `certs/` is git-ignored. The dev server also sends
`Access-Control-Allow-Private-Network: true` for browsers' Private Network Access
checks.

### Load into Windy

1. Open **https://localhost:9999/plugin.js** once — the padlock should be clean
   (no warning). If it warns, the cert step above didn't take.
2. Go to **https://www.windy.com/developer-mode** and load
   `https://localhost:9999/plugin.js`.
3. The plugin opens on the map centre; **click anywhere** (or right-click →
   *XCGram*) to load the sounding for another point.

## Build for distribution

```bash
npm run build        # macOS/Linux
npm run build:win    # Windows
```

Outputs `dist/plugin.min.js` plus `package.json`, ready to publish as an npm
package and install on Windy by name.

## Notes & limitations

- **Never name a top-level identifier `W`** — Windy's loader binds every
  `@windy/*` import to a global `W`; a module-scope `W` shadows it and the plugin
  throws *"Cannot access 'W' before initialization"* on load.
- The moist-adiabat ascent and CAPE/CIN are pragmatic approximations — good for
  reading the soaring day, not for research.
- Map overlays cost one forecast fetch per grid point; large grids over wide
  areas can hit Windy's rate limits. Start with **S**/**M**.
- Available pressure levels and the deepest forecast horizon depend on the chosen
  model (ECMWF, GFS, ICON-EU, ICON-D2, AROME).

Built on the [Windy plugin template](https://github.com/windycom/windy-plugin-template).
Inspired by the late, much-loved *Better Soundings* (sdg) plugin.
