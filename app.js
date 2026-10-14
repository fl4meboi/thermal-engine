// THERMAL STUDIO - Code-Art Portrait & Real-Time Webcam Stylizer Engine

const PALETTES = {
  rainbow: [
    { pos: 0.00, color: [5, 7, 22] },      // Deep midnight blue-black
    { pos: 0.14, color: [12, 44, 138] },   // Royal indigo blue
    { pos: 0.30, color: [0, 128, 255] },   // Electric cobalt blue
    { pos: 0.45, color: [0, 220, 220] },   // Glowing cyan
    { pos: 0.60, color: [34, 229, 92] },   // Spectral emerald green
    { pos: 0.76, color: [255, 230, 0] },   // Solar yellow
    { pos: 0.90, color: [255, 75, 0] },    // Fiery orange-red
    { pos: 1.00, color: [235, 10, 40] }    // Deep thermal crimson-red
  ],
  rainbow_hot: [
    { pos: 0.00, color: [4, 6, 20] },
    { pos: 0.13, color: [14, 48, 150] },
    { pos: 0.28, color: [0, 135, 255] },
    { pos: 0.43, color: [0, 225, 215] },
    { pos: 0.58, color: [40, 232, 85] },
    { pos: 0.73, color: [255, 230, 0] },
    { pos: 0.86, color: [255, 60, 0] },
    { pos: 0.94, color: [230, 0, 45] },
    { pos: 1.00, color: [255, 242, 245] }
  ],
  predator: [
    { pos: 0.00, color: [2, 5, 18] },
    { pos: 0.16, color: [18, 12, 95] },
    { pos: 0.32, color: [0, 105, 230] },
    { pos: 0.48, color: [0, 210, 170] },
    { pos: 0.64, color: [130, 245, 20] },
    { pos: 0.80, color: [255, 215, 0] },
    { pos: 0.92, color: [255, 50, 0] },
    { pos: 1.00, color: [255, 0, 55] }
  ],
  flir: [
    { pos: 0.00, color: [5, 3, 18] },
    { pos: 0.18, color: [35, 11, 78] },
    { pos: 0.36, color: [105, 18, 112] },
    { pos: 0.54, color: [182, 42, 90] },
    { pos: 0.72, color: [240, 105, 25] },
    { pos: 0.88, color: [252, 212, 58] },
    { pos: 1.00, color: [255, 252, 235] }
  ],
  inferno: [
    { pos: 0.00, color: [2, 1, 8] },
    { pos: 0.22, color: [48, 10, 82] },
    { pos: 0.45, color: [128, 25, 95] },
    { pos: 0.68, color: [215, 65, 50] },
    { pos: 0.86, color: [252, 165, 45] },
    { pos: 1.00, color: [252, 253, 191] }
  ],
  acid: [
    { pos: 0.00, color: [4, 9, 14] },
    { pos: 0.20, color: [8, 52, 68] },
    { pos: 0.42, color: [0, 185, 130] },
    { pos: 0.64, color: [135, 255, 15] },
    { pos: 0.82, color: [255, 225, 0] },
    { pos: 1.00, color: [255, 15, 128] }
  ]
};

const DEFAULT_STATE = {
  sourceMode: "still",    // 'still' | 'webcam'
  mode: "thermal",        // 'thermal' | 'topo' | 'generative' | 'layered'
  palette: "rainbow",
  hueShift: 0,
  posterize: 0,
  invertThermal: false,
  smoothing: 3.5,
  contrast: 1.20,
  gamma: 0.95,
  exposure: 0.0,
  detailBoost: 0.35,
  autoNormalize: true,
  // Topo
  topoStyle: "overlay",   // 'overlay' | 'wireframe' | 'plateau' | 'ink'
  contourCount: 18,
  contourThickness: 1.35,
  contourMix: 0.80,
  // Generative
  genStyle: "halftone",   // 'halftone' | 'ascii' | 'scanlines' | 'led'
  cellSize: 10,
  genScale: 1.15,
  genBgMix: 0.15,
  // Optics & FX
  bloom: 0.45,
  chroma: 2.0,
  grain: 0.08,
  scanline: 0.15,
  showHud: false
};

let state = { ...DEFAULT_STATE };
let imagesList = [];
let activeIndex = 0;
let isGridView = false;
let isHoldingOriginal = false;
let lut = new Uint8ClampedArray(1024 * 3);

// Webcam state
const videoEl = document.getElementById("webcamVideo");
let webcamStream = null;
let webcamActive = false;
let webcamFrozen = false;
let mirrorWebcam = true;
let webcamTargetHeight = 640;
let webcamRafId = null;
let webcamCapCanvas = document.createElement("canvas");
let webcamCapCtx = webcamCapCanvas.getContext("2d", { willReadFrequently: true });
let webcamRawBuffer = null;
let webcamHist = new Uint32Array(1000);
let smoothTelemetry = { maxX: 320, maxY: 240, maxVal: 0.9, minX: 100, minY: 100, minVal: 0.1, initialized: false };

// FPS tracking
let fpsFrameCount = 0;
let fpsLastTime = performance.now();

// Video Recording state
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;

// Offscreen buffers
const mainCanvas = document.getElementById("mainCanvas");
const mainCtx = mainCanvas.getContext("2d", { willReadFrequently: true });
const offCanvas = document.createElement("canvas");
const offCtx = offCanvas.getContext("2d", { willReadFrequently: true });
const bloomCanvas = document.createElement("canvas");
const bloomCtx = bloomCanvas.getContext("2d");

// RGB <-> HSL helper for Hue Shift
function shiftHueRGB(r, g, b, deg) {
  if (deg === 0) return [r, g, b];
  const rad = (deg * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);
  const s1 = 1 / 3;
  const s2 = Math.sqrt(1 / 3);
  const m00 = cosA + (1 - cosA) * s1;
  const m01 = s1 * (1 - cosA) - s2 * sinA;
  const m02 = s1 * (1 - cosA) + s2 * sinA;
  const m10 = s1 * (1 - cosA) + s2 * sinA;
  const m11 = cosA + s1 * (1 - cosA);
  const m12 = s1 * (1 - cosA) - s2 * sinA;
  const m20 = s1 * (1 - cosA) - s2 * sinA;
  const m21 = s1 * (1 - cosA) + s2 * sinA;
  const m22 = cosA + s1 * (1 - cosA);
  return [
    Math.min(255, Math.max(0, Math.round(r * m00 + g * m01 + b * m02))),
    Math.min(255, Math.max(0, Math.round(r * m10 + g * m11 + b * m12))),
    Math.min(255, Math.max(0, Math.round(r * m20 + g * m21 + b * m22)))
  ];
}

function buildLUT() {
  const stops = PALETTES[state.palette] || PALETTES.rainbow;
  const n = 1024;
  for (let i = 0; i < n; i++) {
    let t = i / (n - 1);
    if (state.posterize >= 2) {
      t = Math.floor(t * state.posterize) / (state.posterize - 1);
      t = Math.min(1, Math.max(0, t));
    }
    let s0 = stops[0];
    let s1 = stops[stops.length - 1];
    for (let j = 0; j < stops.length - 1; j++) {
      if (t >= stops[j].pos && t <= stops[j + 1].pos) {
        s0 = stops[j];
        s1 = stops[j + 1];
        break;
      }
    }
    const span = s1.pos - s0.pos || 1;
    const localT = (t - s0.pos) / span;
    const smoothT = localT * localT * (3 - 2 * localT);
    let r = s0.color[0] + (s1.color[0] - s0.color[0]) * smoothT;
    let g = s0.color[1] + (s1.color[1] - s0.color[1]) * smoothT;
    let b = s0.color[2] + (s1.color[2] - s0.color[2]) * smoothT;

    if (state.hueShift !== 0) {
      [r, g, b] = shiftHueRGB(r, g, b, state.hueShift);
    }
    lut[i * 3] = r;
    lut[i * 3 + 1] = g;
    lut[i * 3 + 2] = b;
  }
  drawPalettePreview();
}

function drawPalettePreview() {
  const pCanvas = document.getElementById("palettePreviewCanvas");
  if (!pCanvas) return;
  const ctx = pCanvas.getContext("2d");
  const w = pCanvas.width;
  const h = pCanvas.height;
  const imgData = ctx.createImageData(w, h);
  for (let x = 0; x < w; x++) {
    let norm = x / (w - 1);
    if (state.invertThermal) norm = 1 - norm;
    const idx = Math.min(1023, Math.max(0, Math.round(norm * 1023))) * 3;
    const r = lut[idx];
    const g = lut[idx + 1];
    const b = lut[idx + 2];
    for (let y = 0; y < h; y++) {
      const p = (y * w + x) * 4;
      imgData.data[p] = r;
      imgData.data[p + 1] = g;
      imgData.data[p + 2] = b;
      imgData.data[p + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);
}

// Fast Separable Box/Gaussian Blur on Float32Array
function blurFloatField(src, width, height, radius) {
  if (radius <= 0.25) return new Float32Array(src);
  const r = Math.max(1, Math.round(radius));
  const tmp = new Float32Array(width * height);
  const dst = new Float32Array(width * height);

  let input = src;
  let output = dst;
  for (let pass = 0; pass < 2; pass++) {
    const invWindow = 1 / (2 * r + 1);
    for (let y = 0; y < height; y++) {
      const rowOffset = y * width;
      let sum = input[rowOffset] * (r + 1);
      for (let x = 1; x <= r; x++) {
        sum += input[rowOffset + Math.min(width - 1, x)];
      }
      for (let x = 0; x < width; x++) {
        tmp[rowOffset + x] = sum * invWindow;
        const leftIdx = Math.max(0, x - r);
        const rightIdx = Math.min(width - 1, x + r + 1);
        sum += input[rowOffset + rightIdx] - input[rowOffset + leftIdx];
      }
    }
    for (let x = 0; x < width; x++) {
      let sum = tmp[x] * (r + 1);
      for (let y = 1; y <= r; y++) {
        sum += tmp[Math.min(height - 1, y) * width + x];
      }
      for (let y = 0; y < height; y++) {
        output[y * width + x] = sum * invWindow;
        const topIdx = Math.max(0, y - r);
        const botIdx = Math.min(height - 1, y + r + 1);
        sum += tmp[botIdx * width + x] - tmp[topIdx * width + x];
      }
    }
    input = output;
  }
  return output;
}

// Precompute raw luminance for a still image once loaded
function extractRawLuminance(imgEl) {
  const w = imgEl.naturalWidth || imgEl.width;
  const h = imgEl.naturalHeight || imgEl.height;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  ctx.drawImage(imgEl, 0, 0);
  const data = ctx.getImageData(0, 0, w, h).data;
  const raw = new Float32Array(w * h);

  const hist = new Uint32Array(1000);
  for (let i = 0, p = 0; i < raw.length; i++, p += 4) {
    const r = data[p] / 255;
    const g = data[p + 1] / 255;
    const b = data[p + 2] / 255;
    const lum = 0.38 * r + 0.48 * g + 0.14 * b;
    raw[i] = lum;
    const bin = Math.min(999, Math.max(0, Math.floor(lum * 999)));
    hist[bin]++;
  }

  const { minP, maxP } = computeHistogramPercentiles(hist, w * h);
  return { width: w, height: h, raw, minP, maxP };
}

function computeHistogramPercentiles(hist, total) {
  let sum = 0;
  let minP = 0.02;
  let maxP = 0.98;
  for (let i = 0; i < 1000; i++) {
    sum += hist[i];
    if (sum >= total * 0.015) {
      minP = i / 999;
      break;
    }
  }
  sum = 0;
  for (let i = 999; i >= 0; i--) {
    sum += hist[i];
    if (sum >= total * 0.006) {
      maxP = i / 999;
      break;
    }
  }
  if (maxP - minP < 0.15) {
    minP = 0;
    maxP = 1;
  }
  return { minP, maxP };
}

// Compute calibrated thermal field [0, 1] + hotspot/coldspot telemetry from cache object { width, height, raw, minP, maxP }
function computeThermalFieldFromCache(cacheObj, isLiveVideo = false) {
  const { width, height, raw, minP, maxP } = cacheObj;
  // Scale smoothing slightly relative to resolution so webcam & still look identical
  const resScale = width / 928;
  const effSmoothing = state.smoothing * resScale;
  const smoothed = blurFloatField(raw, width, height, effSmoothing);

  const useDetail = state.detailBoost > 0.01;
  const broad = useDetail ? blurFloatField(smoothed, width, height, Math.max(3, effSmoothing * 2.4)) : null;

  const field = new Float32Array(width * height);
  const span = Math.max(0.05, maxP - minP);
  const invGamma = 1 / Math.max(0.1, state.gamma);

  let maxVal = -1;
  let minVal = 2;
  let maxX = Math.floor(width * 0.5);
  let maxY = Math.floor(height * 0.5);
  let minX = Math.floor(width * 0.15);
  let minY = Math.floor(height * 0.15);

  for (let i = 0; i < field.length; i++) {
    let v = smoothed[i];
    if (useDetail) {
      v += (smoothed[i] - broad[i]) * state.detailBoost * 1.6;
    }
    if (state.autoNormalize) {
      v = (v - minP) / span;
    }
    v = (v - 0.5) * state.contrast + 0.5 + state.exposure;
    v = Math.min(1, Math.max(0, v));
    v = Math.pow(v, invGamma);
    if (state.invertThermal) {
      v = 1 - v;
    }
    field[i] = v;

    const x = i % width;
    const y = (i - x) / width;
    if (x > width * 0.08 && x < width * 0.92 && y > height * 0.08 && y < height * 0.92) {
      if (v > maxVal) {
        maxVal = v;
        maxX = x;
        maxY = y;
      }
      if (v < minVal) {
        minVal = v;
        minX = x;
        minY = y;
      }
    }
  }

  // Smooth telemetry coordinates in live webcam mode so HUD crosshairs glide smoothly
  if (isLiveVideo) {
    if (!smoothTelemetry.initialized) {
      smoothTelemetry = { maxX, maxY, maxVal, minX, minY, minVal, initialized: true };
    } else {
      const alpha = 0.18;
      smoothTelemetry.maxX = Math.round(smoothTelemetry.maxX + (maxX - smoothTelemetry.maxX) * alpha);
      smoothTelemetry.maxY = Math.round(smoothTelemetry.maxY + (maxY - smoothTelemetry.maxY) * alpha);
      smoothTelemetry.maxVal = smoothTelemetry.maxVal + (maxVal - smoothTelemetry.maxVal) * alpha;
      smoothTelemetry.minX = Math.round(smoothTelemetry.minX + (minX - smoothTelemetry.minX) * alpha);
      smoothTelemetry.minY = Math.round(smoothTelemetry.minY + (minY - smoothTelemetry.minY) * alpha);
      smoothTelemetry.minVal = smoothTelemetry.minVal + (minVal - smoothTelemetry.minVal) * alpha;
    }
    return {
      field,
      width,
      height,
      maxX: smoothTelemetry.maxX,
      maxY: smoothTelemetry.maxY,
      maxVal: smoothTelemetry.maxVal,
      minX: smoothTelemetry.minX,
      minY: smoothTelemetry.minY,
      minVal: smoothTelemetry.minVal
    };
  }

  return { field, width, height, maxX, maxY, maxVal, minX, minY, minVal };
}

// Deterministic pseudo-noise for sensor grain (with optional temporal seed for live video)
let frameSeed = 0;
function fastGrain(idx) {
  let n = ((idx + frameSeed) * 1664525 + 1013904223) >>> 0;
  n = ((n >> 13) ^ n) >>> 0;
  return ((n & 0xffff) / 65535) - 0.5;
}

// Render Mode 1, 2, or 4 pixel buffer
function renderPixelThermalBuffer(targetCtx, thermalData, mode) {
  const { field, width, height } = thermalData;
  offCanvas.width = width;
  offCanvas.height = height;
  const imgData = offCtx.createImageData(width, height);
  const out = imgData.data;

  const isTopo = mode === "topo" || mode === "layered";
  const bands = state.contourCount;
  const lineThick = state.contourThickness;
  const contourMix = mode === "layered" ? Math.min(0.65, state.contourMix * 0.75) : state.contourMix;
  const topoStyle = mode === "layered" ? "overlay" : state.topoStyle;
  const scanlineAmt = mode === "layered" ? Math.max(0.18, state.scanline) : state.scanline;
  const grainAmt = state.grain * 255;

  const resScale = width / 928;
  const topoField = isTopo ? blurFloatField(field, width, height, Math.max(1.5, state.smoothing * 0.8 * resScale)) : null;

  for (let y = 0; y < height; y++) {
    const row = y * width;
    const scanWave = scanlineAmt > 0
      ? 1 - scanlineAmt * 0.35 * (0.5 + 0.5 * Math.sin(y * 1.570796))
      : 1;

    for (let x = 0; x < width; x++) {
      const i = row + x;
      let heat = field[i];

      if (mode === "topo" && topoStyle === "plateau") {
        heat = Math.floor(topoField[i] * bands) / bands;
      }

      const lutIdx = Math.min(1023, Math.max(0, Math.round(heat * 1023))) * 3;
      let r = lut[lutIdx];
      let g = lut[lutIdx + 1];
      let b = lut[lutIdx + 2];

      if ((mode === "thermal" || mode === "layered") && x > 0 && x < width - 1 && y > 0 && y < height - 1) {
        const gx = field[i + 1] - field[i - 1];
        const gy = field[i + width] - field[i - width];
        const gradMag = Math.min(0.25, Math.sqrt(gx * gx + gy * gy) * 3.2);
        r = Math.min(255, r + gradMag * 55);
        g = Math.min(255, g + gradMag * 55);
        b = Math.min(255, b + gradMag * 65);
      }

      if (isTopo && x > 0 && x < width - 1 && y > 0 && y < height - 1) {
        const hVal = topoField[i] * bands;
        const gx = (topoField[i + 1] - topoField[i - 1]) * 0.5 * bands;
        const gy = (topoField[i + width] - topoField[i - width]) * 0.5 * bands;
        const grad = Math.sqrt(gx * gx + gy * gy);

        const frac = hVal - Math.floor(hVal);
        const distToLevel = Math.min(frac, 1 - frac);
        const pixelDist = distToLevel / Math.max(0.015, grad);

        const nearestLevel = Math.round(hVal);
        const isMajor = (nearestLevel % 5 === 0);
        const effThickness = isMajor ? lineThick * 1.35 : lineThick * 0.85;

        let edgeAlpha = 1 - Math.min(1, Math.max(0, (pixelDist - effThickness * 0.45) / 0.85));
        if (grad < 0.004) edgeAlpha = 0;

        if (topoStyle === "wireframe") {
          const bgFactor = 0.08 * (1 - contourMix * 0.7);
          const lineBoost = edgeAlpha * contourMix * (isMajor ? 1.35 : 0.95);
          r = r * bgFactor + Math.min(255, r * 1.2 + 35) * lineBoost;
          g = g * bgFactor + Math.min(255, g * 1.2 + 35) * lineBoost;
          b = b * bgFactor + Math.min(255, b * 1.2 + 45) * lineBoost;
        } else if (topoStyle === "ink") {
          const ink = edgeAlpha * contourMix * (isMajor ? 0.92 : 0.65);
          r *= (1 - ink);
          g *= (1 - ink);
          b *= (1 - ink);
        } else {
          const glow = edgeAlpha * contourMix * (isMajor ? 0.95 : 0.55);
          r = r + (255 - r) * glow * 0.82;
          g = g + (255 - g) * glow * 0.88;
          b = b + (255 - b) * glow * 0.95;
        }
      }

      r *= scanWave;
      g *= scanWave;
      b *= scanWave;

      if (grainAmt > 0.5) {
        const gr = fastGrain(i) * grainAmt;
        r += gr;
        g += gr;
        b += gr;
      }

      const p = i * 4;
      out[p] = Math.min(255, Math.max(0, r));
      out[p + 1] = Math.min(255, Math.max(0, g));
      out[p + 2] = Math.min(255, Math.max(0, b));
      out[p + 3] = 255;
    }
  }

  const shift = Math.round(state.chroma * resScale);
  if (shift > 0) {
    const copy = new Uint8ClampedArray(out);
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        const p = (row + x) * 4;
        const xr = Math.min(width - 1, x + shift);
        const xb = Math.max(0, x - shift);
        out[p] = copy[(row + xr) * 4];
        out[p + 2] = copy[(row + xb) * 4 + 2];
      }
    }
  }

  offCtx.putImageData(imgData, 0, 0);
  targetCtx.drawImage(offCanvas, 0, 0);
}

// Render Mode 3: Generative Halftone / ASCII / Wave Scanlines / Sensor LED
function renderGenerativeMode(targetCtx, thermalData) {
  const { field, width, height } = thermalData;
  const sub = state.genStyle;
  const resScale = Math.max(0.65, width / 928);
  const cell = Math.max(4, Math.round(state.cellSize * resScale));
  const scale = state.genScale;

  targetCtx.save();
  if (state.genBgMix > 0.01) {
    renderPixelThermalBuffer(targetCtx, thermalData, "thermal");
    targetCtx.fillStyle = `rgba(5, 7, 18, ${1 - state.genBgMix})`;
    targetCtx.fillRect(0, 0, width, height);
  } else {
    targetCtx.fillStyle = "#050712";
    targetCtx.fillRect(0, 0, width, height);
  }

  if (sub === "halftone") {
    for (let y = Math.floor(cell / 2); y < height; y += cell) {
      for (let x = Math.floor(cell / 2); x < width; x += cell) {
        const heat = field[y * width + x];
        const lutIdx = Math.min(1023, Math.max(0, Math.round(heat * 1023))) * 3;
        const r = lut[lutIdx];
        const g = lut[lutIdx + 1];
        const b = lut[lutIdx + 2];

        const radius = Math.max(0.8, (0.12 + 0.88 * Math.pow(heat, 0.85)) * (cell * 0.52) * scale);
        targetCtx.beginPath();
        targetCtx.arc(x, y, radius, 0, Math.PI * 2);
        targetCtx.fillStyle = `rgb(${r},${g},${b})`;
        targetCtx.fill();

        if (heat > 0.78) {
          targetCtx.beginPath();
          targetCtx.arc(x, y, radius * 0.42, 0, Math.PI * 2);
          targetCtx.fillStyle = "rgba(255, 255, 240, 0.75)";
          targetCtx.fill();
        }
      }
    }
  } else if (sub === "ascii") {
    const ramp = " .·:-=+*#%01{}[]/@";
    const fontSize = Math.max(6, Math.round(cell * 1.15 * scale));
    targetCtx.font = `700 ${fontSize}px "SF Mono", Menlo, Monaco, Consolas, monospace`;
    targetCtx.textAlign = "center";
    targetCtx.textBaseline = "middle";

    for (let y = Math.floor(cell / 2); y < height; y += cell) {
      for (let x = Math.floor(cell / 2); x < width; x += cell) {
        const heat = field[y * width + x];
        if (heat < 0.03) continue;
        const lutIdx = Math.min(1023, Math.max(0, Math.round(heat * 1023))) * 3;
        const r = lut[lutIdx];
        const g = lut[lutIdx + 1];
        const b = lut[lutIdx + 2];

        const charIdx = Math.min(ramp.length - 1, Math.floor(heat * ramp.length));
        const ch = ramp[charIdx];
        targetCtx.fillStyle = `rgb(${r},${g},${b})`;
        targetCtx.fillText(ch, x, y);
      }
    }
  } else if (sub === "scanlines") {
    const rowStep = Math.max(4, Math.round(cell * 0.75));
    const xStep = 4;
    targetCtx.lineCap = "round";
    targetCtx.lineJoin = "round";

    for (let y = rowStep; y < height - rowStep; y += rowStep) {
      for (let x = 0; x < width - xStep; x += xStep) {
        const h0 = field[y * width + x];
        const h1 = field[y * width + x + xStep];
        const lutIdx = Math.min(1023, Math.max(0, Math.round(h0 * 1023))) * 3;
        const r = lut[lutIdx];
        const g = lut[lutIdx + 1];
        const b = lut[lutIdx + 2];

        const dy0 = -h0 * rowStep * 1.45 * scale;
        const dy1 = -h1 * rowStep * 1.45 * scale;

        targetCtx.beginPath();
        targetCtx.moveTo(x, y + dy0);
        targetCtx.lineTo(x + xStep, y + dy1);
        targetCtx.lineWidth = Math.max(1.0, (0.4 + h0 * 1.8) * scale);
        targetCtx.strokeStyle = `rgb(${r},${g},${b})`;
        targetCtx.stroke();
      }
    }
  } else if (sub === "led") {
    const pad = Math.max(1, Math.round(cell * 0.18));
    const boxSize = Math.max(2, (cell - pad) * Math.min(1.25, scale));
    for (let y = 0; y < height; y += cell) {
      for (let x = 0; x < width; x += cell) {
        const sx = Math.min(width - 1, x + Math.floor(cell / 2));
        const sy = Math.min(height - 1, y + Math.floor(cell / 2));
        const heat = field[sy * width + sx];
        const lutIdx = Math.min(1023, Math.max(0, Math.round(heat * 1023))) * 3;
        const r = lut[lutIdx];
        const g = lut[lutIdx + 1];
        const b = lut[lutIdx + 2];

        targetCtx.fillStyle = `rgb(${r},${g},${b})`;
        targetCtx.fillRect(x + pad * 0.5, y + pad * 0.5, boxSize, boxSize);
      }
    }
  }

  targetCtx.restore();
}

// Multi-pass Thermal Halation / Bloom
function applyThermalBloom(targetCtx, width, height) {
  if (state.bloom <= 0.02) return;
  const scale = 0.25;
  const bw = Math.max(1, Math.round(width * scale));
  const bh = Math.max(1, Math.round(height * scale));
  bloomCanvas.width = bw;
  bloomCanvas.height = bh;

  bloomCtx.clearRect(0, 0, bw, bh);
  bloomCtx.filter = "blur(8px) saturate(140%) brightness(115%)";
  bloomCtx.drawImage(targetCtx.canvas, 0, 0, bw, bh);
  bloomCtx.filter = "none";

  targetCtx.save();
  targetCtx.globalCompositeOperation = "screen";
  targetCtx.globalAlpha = Math.min(1, state.bloom * 0.85);
  targetCtx.drawImage(bloomCanvas, 0, 0, width, height);
  targetCtx.restore();
}

// Thermal Telemetry HUD Overlay
function renderThermalHUD(targetCtx, thermalData, sourceLabel) {
  const { width, height, maxX, maxY, maxVal, minX, minY, minVal } = thermalData;
  targetCtx.save();

  const scaleFactor = Math.max(0.65, width / 928);
  const fontSize = Math.max(10, Math.round(13 * scaleFactor));
  targetCtx.font = `600 ${fontSize}px "SF Mono", Menlo, Monaco, Consolas, monospace`;

  // 1. Right-side Spectral Scale Bar
  const barW = Math.round(14 * scaleFactor);
  const barH = Math.round(240 * scaleFactor);
  const barX = width - Math.round(42 * scaleFactor);
  const barY = Math.round((height - barH) * 0.5);

  targetCtx.fillStyle = "rgba(5, 7, 18, 0.65)";
  targetCtx.fillRect(barX - 6, barY - 26, barW + 12, barH + 52);
  targetCtx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  targetCtx.lineWidth = 1;
  targetCtx.strokeRect(barX - 6, barY - 26, barW + 12, barH + 52);

  for (let y = 0; y < barH; y++) {
    let t = 1 - y / (barH - 1);
    if (state.invertThermal) t = 1 - t;
    const lutIdx = Math.min(1023, Math.max(0, Math.round(t * 1023))) * 3;
    targetCtx.fillStyle = `rgb(${lut[lutIdx]},${lut[lutIdx + 1]},${lut[lutIdx + 2]})`;
    targetCtx.fillRect(barX, barY + y, barW, 1.5);
  }

  targetCtx.fillStyle = "#ffffff";
  targetCtx.textAlign = "center";
  targetCtx.fillText("39.4°C", barX + barW * 0.5, barY - 10);
  targetCtx.fillText("18.2°C", barX + barW * 0.5, barY + barH + 18);

  // 2. Hotspot Crosshair (MAX TEMP)
  const rCross = Math.round(16 * scaleFactor);
  targetCtx.strokeStyle = "#ffffff";
  targetCtx.lineWidth = 1.5 * scaleFactor;
  targetCtx.beginPath();
  targetCtx.arc(maxX, maxY, rCross, 0, Math.PI * 2);
  targetCtx.moveTo(maxX - rCross * 1.4, maxY);
  targetCtx.lineTo(maxX + rCross * 1.4, maxY);
  targetCtx.moveTo(maxX, maxY - rCross * 1.4);
  targetCtx.lineTo(maxX, maxY + rCross * 1.4);
  targetCtx.stroke();

  const maxTemp = (24 + maxVal * 15.4).toFixed(1);
  targetCtx.textAlign = "left";
  targetCtx.fillStyle = "rgba(5, 7, 18, 0.72)";
  targetCtx.fillRect(maxX + rCross + 6, maxY - 11, 108 * scaleFactor, 22 * scaleFactor);
  targetCtx.fillStyle = "#ffe600";
  targetCtx.fillText(`MAX ${maxTemp}°C`, maxX + rCross + 12, maxY + 4);

  // 3. Coldspot Marker (MIN TEMP)
  const minTemp = (18 + minVal * 8.2).toFixed(1);
  targetCtx.strokeStyle = "#00d8d8";
  targetCtx.beginPath();
  targetCtx.arc(minX, minY, rCross * 0.7, 0, Math.PI * 2);
  targetCtx.stroke();
  targetCtx.fillStyle = "rgba(5, 7, 18, 0.72)";
  targetCtx.fillRect(minX + rCross + 4, minY - 11, 105 * scaleFactor, 22 * scaleFactor);
  targetCtx.fillStyle = "#00d8d8";
  targetCtx.fillText(`MIN ${minTemp}°C`, minX + rCross + 10, minY + 4);

  // 4. Top-Left Corner Telemetry Frame
  const pad = Math.round(24 * scaleFactor);
  targetCtx.fillStyle = "rgba(5, 7, 18, 0.6)";
  targetCtx.fillRect(pad, pad, 240 * scaleFactor, 48 * scaleFactor);
  targetCtx.strokeStyle = "rgba(0, 216, 216, 0.5)";
  targetCtx.strokeRect(pad, pad, 240 * scaleFactor, 48 * scaleFactor);

  targetCtx.fillStyle = "#00d8d8";
  targetCtx.fillText(`IR // ${sourceLabel.toUpperCase()}`, pad + 10, pad + 19 * scaleFactor);
  targetCtx.fillStyle = "rgba(255,255,255,0.75)";
  targetCtx.fillText(`MODE: ${state.mode.toUpperCase()}  ε=0.98`, pad + 10, pad + 37 * scaleFactor);

  targetCtx.restore();
}

// Render a still portrait onto a given canvas
function renderPortraitToCanvas(imgEntry, canvas) {
  if (!imgEntry || !imgEntry.loaded) return;
  const { width, height } = imgEntry.cache;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  if (isHoldingOriginal) {
    ctx.drawImage(imgEntry.img, 0, 0, width, height);
    return;
  }

  frameSeed = 0;
  const thermalData = computeThermalFieldFromCache(imgEntry.cache, false);

  if (state.mode === "generative") {
    renderGenerativeMode(ctx, thermalData);
  } else {
    renderPixelThermalBuffer(ctx, thermalData, state.mode);
  }

  applyThermalBloom(ctx, width, height);

  if (state.showHud) {
    renderThermalHUD(ctx, thermalData, imgEntry.name);
  }
}

// ==========================================
// REAL-TIME WEBCAM ENGINE
// ==========================================

async function populateCameraDevices() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter((d) => d.kind === "videoinput");
    const select = document.getElementById("cameraDeviceSelect");
    const currentVal = select.value;
    select.innerHTML = "";
    videoDevices.forEach((d, idx) => {
      const opt = document.createElement("option");
      opt.value = d.deviceId;
      opt.textContent = d.label || `Camera #${idx + 1}`;
      select.appendChild(opt);
    });
    if (currentVal && Array.from(select.options).some((o) => o.value === currentVal)) {
      select.value = currentVal;
    }
  } catch (err) {
    console.warn("Could not enumerate video devices:", err);
  }
}

async function startWebcam(deviceId = "") {
  const overlay = document.getElementById("webcamPromptOverlay");
  const titleEl = document.getElementById("webcamPromptTitle");
  const descEl = document.getElementById("webcamPromptDesc");
  const retryBtn = document.getElementById("retryWebcamBtn");

  overlay.classList.add("visible");
  titleEl.textContent = "Starting Real-Time Thermal Camera...";
  descEl.textContent = "Allow camera access in your browser prompt to stream live webcam footage through the thermal code-art engine.";
  retryBtn.style.display = "none";

  stopWebcamStreamOnly();

  try {
    const constraints = {
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 60 }
      },
      audio: false
    };
    if (deviceId) {
      constraints.video.deviceId = { exact: deviceId };
    }

    webcamStream = await navigator.mediaDevices.getUserMedia(constraints);
    videoEl.srcObject = webcamStream;
    await videoEl.play();

    webcamActive = true;
    webcamFrozen = false;
    updateFreezeBtnUI();
    overlay.classList.remove("visible");

    await populateCameraDevices();
    startWebcamLoop();
  } catch (err) {
    console.error("Webcam access error:", err);
    webcamActive = false;
    titleEl.textContent = "Camera Access Unavailable";
    descEl.textContent = `${err.message || "Permission denied or no camera found."} Make sure camera permissions are enabled for this browser tab.`;
    retryBtn.style.display = "inline-flex";
  }
}

function stopWebcamStreamOnly() {
  if (webcamRafId) {
    cancelAnimationFrame(webcamRafId);
    webcamRafId = null;
  }
  if (isRecording) {
    stopVideoRecording();
  }
  if (webcamStream) {
    webcamStream.getTracks().forEach((t) => t.stop());
    webcamStream = null;
  }
  webcamActive = false;
}

function startWebcamLoop() {
  if (webcamRafId) cancelAnimationFrame(webcamRafId);
  fpsFrameCount = 0;
  fpsLastTime = performance.now();

  const step = () => {
    if (state.sourceMode !== "webcam" || !webcamActive) return;
    renderWebcamFrame();

    // Update FPS indicator
    fpsFrameCount++;
    const now = performance.now();
    if (now - fpsLastTime >= 500) {
      const fps = Math.round((fpsFrameCount * 1000) / (now - fpsLastTime));
      document.getElementById("fpsCounter").textContent = `${fps} FPS`;
      fpsFrameCount = 0;
      fpsLastTime = now;
    }

    webcamRafId = requestAnimationFrame(step);
  };
  webcamRafId = requestAnimationFrame(step);
}

function renderWebcamFrame() {
  if (!videoEl.videoWidth || !videoEl.videoHeight) return;

  const aspect = videoEl.videoWidth / videoEl.videoHeight;
  const targetH = webcamTargetHeight;
  const targetW = Math.round((targetH * aspect) / 2) * 2;

  if (webcamCapCanvas.width !== targetW || webcamCapCanvas.height !== targetH) {
    webcamCapCanvas.width = targetW;
    webcamCapCanvas.height = targetH;
    webcamRawBuffer = new Float32Array(targetW * targetH);
    document.getElementById("webcamResLabel").textContent = `LIVE IR • ${targetW} × ${targetH} px`;
  }

  // Only draw new video frame if not frozen
  if (!webcamFrozen) {
    webcamCapCtx.save();
    if (mirrorWebcam) {
      webcamCapCtx.translate(targetW, 0);
      webcamCapCtx.scale(-1, 1);
    }
    webcamCapCtx.drawImage(videoEl, 0, 0, targetW, targetH);
    webcamCapCtx.restore();
  }

  if (mainCanvas.width !== targetW || mainCanvas.height !== targetH) {
    mainCanvas.width = targetW;
    mainCanvas.height = targetH;
  }

  if (isHoldingOriginal) {
    mainCtx.drawImage(webcamCapCanvas, 0, 0);
    return;
  }

  const data = webcamCapCtx.getImageData(0, 0, targetW, targetH).data;
  webcamHist.fill(0);

  for (let i = 0, p = 0; i < webcamRawBuffer.length; i++, p += 4) {
    const r = data[p] / 255;
    const g = data[p + 1] / 255;
    const b = data[p + 2] / 255;
    const lum = 0.38 * r + 0.48 * g + 0.14 * b;
    webcamRawBuffer[i] = lum;
    const bin = Math.min(999, Math.max(0, Math.floor(lum * 999)));
    webcamHist[bin]++;
  }

  const { minP, maxP } = computeHistogramPercentiles(webcamHist, targetW * targetH);
  const cacheObj = {
    width: targetW,
    height: targetH,
    raw: webcamRawBuffer,
    minP,
    maxP
  };

  // Subtle animated grain seed for live sensor feel
  if (!webcamFrozen) {
    frameSeed = (frameSeed + 997) & 0xffff;
  }

  const thermalData = computeThermalFieldFromCache(cacheObj, true);

  if (state.mode === "generative") {
    renderGenerativeMode(mainCtx, thermalData);
  } else {
    renderPixelThermalBuffer(mainCtx, thermalData, state.mode);
  }

  applyThermalBloom(mainCtx, targetW, targetH);

  if (state.showHud) {
    renderThermalHUD(mainCtx, thermalData, "LIVE CAM");
  }
}

// Switch between 1. Still Image Mode and 2. Real-Time Webcam Mode
function setSourceMode(newSourceMode) {
  if (state.sourceMode === newSourceMode) return;
  state.sourceMode = newSourceMode;

  document.getElementById("sourceStillBtn").classList.toggle("active", newSourceMode === "still");
  document.getElementById("sourceWebcamBtn").classList.toggle("active", newSourceMode === "webcam");

  document.getElementById("stillActionsGroup").style.display = newSourceMode === "still" ? "flex" : "none";
  document.getElementById("webcamActionsGroup").style.display = newSourceMode === "webcam" ? "flex" : "none";

  document.getElementById("stillFilmstripContainer").style.display = newSourceMode === "still" ? "flex" : "none";
  document.getElementById("webcamStatusBar").classList.toggle("active", newSourceMode === "webcam");

  updateStillEmptyState();

  if (newSourceMode === "webcam") {
    if (isGridView) toggleGridView(false);
    const selectedDevice = document.getElementById("cameraDeviceSelect").value;
    startWebcam(selectedDevice);
  } else {
    stopWebcamStreamOnly();
    document.getElementById("webcamPromptOverlay").classList.remove("visible");
    requestRender();
  }
}

function updateFreezeBtnUI() {
  const btn = document.getElementById("freezeWebcamBtn");
  if (!btn) return;
  if (webcamFrozen) {
    btn.classList.add("active");
    btn.innerHTML = `<span>▶</span> Resume Live`;
  } else {
    btn.classList.remove("active");
    btn.innerHTML = `<span>⏸</span> Freeze Frame`;
  }
}

function toggleVideoRecording() {
  if (isRecording) {
    stopVideoRecording();
  } else {
    startVideoRecording();
  }
}

function startVideoRecording() {
  if (!mainCanvas.captureStream) {
    showToast("Video recording is not supported in this browser");
    return;
  }
  const stream = mainCanvas.captureStream(30);
  recordedChunks = [];
  const mimeTypes = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
    "video/mp4"
  ];
  let selectedMime = "";
  for (const m of mimeTypes) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) {
      selectedMime = m;
      break;
    }
  }
  try {
    mediaRecorder = selectedMime
      ? new MediaRecorder(stream, { mimeType: selectedMime, videoBitsPerSecond: 6000000 })
      : new MediaRecorder(stream);
  } catch (e) {
    showToast("Could not initialize video recorder");
    return;
  }

  mediaRecorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) recordedChunks.push(ev.data);
  };

  mediaRecorder.onstop = () => {
    const ext = selectedMime.includes("mp4") ? "mp4" : "webm";
    const blob = new Blob(recordedChunks, { type: selectedMime || "video/webm" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `thermal-webcam-${state.mode}-${Date.now()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    showToast(`Saved thermal video recording (.${ext})!`);
  };

  mediaRecorder.start();
  isRecording = true;
  const recBtn = document.getElementById("recordWebcamBtn");
  recBtn.classList.add("recording");
  recBtn.innerHTML = `<span>■</span> Stop Recording`;
  showToast("Recording live thermal video...");
}

function stopVideoRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
  isRecording = false;
  const recBtn = document.getElementById("recordWebcamBtn");
  if (recBtn) {
    recBtn.classList.remove("recording");
    recBtn.innerHTML = `<span>●</span> Record Video`;
  }
}

function updateStillEmptyState() {
  const empty = state.sourceMode === "still" && imagesList.length === 0;
  document.getElementById("stillEmptyOverlay").classList.toggle("visible", empty);
}

let renderQueued = false;
function requestRender() {
  buildLUT();
  updateStillEmptyState();
  if (state.sourceMode === "webcam") {
    // Live loop handles rendering automatically; if frozen, trigger one frame redraw
    if (webcamFrozen && webcamActive) {
      renderWebcamFrame();
    }
    return;
  }
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    if (isGridView) {
      renderAllGridCanvases();
    } else if (imagesList[activeIndex]) {
      renderPortraitToCanvas(imagesList[activeIndex], mainCanvas);
      const { width, height } = imagesList[activeIndex].cache || { width: 928, height: 1152 };
      document.getElementById("resolutionLabel").textContent = `${width} × ${height} px`;
    }
  });
}

function renderAllGridCanvases() {
  const wrapper = document.getElementById("gridViewWrapper");
  if (wrapper.children.length !== imagesList.length) {
    wrapper.innerHTML = "";
    imagesList.forEach((entry, idx) => {
      const card = document.createElement("div");
      card.className = "grid-item";
      const c = document.createElement("canvas");
      const label = document.createElement("div");
      label.className = "grid-item-label";
      label.innerHTML = `<span>${entry.name}</span><span style="color:var(--accent-cyan)">Click to Focus</span>`;
      card.appendChild(c);
      card.appendChild(label);
      card.addEventListener("click", () => {
        activeIndex = idx;
        toggleGridView(false);
        updateThumbnailsActive();
      });
      wrapper.appendChild(card);
    });
  }
  Array.from(wrapper.children).forEach((card, idx) => {
    const c = card.querySelector("canvas");
    renderPortraitToCanvas(imagesList[idx], c);
  });
}

function toggleGridView(forceState) {
  isGridView = typeof forceState === "boolean" ? forceState : !isGridView;
  const singleW = document.getElementById("singleViewWrapper");
  const gridW = document.getElementById("gridViewWrapper");
  const btn = document.getElementById("toggleGridBtn");
  if (isGridView) {
    singleW.style.display = "none";
    gridW.classList.add("active");
    btn.classList.add("active");
  } else {
    singleW.style.display = "flex";
    gridW.classList.remove("active");
    btn.classList.remove("active");
  }
  requestRender();
}

function updateThumbnailsActive() {
  const listEl = document.getElementById("thumbnailsList");
  Array.from(listEl.children).forEach((el, idx) => {
    el.classList.toggle("active", idx === activeIndex);
  });
}

function buildFilmstrip() {
  const listEl = document.getElementById("thumbnailsList");
  listEl.innerHTML = "";
  imagesList.forEach((entry, idx) => {
    const item = document.createElement("div");
    item.className = `thumb-item ${idx === activeIndex ? "active" : ""}`;
    item.innerHTML = `
      <img src="${entry.src}" alt="${entry.name}" />
      <div class="thumb-meta">
        <div class="thumb-title">${entry.name}</div>
        <div class="thumb-sub">Portrait #${idx + 1}</div>
      </div>
    `;
    item.addEventListener("click", () => {
      activeIndex = idx;
      updateThumbnailsActive();
      if (isGridView) toggleGridView(false);
      else requestRender();
    });
    listEl.appendChild(item);
  });
}

function showToast(msg) {
  const toast = document.getElementById("statusToast");
  toast.textContent = msg;
  toast.classList.add("visible");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.remove("visible"), 2400);
}

function downloadCanvasPNG(canvas, filename) {
  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Bind UI Controls
function initControls() {
  // Top-level Source Mode Switcher (Still Image vs Real-Time Webcam)
  document.getElementById("sourceStillBtn").addEventListener("click", () => setSourceMode("still"));
  document.getElementById("sourceWebcamBtn").addEventListener("click", () => setSourceMode("webcam"));

  document.getElementById("retryWebcamBtn").addEventListener("click", () => {
    const selectedDevice = document.getElementById("cameraDeviceSelect").value;
    startWebcam(selectedDevice);
  });

  // Webcam bottom bar controls
  document.getElementById("cameraDeviceSelect").addEventListener("change", (e) => {
    if (state.sourceMode === "webcam") {
      startWebcam(e.target.value);
    }
  });

  document.getElementById("webcamResSelect").addEventListener("change", (e) => {
    webcamTargetHeight = parseInt(e.target.value, 10) || 640;
    smoothTelemetry.initialized = false;
  });

  document.getElementById("mirrorWebcam").addEventListener("change", (e) => {
    mirrorWebcam = e.target.checked;
  });

  // Webcam Header Actions
  document.getElementById("freezeWebcamBtn").addEventListener("click", () => {
    webcamFrozen = !webcamFrozen;
    updateFreezeBtnUI();
    showToast(webcamFrozen ? "Webcam frame frozen — tweak sliders freely" : "Resumed live webcam stream");
  });

  document.getElementById("snapshotWebcamBtn").addEventListener("click", () => {
    if (!webcamActive) return;
    downloadCanvasPNG(mainCanvas, `webcam-${state.mode}-heatmap-${Date.now()}.png`);
    showToast("Saved webcam thermal snapshot PNG!");
  });

  document.getElementById("recordWebcamBtn").addEventListener("click", () => {
    if (!webcamActive) return;
    toggleVideoRecording();
  });

  // Mode Cards (Options 1 - 4)
  document.querySelectorAll(".mode-card").forEach((card) => {
    card.addEventListener("click", () => {
      document.querySelectorAll(".mode-card").forEach((c) => c.classList.remove("active"));
      card.classList.add("active");
      state.mode = card.dataset.mode;

      if (state.mode === "layered") {
        state.showHud = true;
        document.getElementById("showHud").checked = true;
      }
      requestRender();
    });
  });

  // Topo Sub-style pills
  document.querySelectorAll("#topoStylePills .pill-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#topoStylePills .pill-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.topoStyle = btn.dataset.topostyle;
      if (state.mode !== "topo") {
        document.querySelector('.mode-card[data-mode="topo"]').click();
      } else {
        requestRender();
      }
    });
  });

  // Generative Sub-style pills
  document.querySelectorAll("#genStylePills .pill-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#genStylePills .pill-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.genStyle = btn.dataset.genstyle;
      if (state.mode !== "generative") {
        document.querySelector('.mode-card[data-mode="generative"]').click();
      } else {
        requestRender();
      }
    });
  });

  // Sliders
  const sliders = [
    { id: "hueShift", valId: "hueShiftVal", fmt: (v) => `${v}°` },
    { id: "posterize", valId: "posterizeVal", fmt: (v) => (v < 2 ? "Smooth" : `${v} bands`) },
    { id: "smoothing", valId: "smoothingVal", fmt: (v) => `${Number(v).toFixed(1)} px` },
    { id: "contrast", valId: "contrastVal", fmt: (v) => Number(v).toFixed(2) },
    { id: "gamma", valId: "gammaVal", fmt: (v) => Number(v).toFixed(2) },
    { id: "exposure", valId: "exposureVal", fmt: (v) => (v > 0 ? `+${Number(v).toFixed(2)}` : Number(v).toFixed(2)) },
    { id: "detailBoost", valId: "detailBoostVal", fmt: (v) => Number(v).toFixed(2) },
    { id: "contourCount", valId: "contourCountVal", fmt: (v) => `${v}` },
    { id: "contourThickness", valId: "contourThicknessVal", fmt: (v) => Number(v).toFixed(2) },
    { id: "contourMix", valId: "contourMixVal", fmt: (v) => Number(v).toFixed(2) },
    { id: "cellSize", valId: "cellSizeVal", fmt: (v) => `${v} px` },
    { id: "genScale", valId: "genScaleVal", fmt: (v) => Number(v).toFixed(2) },
    { id: "genBgMix", valId: "genBgMixVal", fmt: (v) => Number(v).toFixed(2) },
    { id: "bloom", valId: "bloomVal", fmt: (v) => Number(v).toFixed(2) },
    { id: "chroma", valId: "chromaVal", fmt: (v) => `${Number(v).toFixed(1)} px` },
    { id: "grain", valId: "grainVal", fmt: (v) => Number(v).toFixed(2) },
    { id: "scanline", valId: "scanlineVal", fmt: (v) => Number(v).toFixed(2) }
  ];

  sliders.forEach(({ id, valId, fmt }) => {
    const el = document.getElementById(id);
    const valEl = document.getElementById(valId);
    el.addEventListener("input", () => {
      const num = parseFloat(el.value);
      state[id] = num;
      valEl.textContent = fmt(num);
      requestRender();
    });
  });

  // Checkboxes & Selects
  document.getElementById("paletteSelect").addEventListener("change", (e) => {
    state.palette = e.target.value;
    requestRender();
  });

  ["invertThermal", "autoNormalize", "showHud"].forEach((id) => {
    document.getElementById(id).addEventListener("change", (e) => {
      state[id] = e.target.checked;
      requestRender();
    });
  });

  // Reset button
  document.getElementById("resetParamsBtn").addEventListener("click", () => {
    const keepMode = state.mode;
    const keepSource = state.sourceMode;
    state = { ...DEFAULT_STATE, mode: keepMode, sourceMode: keepSource };
    document.getElementById("paletteSelect").value = state.palette;
    sliders.forEach(({ id, valId, fmt }) => {
      const el = document.getElementById(id);
      el.value = state[id];
      document.getElementById(valId).textContent = fmt(state[id]);
    });
    ["invertThermal", "autoNormalize", "showHud"].forEach((id) => {
      document.getElementById(id).checked = state[id];
    });
    requestRender();
    showToast("Parameters reset to default");
  });

  // Grid View toggle
  document.getElementById("toggleGridBtn").addEventListener("click", () => toggleGridView());

  // Hold for Original
  const holdBtn = document.getElementById("holdOriginalBtn");
  const startHold = () => { isHoldingOriginal = true; holdBtn.classList.add("active"); requestRender(); };
  const endHold = () => { isHoldingOriginal = false; holdBtn.classList.remove("active"); requestRender(); };
  holdBtn.addEventListener("mousedown", startHold);
  window.addEventListener("mouseup", () => { if (isHoldingOriginal) endHold(); });

  // Export Current Still
  document.getElementById("exportCurrentBtn").addEventListener("click", () => {
    const entry = imagesList[activeIndex];
    if (!entry) return;
    const exportCanvas = document.createElement("canvas");
    renderPortraitToCanvas(entry, exportCanvas);
    const safeName = entry.name.replace(/\s+/g, "-");
    downloadCanvasPNG(exportCanvas, `${safeName}-${state.mode}-heatmap.png`);
    showToast(`Exported ${safeName}-${state.mode}-heatmap.png`);
  });

  // Batch Export All 5
  document.getElementById("exportAllBtn").addEventListener("click", () => {
    const exportCanvas = document.createElement("canvas");
    imagesList.forEach((entry, idx) => {
      setTimeout(() => {
        renderPortraitToCanvas(entry, exportCanvas);
        const safeName = entry.name.replace(/\s+/g, "-");
        downloadCanvasPNG(exportCanvas, `${safeName}-${state.mode}-heatmap.png`);
        if (idx === imagesList.length - 1) {
          showToast(`Batch exported all ${imagesList.length} portraits!`);
        }
      }, idx * 220);
    });
  });

  // Upload additional images
  function handleImageFiles(files) {
    files.forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const name = file.name.replace(/\.[^.]+$/, "");
        if (state.sourceMode !== "still") {
          setSourceMode("still");
        }
        addImageEntry({ name, filename: file.name, src: ev.target.result }, true);
      };
      reader.readAsDataURL(file);
    });
  }

  document.getElementById("uploadInput").addEventListener("change", (e) => {
    handleImageFiles(Array.from(e.target.files || []));
  });

  // Drag-and-drop support onto the canvas stage
  const stageEl = document.querySelector(".canvas-stage");
  if (stageEl) {
    stageEl.addEventListener("dragover", (e) => {
      e.preventDefault();
    });
    stageEl.addEventListener("drop", (e) => {
      e.preventDefault();
      if (e.dataTransfer && e.dataTransfer.files) {
        handleImageFiles(Array.from(e.dataTransfer.files));
      }
    });
  }

  // Keyboard shortcuts
  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
    if (e.key === "ArrowRight" && state.sourceMode === "still" && imagesList.length > 0) {
      activeIndex = (activeIndex + 1) % imagesList.length;
      updateThumbnailsActive();
      requestRender();
    } else if (e.key === "ArrowLeft" && state.sourceMode === "still" && imagesList.length > 0) {
      activeIndex = (activeIndex - 1 + imagesList.length) % imagesList.length;
      updateThumbnailsActive();
      requestRender();
    } else if (["1", "2", "3", "4"].includes(e.key)) {
      const modes = ["thermal", "topo", "generative", "layered"];
      const card = document.querySelector(`.mode-card[data-mode="${modes[parseInt(e.key, 10) - 1]}"]`);
      if (card) card.click();
    } else if (e.code === "Space" && state.sourceMode === "webcam") {
      e.preventDefault();
      document.getElementById("freezeWebcamBtn").click();
    }
  });
}

function addImageEntry(item, switchToNew = false) {
  const entry = {
    name: item.name,
    filename: item.filename,
    src: item.src,
    loaded: false,
    img: new Image(),
    cache: null
  };
  imagesList.push(entry);
  updateStillEmptyState();
  const idx = imagesList.length - 1;
  entry.img.onload = () => {
    entry.cache = extractRawLuminance(entry.img);
    entry.loaded = true;
    buildFilmstrip();
    if (switchToNew) {
      activeIndex = idx;
      updateThumbnailsActive();
    }
    requestRender();
  };
  entry.img.src = item.src;
}

// Initialize app
function init() {
  initControls();
  buildLUT();
  if (window.PORTRAIT_IMAGES && window.PORTRAIT_IMAGES.length > 0) {
    window.PORTRAIT_IMAGES.forEach((item) => addImageEntry(item, false));
  }
  updateStillEmptyState();
}

init();
