# Food AR Viewer — Agent Guide

This document is for AI coding agents. Read this before making any changes to the project.

## What This App Does

A mobile-first web app that lets restaurant customers scan a QR code, browse a food menu, view 3D models of dishes, and place them on their table using AR. Built with React + Vite + Google's `<model-viewer>` web component.

The app is a prototype heading toward production. The model pipeline (`model-pipeline/`) has its own `agents.md` — read that separately if working on model validation.

## Quick Reference

```bash
npm run dev       # Start dev server
npm run build     # Production build → dist/
npm run preview   # Preview production build
```

## File Map

```
src/
├── main.jsx                    # React entry — StrictMode + root render
├── index.css                   # Global reset + font stack
├── App.jsx                     # Top-level: category filter + menu grid + AR modal trigger
├── App.css                     # Layout: header, grid, responsive breakpoints
├── data/
│   └── menuItems.js            # Static menu data — dish names, prices, GLB paths, image paths
└── components/
    ├── MenuCard.jsx             # Single dish card — image, name, price, "View in AR" button
    ├── MenuCard.css
    ├── CategoryFilter.jsx       # Horizontal scrollable category pills
    ├── CategoryFilter.css
    ├── ARViewer.jsx             # THE CORE — 3D viewer + AR launcher + status management
    └── ARViewer.css             # Modal overlay, status screens, AR button styles

public/
├── models/                     # GLB 3D model files served statically
│   ├── burger.glb
│   ├── pizza.glb
│   └── ...                     # 9 total, processed through model-pipeline/
└── images/                     # Menu card preview images (PNG)

model-pipeline/                  # Separate tool — GLB validation & auto-fix
                                 # Has its own package.json and agents.md
```

## Architecture

```
User taps "View in AR" on a MenuCard
    │
    ▼
App.jsx sets arItem state → triggers lazy load of ARViewer chunk (982KB)
    │
    ▼
ARViewer.jsx mounts
    │
    ├── Creates <model-viewer> with the item's GLB URL
    ├── model-viewer downloads the GLB, decodes geometry + textures
    ├── On "load" event → measures bounding box → calculates scale → applies
    ├── Checks AR support via viewer.canActivateAR
    │
    ▼
User taps "View on Your Table"
    │
    ├── launchAR() checks: model loaded? camera permission?
    ├── Calls viewer.activateAR()
    │
    ▼
model-viewer picks the best AR mode for this device:
    ├── WebXR       (Android Chrome — uses same Three.js renderer)
    ├── Scene Viewer (Android fallback — Google app downloads GLB independently)
    └── Quick Look   (iOS Safari — model-viewer converts GLB→USDZ on the fly)
```

## ARViewer.jsx — Critical Design Decisions

This is the most important file. Every decision here exists because something broke without it.

### Status State Machine

```
LOADING ──load──→ READY ──activateAR──→ AR_ACTIVE ──not-presenting──→ READY
   │                │                       │
   │ error          │ activateAR            │ failed
   ▼                │ (denied)              ▼
 ERROR              ▼                   AR_FAILED ──button──→ READY
   │           CAMERA_DENIED
   │ retry         │
   ▼               │ button
 LOADING           ▼
                 READY
```

Seven states. Each maps to a specific UI. Do not collapse states or merge them — each exists because a different user message is needed.

### Runtime Scaling (lines 41-69)

```javascript
const size = viewer.getDimensions();
const maxDim = Math.max(size.x, size.y, size.z);
const scale = targetSize / maxDim;
viewer.scale = `${scale} ${scale} ${scale}`;
```

**Why this exists:** GLB files from different Blender exports have wildly different scales (0.001m to 50m). This normalizes every model to ~30cm (plate size) at runtime.

**Why it's done in JavaScript, not in the GLB:** The model pipeline validates but intentionally does NOT rescale models. Runtime scaling is more resilient — it works regardless of what scale the model arrives at.

**Do NOT remove this.** Do NOT move this to the model pipeline. Do NOT change `TARGET_SIZE_M = 0.3` without understanding that it affects how big food appears on the customer's table in AR.

### `ar-scale="fixed"` (line 276)

**Why "fixed" and not "auto":** With `auto`, iOS Quick Look auto-resizes the model during GLB→USDZ conversion, ignoring the JavaScript-calculated scale. Food geometry can become tiny or invisible. With `fixed`, the runtime scale is preserved in AR mode.

**Do NOT change to "auto".** This was the original cause of the iOS bug (plate visible, food invisible).

### `ar-modes="webxr scene-viewer quick-look"` (line 275)

**Order matters.** model-viewer tries each mode left to right. WebXR is first because it uses the same renderer as the 3D preview (most reliable). Scene Viewer is second (Android fallback). Quick Look is last (iOS fallback).

**Do NOT reorder.** The original order was `scene-viewer webxr quick-look` which caused Scene Viewer (less reliable) to be preferred over WebXR on Android.

### `ar-placement="floor"` (line 277)

The model's bounding box bottom is placed on the detected surface. model-viewer handles Y-offset automatically. Even if a model's plate bottom is at Y=-0.15m (not Y=0), it still appears correctly on the table.

**Do NOT add Y-offset correction code.** model-viewer handles this.

### Shadow Rendering (lines 284-285)

```
shadow-intensity="1"
shadow-softness="0.8"
```

model-viewer renders a soft shadow under the model in the 3D preview. In AR mode, each platform adds its own native shadow (WebXR via Three.js, Scene Viewer via Google AR, Quick Look via Apple AR).

The model pipeline strips baked-in shadow planes from GLB files because they're redundant and can occlude food in AR. The shadow you see comes from these attributes and the AR platform, not from the model.

**Do NOT add shadow meshes back into models.** Do NOT remove these attributes.

### Error Retry System (lines 72-93)

Two layers:
1. **Auto-retry** (lines 72-83): On load error, silently retries up to `MAX_RETRIES=2` times with a cache-busting `?retry=N` query param. The user never sees these attempts.
2. **Manual retry** (lines 86-93): After auto-retries are exhausted, shows "Try Again" button. Resets the retry counter and forces a fresh fetch with `?manual=<timestamp>`.

The cache-busting param is critical. Without it, the browser serves the same failed response from cache.

### launchAR Safety (lines 166-205)

Three guards before `activateAR()`:
1. **Error check** (line 171): Don't attempt AR if model failed to load.
2. **Load gate with timeout** (lines 175-189): Wait for model to fully load, but cap at 10 seconds. Without the timeout, this promise hangs forever if the model is in an error state or loading is stuck.
3. **Camera permission pre-check** (lines 192-200): On Android, checks `navigator.permissions` before the browser's native popup. On iOS, this API throws — the catch block lets model-viewer handle iOS permissions natively.

**Do NOT remove the 10-second timeout.** Without it, tapping "View on Your Table" while the model is loading can freeze the button permanently.

### AR Failed State (lines 258-268)

When `ar-status` reports `"failed"`, the app shows an explicit error message instead of silently returning to READY. This happens when:
- The device doesn't support any AR mode
- Camera permission was denied at the OS level (not caught by the browser permissions API)
- Scene Viewer or Quick Look crashed

**Do NOT change this back to `setStatus(STATUS.READY)`.** Users need to know AR failed, not wonder why nothing happened.

### Lazy Loading (App.jsx line 6)

```javascript
const ARViewer = lazy(() => import("./components/ARViewer"));
```

The ARViewer chunk is 982KB (includes the entire model-viewer library). It only loads when a user taps "View in AR". The menu page loads without this overhead.

**Do NOT change to a static import.** It would add ~1MB to the initial page load.

### Poster Images (line 273)

```jsx
{...(item.imageUrl ? { poster: item.imageUrl } : {})}
```

When an item has an `imageUrl`, it's passed as `poster` to model-viewer. This shows the food image immediately while the 3D model loads (which can take 2-5 seconds on mobile).

**Do NOT remove.** Without it, the user sees a blank grey box for several seconds.

## menuItems.js — Data Contract

Each menu item must have:

```javascript
{
  id: number,          // unique identifier
  name: string,        // display name
  description: string, // short description for the card
  price: number,       // numeric price (formatted with .toFixed(2) in UI)
  category: string,    // used for filtering ("Main Course", "Starters", etc.)
  glbUrl: string,      // path to GLB file in public/models/
  imageUrl: string|null, // path to preview image in public/images/, or null
  arScale: number|null,  // override target size in meters, or null for default 0.3m
}
```

**`glbUrl` must be a root-relative path** (e.g. `/models/burger.glb`). Scene Viewer on Android downloads this URL independently — relative paths or blob URLs break it.

**`arScale` overrides `TARGET_SIZE_M`** for specific items. A pizza might be 0.4m (40cm) while a momo plate is 0.18m. When null, the default 0.3m is used.

## CSS Decisions

### Modal Sizing

```css
.ar-modal { max-width: 540px; max-height: 90vh; }
.ar-viewer-container { height: 420px; }
@media (max-width: 480px) { .ar-viewer-container { height: 340px; } }
```

The viewer container has a fixed height, not percentage-based. This is intentional — model-viewer needs a known pixel height to render correctly. Percentage heights cause it to collapse to 0px.

**Do NOT change to `height: 100%` or `flex: 1`.** model-viewer will not render.

### `inset: 0` on overlay

The overlay uses `position: fixed; inset: 0;` which is shorthand for `top:0; right:0; bottom:0; left:0`. This covers the full viewport including under the iOS safe area.

### Body Scroll Lock (ARViewer.jsx lines 160-163)

```javascript
document.body.style.overflow = "hidden";
return () => { document.body.style.overflow = ""; };
```

When the AR modal is open, body scrolling is disabled. Without this, the user can scroll the menu behind the modal on iOS Safari (rubber-band scrolling bleeds through fixed overlays).

**Do NOT replace with a CSS-only solution.** CSS `overflow: hidden` on body doesn't work reliably on iOS Safari — the JavaScript approach is the only cross-browser fix.

## HTML Meta Tags (index.html)

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="ar" content="on" />
```

- **`maximum-scale=1.0, user-scalable=no`** — Prevents accidental pinch-zoom during model interaction. Without this, two-finger rotate on the 3D model triggers browser zoom instead.
- **`apple-mobile-web-app-capable`** — Enables PWA-like behavior on iOS (full screen when added to home screen).
- **`ar` content `on`** — Signals to Safari that this page contains AR content. Required for Quick Look integration.

**Do NOT remove `maximum-scale=1.0`.** Model interaction breaks on mobile without it.

## Platform Behavior Matrix

```
Platform          AR Mode        Model source       Shadow source
─────────────────────────────────────────────────────────────────
Android Chrome    WebXR          Same Three.js       model-viewer
                                 scene as preview    (shadow-intensity)

Android other     Scene Viewer   Downloads GLB       Google AR engine
                                 from URL            (native shadow)

iOS Safari        Quick Look     model-viewer        Apple AR engine
                                 converts GLB→USDZ   (native shadow)
                                 in browser

Desktop           None (3D only) Same Three.js       model-viewer
                                 scene               (shadow-intensity)
```

Key implication: **Scene Viewer ignores your JavaScript.** It downloads the raw GLB and renders it in a separate process. Your runtime scale, material overrides, or CSS have no effect. The model must be self-contained and correctly structured in the GLB file — which is why the model pipeline exists.

## What To Watch Out For

### Adding New Dishes
1. Process the GLB through `model-pipeline/` before putting it in `public/models/`
2. Add a preview image to `public/images/` (without it, the menu card shows a blank gradient)
3. Add the item to `menuItems.js` with all fields filled
4. Test on both Android and iPhone before shipping

### Changing model-viewer Version
`@google/model-viewer` is at v4.2.0. Major version bumps can change:
- AR mode behavior and attribute names
- `getDimensions()` return format
- Event names and detail payloads
- USDZ export behavior

**Test ALL models on ALL platforms after any model-viewer upgrade.** The AR rendering path is the most fragile part of this app.

### Serving Models in Production
GLB files must be served with:
- `Content-Type: model/gltf-binary`
- `Access-Control-Allow-Origin: *` (Scene Viewer downloads from a different origin)
- `Cache-Control: public, max-age=31536000` (models don't change after upload)

Without CORS headers, Scene Viewer on Android will fail to load the model silently.

### Known Issue: burger.glb = tandoori_chaap.glb
These are the same file (identical MD5). The "Classic Burger" menu item shows tandoori chaap food. Replace `public/models/burger.glb` with an actual burger model.

## Relationship Between Frontend and Model Pipeline

```
Blender export → model-pipeline (validate + fix) → public/models/ → ARViewer.jsx loads it
```

The pipeline ensures:
- No Draco compression (breaks iOS Quick Look + some Android Scene Viewer)
- No unlit materials (render as black/invisible in AR)
- No shadow planes (occlude food in AR)
- Textures embedded and under 4096px
- File under 20MB

ARViewer.jsx assumes:
- The GLB is valid and model-viewer can load it
- It may be at any scale (runtime scaling compensates)
- It may have any Y-offset (model-viewer floor placement compensates)

If a model passes the pipeline, it will work in ARViewer. If a model fails in ARViewer, run it through the pipeline first.
