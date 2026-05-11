# Green Monochrome WebXR AR HUD

> 日本語のREADMEはこちらです: [README.ja.md](README.ja.md)

Retro green monochrome WebXR AR HUD simulator.

The simulator core is also exposed as an ES module class, `ARGlassSim`, so another repository can import it and mount it into its own DOM.

The current implementation renders the HUD into a fixed `640x480` canvas, then maps that canvas onto a plane placed `1.5m` in front of the viewer. This keeps the display intentionally low-resolution and lighter to render than the earlier 3D line-object approach.

## Files

- `ARGlassSim.js`: reusable ES module class for mounting the simulator into another app
- `index.html`: demo page wiring the module to the bundled launcher UI
- `sample.html`: example of building an app on top of `ARGlassSim`
- `style.css`: stylesheet extracted from the demo page
- `package.json`: marks the repository as ESM and exposes `ARGlassSim.js`

## Import As A Module

```js
import * as THREE from 'three';
import { ARButton } from 'three/examples/jsm/webxr/ARButton.js';
import { ARGlassSim } from '../arglass-sim/ARGlassSim.js';

const sim = new ARGlassSim({
  THREE,
  ARButton,
  mount: document.getElementById('app'),
  launcher: document.getElementById('launcher'),
  touchHint: document.getElementById('touchHint'),
  xrButtonHost: document.getElementById('xrButtonHost'),
  scanlinesEl: document.getElementById('scanlines'),
  controls: {
    brightness: document.getElementById('brightness'),
    contrast: document.getElementById('contrast'),
    glow: document.getElementById('glow'),
    lineThickness: document.getElementById('lineThickness'),
    scanlines: document.getElementById('scanlineToggle'),
    startSimButton: document.getElementById('startSimButton'),
  },
});

sim.start();
sim.setAppearance({ glow: 0.6, contrast: 1.3 });
```

Required options:

- `mount`
- `THREE`

Optional UI hooks:

- `ARButton`
- `launcher`
- `touchHint`
- `xrButtonHost`
- `scanlinesEl`
- `controls`

`sample.html` shows the intended development style for derivative apps: keep `ARGlassSim` as the rendering and XR foundation, and add your own UI, scene behavior, or app-specific logic around it.

## Current Behavior

- Uses WebXR `immersive-ar` when supported
- Shows real-world camera passthrough in AR-capable browsers
- Falls back to a dark full-screen simulator with drag-look controls
- Renders the HUD as a green-only `640x480` canvas texture
- Uses a horizontal HUD FOV of `30°`
- Keeps the HUD fixed `1.5m` in front of the viewer
- Draws:
  - center crosshair
  - scrolling heading tape
  - artificial horizon line
  - bottom status row with time, heading, pitch, and roll
- Supports brightness, contrast, glow, HUD scale, and scanline tuning

## Run Locally

Serve from `localhost` or HTTPS. Do not open the file directly.

Use `liveserver` from Code for FUKUI:

- https://github.com/code4fukui/liveserver

```bash
cd /Users/fukuno/data/js/webvr/arglass-sim
liveserver
```

Then open:

```text
http://localhost:8080
```

## WebXR Notes

- `immersive-ar` requires a browser and device with WebXR AR support.
- Camera passthrough is only available inside a real AR session.
- Many desktop browsers will only run the fallback simulator.
- The heading display is relative to the startup direction, not true magnetic north.

## Controls

The launcher UI is currently hidden by default in the HTML, but the controls still exist in the page:

- `Brightness`
- `Contrast`
- `Glow`
- `HUD Scale`
- `Scanlines`

Fallback simulator controls:

- Drag with mouse or touch to look around

## Tuning

The monochrome look is controlled mainly by:

- `appearance` near the top of the module
- `computeGreenPalette()`
- `applyMonochromeAppearance()`
- `drawHudBox()` and `drawHudLine()`
- `updateHud()` for the actual `640x480` HUD drawing

To make the effect stronger:

- Increase `brightness`
- Increase `contrast`
- Increase `glow`
- Increase `lineThickness`
- Keep `scanlines` enabled

To make it subtler:

- Lower `glow`
- Lower `contrast`
- Disable `scanlines`
- Reduce the fallback CSS `drop-shadow()` and `contrast()` inside `applyMonochromeAppearance()`

## Structure

`ARGlassSim.js` is organized around:

- XR/session setup
- HUD canvas creation
- green monochrome appearance control
- fallback simulator mode
- per-frame HUD drawing

`index.html` is now only a thin demo shell that calls `new ARGlassSim(...).start()`.

`sample.html` is the reference shape for application development on top of the module.
