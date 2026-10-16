// LIVE IR // Interactive Crowd Thermal Monitor Engine

const PALETTES = {
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
  mode: "thermal",        // 'thermal' | 'topo' | 'generative' | 'layered'
  palette: "rainbow_hot",
  hueShift: 0,
  posterize: 0,
  invertThermal: false,
  smoothing: 3.5,
  contrast: 1.20,
  gamma: 0.95,
  exposure: 0.0,
  detailBoost: 0.35,
  autoNormalize: true,
  // Crowd Heat Interaction
  crowdHeatEnabled: true,
  crowdOverride: "auto",  // 'auto' | 0 | 1 | 2 | 3 | 4
  crowdMaxPeople: 3,
  crowdIntensity: 1.0,
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
  scanline: 0.20,
  showHud: false
};

let state = { ...DEFAULT_STATE };
let isHoldingOriginal = false;
let lut = new Uint8ClampedArray(1024 * 3);

// Webcam state
const videoEl = document.getElementById("webcamVideo");
let webcamStream = null;
let webcamActive = false;
let webcamFrozen = false;
let mirrorWebcam = true;
let cameraFacing = "user"; // 'user' (Front) | 'environment' (Back)
let cameraZoom = 1;        // 0.5 | 1 | 2 | 3
let digitalCropZoom = 1;
let activeLensType = "main"; // 'main' | 'ultrawide'
let cameraLensMap = { frontId: "", backMainId: "", backUltraWideId: "" };
let webcamTargetHeight = 640;
let webcamRafId = null;
let webcamCapCanvas = document.createElement("canvas");
let webcamCapCtx = webcamCapCanvas.getContext("2d", { willReadFrequently: true });
let webcamRawBuffer = null;
let webcamHist = new Uint32Array(1000);
let smoothTelemetry = { maxX: 320, maxY: 240, maxVal: 0.9, minX: 100, minY: 100, minVal: 0.1, initialized: false };

// ==========================================
// CROWD / PEOPLE DETECTION & HEAT STATE
// ==========================================
let detectedPeopleCount = 0;
let detectedPeopleBoxes = []; // Normalized { cx, cy, rx, ry, score }
let smoothCrowdCount = 0;
let smoothAmbientTempC = 18.4;
let mpFaceDetector = null;
let mpObjectDetector = null;
let nativeFaceDetector = null;
let detectorReadyType = "heuristic"; // 'mediapipe' | 'native' | 'heuristic'
let lastDetectionTimestamp = 0;
let detectionBusy = false;

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

// Initialize AI People / Face Detectors (MediaPipe Vision + Native FaceDetector + Heuristic Fallback)
async function initPeopleDetectors() {
  if ("FaceDetector" in window) {
    try {
      nativeFaceDetector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 10 });
      detectorReadyType = "native";
    } catch (e) {
      nativeFaceDetector = null;
    }
  }

  try {
    const visionModule = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs");
    const { FaceDetector, ObjectDetector, FilesetResolver } = visionModule;
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
    );

    // Load lightweight multi-face detector
    mpFaceDetector = await FaceDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
        delegate: "GPU"
      },
      runningMode: "VIDEO",
      minDetectionConfidence: 0.38
    });

    // Also load lightweight person object detector so bodies at a distance or turned profiles count too
    try {
      mpObjectDetector = await ObjectDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite",
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        scoreThreshold: 0.38,
        categoryAllowlist: ["person"]
      });
    } catch (objErr) {
      // Face detector alone is already active if object detector fails
      mpObjectDetector = null;
    }

    detectorReadyType = "mediapipe";
  } catch (err) {
    console.warn("MediaPipe CDN unavailable, using fallback detector:", err);
  }
}

// Fast skin/presence blob heuristic fallback when offline or before WASM finishes loading
function detectPeopleHeuristic(imgData, w, h) {
  const gridW = 24;
  const gridH = 18;
  const cellSkin = new Float32Array(gridW * gridH);
  const data = imgData.data;
  const stepX = Math.max(2, Math.floor(w / (gridW * 3)));
  const stepY = Math.max(2, Math.floor(h / (gridH * 3)));

  for (let gy = 0; gy < gridH; gy++) {
    const y0 = Math.floor((gy * h) / gridH);
    const y1 = Math.floor(((gy + 1) * h) / gridH);
    for (let gx = 0; gx < gridW; gx++) {
      const x0 = Math.floor((gx * w) / gridW);
      const x1 = Math.floor(((gx + 1) * w) / gridW);
      let hits = 0;
      let samples = 0;
      for (let y = y0; y < y1; y += stepY) {
        for (let x = x0; x < x1; x += stepX) {
          const p = (y * w + x) * 4;
          const r = data[p];
          const g = data[p + 1];
          const b = data[p + 2];
          samples++;
          // Broad skin / warm foreground chromaticity check
          const maxC = Math.max(r, g, b);
          const minC = Math.min(r, g, b);
          if (
            r > 65 &&
            g > 35 &&
            b > 20 &&
            r > g &&
            r > b &&
            r - Math.min(g, b) > 12 &&
            maxC - minC > 15 &&
            r < 250
          ) {
            hits++;
          }
        }
      }
      cellSkin[gy * gridW + gx] = samples > 0 ? hits / samples : 0;
    }
  }

  // Connected components on grid cells
  const visited = new Uint8Array(gridW * gridH);
  const blobs = [];
  for (let i = 0; i < cellSkin.length; i++) {
    if (visited[i] || cellSkin[i] < 0.28) continue;
    const queue = [i];
    visited[i] = 1;
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    let minGX = gridW, maxGX = 0, minGY = gridH, maxGY = 0;

    while (queue.length > 0) {
      const curr = queue.pop();
      const cx = curr % gridW;
      const cy = (curr - cx) / gridW;
      sumX += cx + 0.5;
      sumY += cy + 0.5;
      count++;
      if (cx < minGX) minGX = cx;
      if (cx > maxGX) maxGX = cx;
      if (cy < minGY) minGY = cy;
      if (cy > maxGY) maxGY = cy;

      const neighbors = [
        cy > 0 ? (cy - 1) * gridW + cx : -1,
        cy < gridH - 1 ? (cy + 1) * gridW + cx : -1,
        cx > 0 ? cy * gridW + (cx - 1) : -1,
        cx < gridW - 1 ? cy * gridW + (cx + 1) : -1
      ];
      for (const nb of neighbors) {
        if (nb >= 0 && !visited[nb] && cellSkin[nb] >= 0.22) {
          visited[nb] = 1;
          queue.push(nb);
        }
      }
    }

    if (count >= 3) {
      blobs.push({
        cx: (sumX / count) / gridW,
        cy: (sumY / count) / gridH,
        rx: Math.max(0.12, ((maxGX - minGX + 1) / gridW) * 0.75),
        ry: Math.max(0.16, ((maxGY - minGY + 1) / gridH) * 0.85),
        cells: count
      });
    }
  }

  blobs.sort((a, b) => b.cells - a.cells);
  return blobs.slice(0, 6);
}

// Run periodic people detection (~10 times per second) on webcamCapCanvas / videoEl
function updatePeopleDetection(nowMs, imgData, w, h) {
  if (state.crowdOverride !== "auto") {
    const manualCount = parseInt(state.crowdOverride, 10) || 0;
    detectedPeopleCount = manualCount;
    detectedPeopleBoxes = [];
    for (let k = 0; k < manualCount; k++) {
      const spread = manualCount === 1 ? 0.5 : (k + 1) / (manualCount + 1);
      detectedPeopleBoxes.push({
        cx: spread,
        cy: 0.48,
        rx: 0.22,
        ry: 0.34
      });
    }
    return;
  }

  if (nowMs - lastDetectionTimestamp < 95 || detectionBusy) return;
  lastDetectionTimestamp = nowMs;

  if (detectorReadyType === "mediapipe" && mpFaceDetector) {
    try {
      const ts = Math.round(performance.now());
      const faceRes = mpFaceDetector.detectForVideo(webcamCapCanvas, ts);
      const faceBoxes = (faceRes && faceRes.detections ? faceRes.detections : []).map((d) => {
        const bb = d.boundingBox;
        return {
          cx: (bb.originX + bb.width * 0.5) / w,
          cy: (bb.originY + bb.height * 0.5) / h,
          rx: Math.max(0.14, (bb.width / w) * 0.95),
          ry: Math.max(0.22, (bb.height / h) * 1.25)
        };
      });

      let personBoxes = [];
      if (mpObjectDetector) {
        const objRes = mpObjectDetector.detectForVideo(webcamCapCanvas, ts + 1);
        personBoxes = (objRes && objRes.detections ? objRes.detections : []).map((d) => {
          const bb = d.boundingBox;
          return {
            cx: (bb.originX + bb.width * 0.5) / w,
            cy: (bb.originY + bb.height * 0.5) / h,
            rx: Math.max(0.15, (bb.width / w) * 0.55),
            ry: Math.max(0.22, (bb.height / h) * 0.55)
          };
        });
      }

      // Merge face detections and person body detections without double-counting the same person
      const merged = [...faceBoxes];
      for (const pb of personBoxes) {
        const isDuplicate = merged.some((fb) => {
          const dx = Math.abs(fb.cx - pb.cx);
          const dy = Math.abs(fb.cy - pb.cy);
          return dx < Math.max(fb.rx, pb.rx) * 0.85 && dy < Math.max(fb.ry, pb.ry) * 1.1;
        });
        if (!isDuplicate) {
          merged.push(pb);
        }
      }

      detectedPeopleCount = merged.length;
      detectedPeopleBoxes = merged;
      return;
    } catch (e) {
      // Fall through to native or heuristic if a frame timestamp collides
    }
  }

  if (nativeFaceDetector) {
    detectionBusy = true;
    nativeFaceDetector
      .detect(webcamCapCanvas)
      .then((faces) => {
        detectedPeopleCount = faces.length;
        detectedPeopleBoxes = faces.map((f) => {
          const bb = f.boundingBox;
          return {
            cx: (bb.x + bb.width * 0.5) / w,
            cy: (bb.y + bb.height * 0.5) / h,
            rx: Math.max(0.14, (bb.width / w) * 0.95),
            ry: Math.max(0.22, (bb.height / h) * 1.25)
          };
        });
        detectionBusy = false;
      })
      .catch(() => {
        detectionBusy = false;
      });
    return;
  }

  const blobs = detectPeopleHeuristic(imgData, w, h);
  detectedPeopleCount = blobs.length;
  detectedPeopleBoxes = blobs;
}

// Smoothly step crowd count and update UI badges
function stepCrowdThermalState() {
  const targetCount = state.crowdHeatEnabled ? detectedPeopleCount : 1;
  // Smooth transition so entering/leaving people shifts temperature organically
  const alpha = 0.08;
  smoothCrowdCount += (targetCount - smoothCrowdCount) * alpha;
  if (Math.abs(smoothCrowdCount - targetCount) < 0.01) {
    smoothCrowdCount = targetCount;
  }

  const maxPpl = Math.max(1, state.crowdMaxPeople);
  const normCrowd = Math.min(1.35, (smoothCrowdCount / maxPpl) * state.crowdIntensity);

  // Compute simulated core °C based on crowd count:
  // 0 people -> ~18.4°C (Cold), 1 person -> ~31.2°C (Mild), 2 people -> ~36.8°C (Warm), 3+ people -> ~41.5°C+ (Hot)
  const targetTempC = 18.4 + Math.min(1.3, normCrowd) * 18.8;
  smoothAmbientTempC += (targetTempC - smoothAmbientTempC) * 0.1;

  updateCrowdUI(Math.round(targetCount), normCrowd, smoothAmbientTempC);
  return normCrowd;
}

function updateCrowdUI(displayCount, normCrowd, tempC) {
  const pill = document.getElementById("crowdTempPill");
  const countText = document.getElementById("crowdCountText");
  const tempVal = document.getElementById("crowdTempValue");
  const drawerStatus = document.getElementById("drawerCrowdStatus");

  const pplLabel = displayCount === 1 ? "1 PERSON" : `${displayCount} PPL`;
  if (countText) countText.textContent = pplLabel;
  if (tempVal) tempVal.textContent = `${tempC.toFixed(1)}°C`;

  let tierClass = "state-cold";
  let tierName = "Ice Cold";
  if (displayCount >= 3 || normCrowd >= 0.88) {
    tierClass = "state-hot";
    tierName = "Blazing Hot";
  } else if (displayCount === 2 || normCrowd >= 0.52) {
    tierClass = "state-warm";
    tierName = "Warm";
  } else if (displayCount === 1 || normCrowd >= 0.18) {
    tierClass = "state-mild";
    tierName = "Cool / Mild";
  }

  if (pill) {
    pill.className = `crowd-temp-pill ${tierClass}`;
  }
  if (drawerStatus) {
    const noun = displayCount === 1 ? "Person" : "People";
    drawerStatus.textContent = `${displayCount} ${noun} • ${tierName} (${tempC.toFixed(1)}°C)`;
  }
}

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
  const stops = PALETTES[state.palette] || PALETTES.rainbow_hot;
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

// Compute calibrated thermal field [0, 1] + crowd temperature modulation
function computeThermalFieldFromCache(cacheObj, normCrowd = 0.35) {
  const { width, height, raw, minP, maxP } = cacheObj;
  const resScale = width / 928;
  const effSmoothing = state.smoothing * resScale;
  const smoothed = blurFloatField(raw, width, height, effSmoothing);

  const useDetail = state.detailBoost > 0.01;
  const broad = useDetail ? blurFloatField(smoothed, width, height, Math.max(3, effSmoothing * 2.4)) : null;

  const field = new Float32Array(width * height);
  const span = Math.max(0.05, maxP - minP);

  // Crowd Heat Mapping:
  // When crowdHeatEnabled is true:
  //   0 people (normCrowd = 0.0) -> [heatFloor = 0.00, heatCeil = 0.35] (Ice Cold Blues/Cyans)
  //   1 person (normCrowd ~ 0.33)-> [heatFloor = 0.03, heatCeil = 0.65] (Cool Blues -> Emerald/Cyan)
  //   2 people (normCrowd ~ 0.67)-> [heatFloor = 0.11, heatCeil = 0.87] (Warm Green -> Yellow/Orange)
  //   3+ people(normCrowd >= 1.0)-> [heatFloor = 0.22, heatCeil = 1.08] (Blazing Red -> White-Hot Core)
  let heatFloor = 0.0;
  let heatCeil = 1.0;
  let crowdGammaBoost = 1.0;

  if (state.crowdHeatEnabled) {
    const c = Math.max(0, normCrowd);
    heatFloor = Math.min(0.32, Math.pow(c, 1.35) * 0.22);
    heatCeil = Math.min(1.12, 0.34 + c * 0.68);
    // Boost gamma warmth as more people enter
    crowdGammaBoost = 0.72 + c * 0.52;
  }

  const invGamma = 1 / Math.max(0.1, state.gamma * crowdGammaBoost);
  const hasBoxes = state.crowdHeatEnabled && detectedPeopleBoxes.length > 0;
  const plumeStrength = Math.min(0.24, 0.06 + normCrowd * 0.12);

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

    const x = i % width;
    const y = (i - x) / width;

    // Map into crowd-modulated thermal window [heatFloor, heatCeil]
    if (state.crowdHeatEnabled) {
      v = heatFloor + v * (heatCeil - heatFloor);

      // Add subtle localized thermal plume around each detected person
      if (hasBoxes) {
        const nx = x / width;
        const ny = y / height;
        let maxPlume = 0;
        for (let b = 0; b < detectedPeopleBoxes.length; b++) {
          const box = detectedPeopleBoxes[b];
          const dx = (nx - box.cx) / box.rx;
          const dy = (ny - box.cy) / box.ry;
          const d2 = dx * dx + dy * dy;
          if (d2 < 1.0) {
            const falloff = (1.0 - d2) * (1.0 - d2);
            if (falloff > maxPlume) maxPlume = falloff;
          }
        }
        v += maxPlume * plumeStrength * (0.4 + 0.6 * smoothed[i]);
      }
      v = Math.min(1, Math.max(0, v));
    }

    if (state.invertThermal) {
      v = 1 - v;
    }
    field[i] = v;

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

// Deterministic pseudo-noise for sensor grain
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

// Multi-pass Thermal Halation / Bloom (boosted slightly when crowd heat is high)
function applyThermalBloom(targetCtx, width, height, normCrowd = 0.35) {
  const extraBloom = state.crowdHeatEnabled ? Math.max(0, (normCrowd - 0.5) * 0.35) : 0;
  const effBloom = state.bloom + extraBloom;
  if (effBloom <= 0.02) return;
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
  targetCtx.globalAlpha = Math.min(1, effBloom * 0.85);
  targetCtx.drawImage(bloomCanvas, 0, 0, width, height);
  targetCtx.restore();
}

// Thermal Telemetry HUD Overlay
function renderThermalHUD(targetCtx, thermalData) {
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

  const scaleMaxC = (smoothAmbientTempC + 4.2).toFixed(1);
  const scaleMinC = Math.max(14.0, smoothAmbientTempC - 10.5).toFixed(1);
  targetCtx.fillStyle = "#ffffff";
  targetCtx.textAlign = "center";
  targetCtx.fillText(`${scaleMaxC}°C`, barX + barW * 0.5, barY - 10);
  targetCtx.fillText(`${scaleMinC}°C`, barX + barW * 0.5, barY + barH + 18);

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

  const maxTemp = (18.0 + maxVal * 24.5).toFixed(1);
  targetCtx.textAlign = "left";
  targetCtx.fillStyle = "rgba(5, 7, 18, 0.72)";
  targetCtx.fillRect(maxX + rCross + 6, maxY - 11, 108 * scaleFactor, 22 * scaleFactor);
  targetCtx.fillStyle = "#ffe600";
  targetCtx.fillText(`MAX ${maxTemp}°C`, maxX + rCross + 12, maxY + 4);

  // 3. Coldspot Marker (MIN TEMP)
  const minTemp = (15.5 + minVal * 10.2).toFixed(1);
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
  targetCtx.fillStyle = "rgba(5, 7, 18, 0.65)";
  targetCtx.fillRect(pad, pad, 260 * scaleFactor, 50 * scaleFactor);
  targetCtx.strokeStyle = "rgba(0, 216, 216, 0.5)";
  targetCtx.strokeRect(pad, pad, 260 * scaleFactor, 50 * scaleFactor);

  const countDisplay = Math.round(smoothCrowdCount);
  targetCtx.fillStyle = "#00d8d8";
  targetCtx.fillText(`SUBJECTS: ${countDisplay} // TEMP: ${smoothAmbientTempC.toFixed(1)}°C`, pad + 10, pad + 19 * scaleFactor);
  targetCtx.fillStyle = "rgba(255,255,255,0.75)";
  targetCtx.fillText(`MODE: ${state.mode.toUpperCase()}  ε=0.98`, pad + 10, pad + 37 * scaleFactor);

  targetCtx.restore();
}

// ==========================================
// REAL-TIME WEBCAM ENGINE
// ==========================================

async function populateCameraDevices() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter((d) => d.kind === "videoinput");

    let frontId = "";
    let backMainId = "";
    let backUltraWideId = "";
    const externalDevices = [];

    videoDevices.forEach((d) => {
      const lbl = (d.label || "").toLowerCase();
      if (/front|user|facetime/i.test(lbl)) {
        if (!frontId) frontId = d.deviceId;
      } else if (/back|rear|environment/i.test(lbl)) {
        if (/ultra\s*wide|0\.5/i.test(lbl)) {
          if (!backUltraWideId) backUltraWideId = d.deviceId;
        } else if (/triple|dual\s*wide|dual/i.test(lbl)) {
          backMainId = d.deviceId;
        } else if (!/telephoto|tele\b/i.test(lbl) && !backMainId) {
          backMainId = d.deviceId;
        }
      } else if (d.deviceId) {
        externalDevices.push(d);
      }
    });

    cameraLensMap = { frontId, backMainId, backUltraWideId };
    updateZoomUI();

    const select = document.getElementById("cameraDeviceSelect");
    if (select) {
      select.innerHTML = "";
      const optFront = document.createElement("option");
      optFront.value = "user";
      optFront.textContent = "Front Camera";
      select.appendChild(optFront);

      if (backMainId || backUltraWideId || videoDevices.length > 1) {
        const optBack = document.createElement("option");
        optBack.value = "environment";
        optBack.textContent = "Back Camera";
        select.appendChild(optBack);
      }

      externalDevices.forEach((d, idx) => {
        if (d.deviceId !== frontId && d.deviceId !== backMainId) {
          const opt = document.createElement("option");
          opt.value = d.deviceId;
          opt.textContent = d.label || `Camera #${idx + 1}`;
          select.appendChild(opt);
        }
      });

      select.value = cameraFacing;
    }
  } catch (err) {
    console.warn("Could not enumerate video devices:", err);
  }
}

function updateZoomUI() {
  const ultraBtn = document.getElementById("zoomUltraWideBtn");
  if (ultraBtn) {
    let hasHardwareUltra = false;
    if (webcamStream) {
      const track = webcamStream.getVideoTracks()[0];
      const caps = track && track.getCapabilities ? track.getCapabilities() : null;
      if (caps && caps.zoom && caps.zoom.min < 0.9) hasHardwareUltra = true;
    }
    const showUltra = cameraFacing === "environment" && Boolean(cameraLensMap.backUltraWideId || hasHardwareUltra);
    ultraBtn.style.display = showUltra ? "inline-block" : "none";
  }

  document.querySelectorAll("#cameraZoomGroup .zoom-pill").forEach((btn) => {
    const z = parseFloat(btn.dataset.zoom);
    btn.classList.toggle("active", Math.abs(z - cameraZoom) < 0.05);
  });
}

async function applyTrackOrDigitalZoom(zoomLevel) {
  cameraZoom = zoomLevel;
  updateZoomUI();

  if (cameraFacing === "environment" && cameraLensMap.backUltraWideId) {
    const wantUltraLens = zoomLevel < 1;
    const targetLensType = wantUltraLens ? "ultrawide" : "main";
    if (webcamActive && activeLensType !== targetLensType) {
      await startWebcam("environment");
      return;
    }
  }

  let handledByHardware = false;
  if (webcamStream) {
    const track = webcamStream.getVideoTracks()[0];
    if (track && track.getCapabilities && track.applyConstraints) {
      try {
        const caps = track.getCapabilities();
        if (caps && caps.zoom && zoomLevel >= caps.zoom.min && zoomLevel <= caps.zoom.max) {
          await track.applyConstraints({ advanced: [{ zoom: zoomLevel }] });
          handledByHardware = true;
        }
      } catch (e) {
        handledByHardware = false;
      }
    }
  }

  if (handledByHardware || zoomLevel <= 1) {
    digitalCropZoom = 1;
  } else {
    digitalCropZoom = zoomLevel;
  }

  if (webcamFrozen && webcamActive) {
    renderWebcamFrame();
  }
}

async function startWebcam(targetModeOrId = "") {
  const overlay = document.getElementById("webcamPromptOverlay");
  const titleEl = document.getElementById("webcamPromptTitle");
  const descEl = document.getElementById("webcamPromptDesc");
  const retryBtn = document.getElementById("retryWebcamBtn");

  overlay.classList.add("visible");
  titleEl.textContent = "Initializing Live Thermal Feed...";
  descEl.textContent = "Allow camera access in your browser prompt to stream real-time thermal video. More people in frame increases the thermal temperature.";
  retryBtn.style.display = "none";

  stopWebcamStreamOnly();

  if (targetModeOrId === "user" || targetModeOrId === "environment") {
    cameraFacing = targetModeOrId;
  }

  try {
    const videoConstraints = {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 60 }
    };

    if (targetModeOrId && targetModeOrId !== "user" && targetModeOrId !== "environment") {
      videoConstraints.deviceId = { exact: targetModeOrId };
      activeLensType = "main";
    } else if (cameraFacing === "environment") {
      if (cameraZoom < 1 && cameraLensMap.backUltraWideId) {
        videoConstraints.deviceId = { exact: cameraLensMap.backUltraWideId };
        activeLensType = "ultrawide";
      } else if (cameraLensMap.backMainId) {
        videoConstraints.deviceId = { exact: cameraLensMap.backMainId };
        activeLensType = "main";
      } else {
        videoConstraints.facingMode = { ideal: "environment" };
        activeLensType = "main";
      }
    } else {
      if (cameraLensMap.frontId) {
        videoConstraints.deviceId = { exact: cameraLensMap.frontId };
      } else {
        videoConstraints.facingMode = "user";
      }
      activeLensType = "main";
    }

    webcamStream = await navigator.mediaDevices.getUserMedia({
      video: videoConstraints,
      audio: false
    });
    videoEl.srcObject = webcamStream;
    await videoEl.play();

    webcamActive = true;
    webcamFrozen = false;
    updateFreezeBtnUI();
    overlay.classList.remove("visible");

    const track = webcamStream.getVideoTracks()[0];
    const settings = (track && track.getSettings) ? track.getSettings() : {};
    const trackLabel = (track && track.label) ? track.label : "";
    const isBackCamera =
      cameraFacing === "environment" ||
      settings.facingMode === "environment" ||
      /back|rear|environment/i.test(trackLabel);

    cameraFacing = isBackCamera ? "environment" : "user";
    mirrorWebcam = !isBackCamera;
    const mirrorCheckbox = document.getElementById("mirrorWebcam");
    if (mirrorCheckbox) {
      mirrorCheckbox.checked = mirrorWebcam;
    }

    const flipLabel = document.getElementById("flipCameraLabel");
    if (flipLabel) {
      flipLabel.textContent = isBackCamera ? "Back" : "Flip";
    }

    await populateCameraDevices();
    await applyTrackOrDigitalZoom(cameraZoom);
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
    if (!webcamActive) return;
    renderWebcamFrame();

    fpsFrameCount++;
    const now = performance.now();
    if (now - fpsLastTime >= 500) {
      const fps = Math.round((fpsFrameCount * 1000) / (now - fpsLastTime));
      const fpsEl = document.getElementById("fpsCounter");
      if (fpsEl) fpsEl.textContent = `${fps} FPS`;
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
    const resLabel = document.getElementById("webcamResLabel");
    if (resLabel) resLabel.textContent = `${targetW} × ${targetH} px`;
  }

  if (!webcamFrozen) {
    webcamCapCtx.save();
    if (mirrorWebcam) {
      webcamCapCtx.translate(targetW, 0);
      webcamCapCtx.scale(-1, 1);
    }
    const crop = digitalCropZoom > 1 ? digitalCropZoom : 1;
    const sw = videoEl.videoWidth / crop;
    const sh = videoEl.videoHeight / crop;
    const sx = (videoEl.videoWidth - sw) * 0.5;
    const sy = (videoEl.videoHeight - sh) * 0.5;
    webcamCapCtx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, targetW, targetH);
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

  const frameImgData = webcamCapCtx.getImageData(0, 0, targetW, targetH);
  const data = frameImgData.data;

  // Detect how many people are in frame and compute crowd heat level
  updatePeopleDetection(performance.now(), frameImgData, targetW, targetH);
  const normCrowd = stepCrowdThermalState();

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

  if (!webcamFrozen) {
    frameSeed = (frameSeed + 997) & 0xffff;
  }

  const thermalData = computeThermalFieldFromCache(cacheObj, normCrowd);

  if (state.mode === "generative") {
    renderGenerativeMode(mainCtx, thermalData);
  } else {
    renderPixelThermalBuffer(mainCtx, thermalData, state.mode);
  }

  applyThermalBloom(mainCtx, targetW, targetH, normCrowd);

  if (state.mode === "layered") {
    renderThermalHUD(mainCtx, thermalData);
  }
}

function updateFreezeBtnUI() {
  const btn = document.getElementById("freezeWebcamBtn");
  if (!btn) return;
  if (webcamFrozen) {
    btn.classList.add("active");
    btn.innerHTML = `<span>▶</span><span class="dock-btn-text">Resume</span>`;
  } else {
    btn.classList.remove("active");
    btn.innerHTML = `<span>⏸</span><span class="dock-btn-text">Freeze</span>`;
  }
}

// ==========================================
// 3-SECOND COUNTDOWN, GIF89a ENCODER & QR DOWNLOAD CARD
// ==========================================

let captureBusy = false;
let currentCaptureObjectUrl = null;

function triggerShutterFlash() {
  const flash = document.getElementById("captureFlashOverlay");
  if (!flash) return;
  flash.classList.add("flash-active");
  requestAnimationFrame(() => {
    setTimeout(() => {
      flash.classList.remove("flash-active");
    }, 60);
  });
}

function runThreeSecondCountdown(labelText) {
  return new Promise((resolve) => {
    const overlay = document.getElementById("captureCountdownOverlay");
    const labelEl = document.getElementById("captureCountdownLabel");
    const numEl = document.getElementById("captureCountdownNumber");
    const progTrack = document.getElementById("captureProgressTrack");

    if (labelEl) labelEl.textContent = labelText;
    if (progTrack) progTrack.style.display = "none";
    if (overlay) overlay.classList.add("visible");

    let remaining = 3;
    if (numEl) numEl.textContent = String(remaining);

    const stepTimer = setInterval(() => {
      remaining--;
      if (remaining > 0) {
        if (numEl) numEl.textContent = String(remaining);
      } else {
        clearInterval(stepTimer);
        if (overlay) overlay.classList.remove("visible");
        resolve();
      }
    }, 1000);
  });
}

// Fast Pure-JS Animated GIF89a Encoder (256-color thermal + RGB cube palette with LZW compression)
function encodeAnimatedGIF(imageDataFrames, width, height, delayCs = 10) {
  // 1. Build 256-color Global Color Table:
  //    0..215: 6x6x6 RGB cube
  //    216..255: 40 evenly spaced colors from active thermal LUT
  const palette = new Uint8Array(256 * 3);
  let pIdx = 0;
  const levels = [0, 51, 102, 153, 204, 255];
  for (let r = 0; r < 6; r++) {
    for (let g = 0; g < 6; g++) {
      for (let b = 0; b < 6; b++) {
        palette[pIdx * 3] = levels[r];
        palette[pIdx * 3 + 1] = levels[g];
        palette[pIdx * 3 + 2] = levels[b];
        pIdx++;
      }
    }
  }
  for (let k = 0; k < 40; k++) {
    const lutPos = Math.min(1023, Math.round((k / 39) * 1023)) * 3;
    palette[pIdx * 3] = lut[lutPos];
    palette[pIdx * 3 + 1] = lut[lutPos + 1];
    palette[pIdx * 3 + 2] = lut[lutPos + 2];
    pIdx++;
  }

  // Precompute 15-bit RGB (32x32x32) -> nearest palette index lookup table
  const rgb15ToIdx = new Uint8Array(32768);
  for (let r5 = 0; r5 < 32; r5++) {
    const r = (r5 << 3) | (r5 >> 2);
    for (let g5 = 0; g5 < 32; g5++) {
      const g = (g5 << 3) | (g5 >> 2);
      for (let b5 = 0; b5 < 32; b5++) {
        const b = (b5 << 3) | (b5 >> 2);
        let bestIdx = 0;
        let bestDist = 1e9;
        for (let i = 0; i < 256; i++) {
          const dr = r - palette[i * 3];
          const dg = g - palette[i * 3 + 1];
          const db = b - palette[i * 3 + 2];
          const dist = dr * dr + dg * dg + db * db;
          if (dist < bestDist) {
            bestDist = dist;
            bestIdx = i;
            if (dist === 0) break;
          }
        }
        rgb15ToIdx[(r5 << 10) | (g5 << 5) | b5] = bestIdx;
      }
    }
  }

  const bytes = [];
  const writeByte = (b) => bytes.push(b & 0xff);
  const writeShort = (v) => {
    bytes.push(v & 0xff, (v >> 8) & 0xff);
  };
  const writeAscii = (str) => {
    for (let i = 0; i < str.length; i++) bytes.push(str.charCodeAt(i));
  };

  // Header + Logical Screen Descriptor
  writeAscii("GIF89a");
  writeShort(width);
  writeShort(height);
  writeByte(0xf7); // Global color table, 8-bit, 256 entries
  writeByte(0);    // Background index
  writeByte(0);    // Aspect ratio

  // Global Color Table (768 bytes)
  for (let i = 0; i < palette.length; i++) {
    writeByte(palette[i]);
  }

  // Netscape 2.0 Infinite Loop Extension
  writeByte(0x21);
  writeByte(0xff);
  writeByte(0x0b);
  writeAscii("NETSCAPE2.0");
  writeByte(0x03);
  writeByte(0x01);
  writeShort(0); // Loop forever
  writeByte(0x00);

  const dict = new Int32Array(4096 * 256);
  const subBlock = new Uint8Array(255);
  const indexPixels = new Uint8Array(width * height);

  // Encode each frame
  for (let f = 0; f < imageDataFrames.length; f++) {
    const rgba = imageDataFrames[f];
    for (let i = 0, p = 0; i < indexPixels.length; i++, p += 4) {
      const key15 = ((rgba[p] >> 3) << 10) | ((rgba[p + 1] >> 3) << 5) | (rgba[p + 2] >> 3);
      indexPixels[i] = rgb15ToIdx[key15];
    }

    // Graphic Control Extension
    writeByte(0x21);
    writeByte(0xf9);
    writeByte(0x04);
    writeByte(0x04); // Disposal method 1 (do not dispose)
    writeShort(delayCs);
    writeByte(0x00);
    writeByte(0x00);

    // Image Descriptor
    writeByte(0x2c);
    writeShort(0);
    writeShort(0);
    writeShort(width);
    writeShort(height);
    writeByte(0x00); // No local color table

    // LZW Image Data
    const minCodeSize = 8;
    const clearCode = 256;
    const eoiCode = 257;
    writeByte(minCodeSize);

    let subLen = 0;
    let bitBuf = 0;
    let bitCnt = 0;

    const flushSub = () => {
      if (subLen > 0) {
        writeByte(subLen);
        for (let k = 0; k < subLen; k++) writeByte(subBlock[k]);
        subLen = 0;
      }
    };

    const emitCode = (code, size) => {
      bitBuf |= code << bitCnt;
      bitCnt += size;
      while (bitCnt >= 8) {
        subBlock[subLen++] = bitBuf & 0xff;
        if (subLen === 255) flushSub();
        bitBuf >>>= 8;
        bitCnt -= 8;
      }
    };

    dict.fill(-1);
    let codeSize = 9;
    let nextCode = 258;

    emitCode(clearCode, codeSize);
    let prefix = indexPixels[0];
    for (let i = 1; i < indexPixels.length; i++) {
      const suffix = indexPixels[i];
      const dKey = (prefix << 8) | suffix;
      const entry = dict[dKey];
      if (entry !== -1) {
        prefix = entry;
      } else {
        emitCode(prefix, codeSize);
        if (nextCode < 4096) {
          dict[dKey] = nextCode;
          if (nextCode === (1 << codeSize) && codeSize < 12) {
            codeSize++;
          }
          nextCode++;
        } else {
          emitCode(clearCode, codeSize);
          dict.fill(-1);
          codeSize = 9;
          nextCode = 258;
        }
        prefix = suffix;
      }
    }
    emitCode(prefix, codeSize);
    emitCode(eoiCode, codeSize);

    if (bitCnt > 0) {
      subBlock[subLen++] = bitBuf & 0xff;
    }
    flushSub();
    writeByte(0x00); // Block terminator
  }

  // GIF Trailer
  writeByte(0x3b);
  return new Blob([new Uint8Array(bytes)], { type: "image/gif" });
}

// Upload captured PNG or GIF to a temporary public URL so phones can scan the QR code to download
async function uploadCaptureForQr(blob, filename) {
  // Provider 1: tmpfiles.org (CORS-enabled, returns JSON with URL)
  try {
    const fd1 = new FormData();
    fd1.append("file", blob, filename);
    const res1 = await fetch("https://tmpfiles.org/api/v1/upload", {
      method: "POST",
      body: fd1
    });
    if (res1.ok) {
      const json1 = await res1.json();
      if (json1 && json1.data && json1.data.url) {
        // Convert view URL https://tmpfiles.org/12345/file.png -> direct download https://tmpfiles.org/dl/12345/file.png
        const rawUrl = json1.data.url.replace(/^http:\/\//i, "https://");
        return rawUrl.replace("https://tmpfiles.org/", "https://tmpfiles.org/dl/");
      }
    }
  } catch (e) {
    // Try next provider
  }

  // Provider 2: uguu.se (CORS-enabled, returns direct download link)
  try {
    const fd2 = new FormData();
    fd2.append("files[]", blob, filename);
    const res2 = await fetch("https://uguu.se/upload", {
      method: "POST",
      body: fd2
    });
    if (res2.ok) {
      const json2 = await res2.json();
      if (json2 && json2.files && json2.files[0] && json2.files[0].url) {
        return json2.files[0].url;
      }
    }
  } catch (e) {
    // Try next provider
  }

  // Provider 3: litterbox.catbox.moe (1h temporary storage)
  try {
    const fd3 = new FormData();
    fd3.append("reqtype", "fileupload");
    fd3.append("time", "1h");
    fd3.append("fileToUpload", blob, filename);
    const res3 = await fetch("https://litterbox.catbox.moe/resources/internals/api.php", {
      method: "POST",
      body: fd3
    });
    if (res3.ok) {
      const textUrl = (await res3.text()).trim();
      if (textUrl.startsWith("https://")) {
        return textUrl;
      }
    }
  } catch (e) {
    // Fallback
  }

  return null;
}

function renderQrCodeToMount(url, mountEl) {
  mountEl.innerHTML = "";
  if (typeof window.qrcode === "function") {
    try {
      const qr = window.qrcode(0, "M");
      qr.addData(url);
      qr.make();
      mountEl.innerHTML = qr.createSvgTag({ cellSize: 3, margin: 1, scalable: true });
      mountEl.classList.add("ready");
      return;
    } catch (e) {
      // Fallback to QR image API
    }
  }
  const img = new Image();
  img.alt = "Scan QR to download";
  img.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=4&data=${encodeURIComponent(url)}`;
  mountEl.appendChild(img);
  mountEl.classList.add("ready");
}

async function presentCaptureWithQR(blob, filename, titleText) {
  if (currentCaptureObjectUrl) {
    URL.revokeObjectURL(currentCaptureObjectUrl);
  }
  currentCaptureObjectUrl = URL.createObjectURL(blob);

  const card = document.getElementById("captureQrCard");
  const titleEl = document.getElementById("qrCardTitle");
  const previewImg = document.getElementById("qrPreviewImg");
  const spinnerEl = document.getElementById("qrSpinner");
  const mountEl = document.getElementById("qrCanvasMount");
  const statusEl = document.getElementById("qrStatusText");
  const dlBtn = document.getElementById("qrDownloadBtn");

  if (titleEl) titleEl.textContent = titleText;
  if (previewImg) previewImg.src = currentCaptureObjectUrl;
  if (dlBtn) {
    dlBtn.href = currentCaptureObjectUrl;
    dlBtn.download = filename;
    dlBtn.textContent = filename.endsWith(".gif") ? "↓ Save GIF" : "↓ Save PNG";
  }

  if (mountEl) {
    mountEl.innerHTML = "";
    mountEl.classList.remove("ready");
  }
  if (spinnerEl) {
    spinnerEl.style.display = "block";
    spinnerEl.textContent = "Creating QR...";
  }
  if (statusEl) {
    statusEl.textContent = "Uploading for mobile QR...";
  }
  if (card) {
    card.classList.add("visible");
  }

  const publicUrl = await uploadCaptureForQr(blob, filename);
  if (publicUrl && mountEl) {
    if (spinnerEl) spinnerEl.style.display = "none";
    renderQrCodeToMount(publicUrl, mountEl);
    if (statusEl) statusEl.textContent = "Scan QR to download";
  } else {
    // Fallback if offline: encode current page URL or prompt direct save
    if (spinnerEl) spinnerEl.style.display = "none";
    renderQrCodeToMount(window.location.href, mountEl);
    if (statusEl) statusEl.textContent = "Use ↓ Save button below";
  }
}

async function startDelayedSnapshotPNG() {
  if (!webcamActive || captureBusy) return;
  captureBusy = true;
  const snapBtn = document.getElementById("snapshotWebcamBtn");
  if (snapBtn) snapBtn.classList.add("active");

  await runThreeSecondCountdown("SNAPSHOT PNG IN");
  triggerShutterFlash();

  mainCanvas.toBlob((blob) => {
    captureBusy = false;
    if (snapBtn) snapBtn.classList.remove("active");
    if (!blob) return;
    const filename = `thermal-${state.mode}-${Date.now()}.png`;
    showToast("Captured PNG! Scan QR on bottom right or click Save.");
    presentCaptureWithQR(blob, filename, "PNG SNAPSHOT");
  }, "image/png");
}

async function startDelayedGifRecording() {
  if (!webcamActive || captureBusy) return;
  captureBusy = true;
  const recBtn = document.getElementById("recordWebcamBtn");
  if (recBtn) {
    recBtn.classList.add("recording");
    recBtn.innerHTML = `<span>●</span><span class="dock-btn-text">3s...</span>`;
  }

  // 1. 3-second countdown before GIF recording starts
  await runThreeSecondCountdown("RECORD 3S GIF IN");

  // 2. Record 3.0 seconds of frames into an animated GIF
  const overlay = document.getElementById("captureCountdownOverlay");
  const labelEl = document.getElementById("captureCountdownLabel");
  const numEl = document.getElementById("captureCountdownNumber");
  const progTrack = document.getElementById("captureProgressTrack");
  const progBar = document.getElementById("captureProgressBar");

  if (labelEl) labelEl.textContent = "● RECORDING GIF";
  if (numEl) numEl.textContent = "3.0s";
  if (progBar) progBar.style.width = "0%";
  if (progTrack) progTrack.style.display = "block";
  if (overlay) overlay.classList.add("visible");
  if (recBtn) {
    recBtn.innerHTML = `<span>■</span><span class="dock-btn-text">Rec...</span>`;
  }

  const aspect = (mainCanvas.width || 640) / (mainCanvas.height || 480);
  const gifH = 300;
  const gifW = Math.round((gifH * aspect) / 2) * 2;
  const capC = document.createElement("canvas");
  capC.width = gifW;
  capC.height = gifH;
  const capCtx = capC.getContext("2d", { willReadFrequently: true });

  const totalDurationMs = 3000;
  const fps = 10;
  const totalFrames = 30;
  const intervalMs = totalDurationMs / totalFrames;
  const frames = [];
  const startTime = performance.now();

  await new Promise((resolve) => {
    const timer = setInterval(() => {
      const elapsed = performance.now() - startTime;
      const remainSec = Math.max(0, (totalDurationMs - elapsed) / 1000);
      const pct = Math.min(100, (elapsed / totalDurationMs) * 100);
      if (numEl) numEl.textContent = `${remainSec.toFixed(1)}s`;
      if (progBar) progBar.style.width = `${pct}%`;

      capCtx.drawImage(mainCanvas, 0, 0, gifW, gifH);
      frames.push(capCtx.getImageData(0, 0, gifW, gifH).data);

      if (frames.length >= totalFrames || elapsed >= totalDurationMs) {
        clearInterval(timer);
        resolve();
      }
    }, intervalMs);
  });

  if (labelEl) labelEl.textContent = "ENCODING GIF...";
  if (numEl) numEl.textContent = "⚡";
  if (progTrack) progTrack.style.display = "none";

  // Allow UI to paint before encoding GIF
  await new Promise((r) => setTimeout(r, 25));

  const gifBlob = encodeAnimatedGIF(frames, gifW, gifH, Math.round(100 / fps));

  if (overlay) overlay.classList.remove("visible");
  captureBusy = false;
  isRecording = false;
  if (recBtn) {
    recBtn.classList.remove("recording");
    recBtn.innerHTML = `<span>●</span><span class="dock-btn-text">Rec GIF</span>`;
  }

  const filename = `thermal-${state.mode}-${Date.now()}.gif`;
  showToast("Captured 3s GIF! Scan QR on bottom right or click Save.");
  presentCaptureWithQR(gifBlob, filename, "3S ANIMATED GIF");
}

function stopVideoRecording() {
  isRecording = false;
}

function requestRender() {
  buildLUT();
  if (webcamFrozen && webcamActive) {
    renderWebcamFrame();
  }
}

function showToast(msg) {
  const toast = document.getElementById("statusToast");
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add("visible");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.remove("visible"), 2600);
}

function toggleControlsPanel(forceCollapsed) {
  const isCollapsed = typeof forceCollapsed === "boolean"
    ? forceCollapsed
    : !document.body.classList.contains("controls-collapsed");
  document.body.classList.toggle("controls-collapsed", isCollapsed);
  const toggleBtn = document.getElementById("toggleControlsBtn");
  const chevron = document.getElementById("pullupChevron");
  if (toggleBtn) {
    toggleBtn.classList.toggle("active", !isCollapsed);
    toggleBtn.setAttribute("aria-expanded", String(!isCollapsed));
  }
  if (chevron) {
    chevron.textContent = isCollapsed ? "▴" : "▾";
  }
  requestAnimationFrame(() => {
    drawPalettePreview();
  });
}

// Bind UI Controls
function initControls() {
  document.getElementById("retryWebcamBtn").addEventListener("click", () => {
    startWebcam(cameraFacing);
  });

  // Pull-Up Controls Panel Toggle (Bottom Dock Button + Drawer Hide Button)
  const toggleControlsBtn = document.getElementById("toggleControlsBtn");
  if (toggleControlsBtn) {
    toggleControlsBtn.addEventListener("click", () => toggleControlsPanel());
  }
  const collapseMobileBtn = document.getElementById("collapseSidebarMobileBtn");
  if (collapseMobileBtn) {
    collapseMobileBtn.addEventListener("click", () => toggleControlsPanel(true));
  }

  // Clicking the live Crowd Temp Pill pulls up the drawer focused on Crowd Heat
  const crowdTempPill = document.getElementById("crowdTempPill");
  if (crowdTempPill) {
    crowdTempPill.addEventListener("click", () => {
      const wasCollapsed = document.body.classList.contains("controls-collapsed");
      if (wasCollapsed) {
        toggleControlsPanel(false);
      }
      const crowdTab = document.querySelector('#mobileSectionTabs .sec-tab[data-sec="crowd"]');
      if (crowdTab) crowdTab.click();
    });
  }

  // Click on the CRT video canvas when drawer is open collapses the drawer cleanly
  const singleViewWrapper = document.getElementById("singleViewWrapper");
  if (singleViewWrapper) {
    singleViewWrapper.addEventListener("click", (e) => {
      if (e.target === mainCanvas && !document.body.classList.contains("controls-collapsed")) {
        toggleControlsPanel(true);
      }
    });
  }

  // Drawer Category Filter Tabs (All | Crowd Heat | Palette | Field | Style | Optics | Camera)
  const mobileSectionTabs = document.getElementById("mobileSectionTabs");
  if (mobileSectionTabs) {
    mobileSectionTabs.querySelectorAll(".sec-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        mobileSectionTabs.querySelectorAll(".sec-tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        const targetSec = tab.dataset.sec;
        document.querySelectorAll("#controlsSidebar .control-section").forEach((sec) => {
          const match = targetSec === "all" || sec.dataset.section === targetSec;
          sec.classList.toggle("mobile-filtered-out", !match);
        });
      });
    });
  }

  // Crowd Override Pills (Auto | 0 | 1 | 2 | 3 | 4+)
  document.querySelectorAll("#crowdOverridePills .pill-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#crowdOverridePills .pill-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const val = btn.dataset.crowd;
      state.crowdOverride = val === "auto" ? "auto" : parseInt(val, 10);
      const simLabel = document.getElementById("crowdSimLabel");
      if (simLabel) {
        simLabel.textContent = val === "auto" ? "Auto AI" : `Simulated (${val === "4" ? "4+" : val})`;
      }
      requestRender();
    });
  });

  // Webcam Flip Camera button (Front <-> Back)
  const flipCameraBtn = document.getElementById("flipCameraBtn");
  if (flipCameraBtn) {
    flipCameraBtn.addEventListener("click", () => {
      const nextFacing = cameraFacing === "user" ? "environment" : "user";
      if (nextFacing === "user" && cameraZoom < 1) {
        cameraZoom = 1;
      }
      startWebcam(nextFacing);
    });
  }

  // Webcam Zoom Pills (.5x | 1x | 2x | 3x)
  document.querySelectorAll("#cameraZoomGroup .zoom-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      const z = parseFloat(btn.dataset.zoom) || 1;
      applyTrackOrDigitalZoom(z);
    });
  });

  // Camera stream settings inside drawer
  document.getElementById("cameraDeviceSelect").addEventListener("change", (e) => {
    startWebcam(e.target.value);
  });

  document.getElementById("webcamResSelect").addEventListener("change", (e) => {
    webcamTargetHeight = parseInt(e.target.value, 10) || 640;
    smoothTelemetry.initialized = false;
  });

  document.getElementById("mirrorWebcam").addEventListener("change", (e) => {
    mirrorWebcam = e.target.checked;
    if (webcamFrozen && webcamActive) {
      renderWebcamFrame();
    }
  });

  // Bottom Dock Capture Actions
  document.getElementById("freezeWebcamBtn").addEventListener("click", () => {
    webcamFrozen = !webcamFrozen;
    updateFreezeBtnUI();
    showToast(webcamFrozen ? "Frame frozen — pull up Controls to tune" : "Resumed live thermal stream");
  });

  document.getElementById("snapshotWebcamBtn").addEventListener("click", () => {
    startDelayedSnapshotPNG();
  });

  document.getElementById("recordWebcamBtn").addEventListener("click", () => {
    startDelayedGifRecording();
  });

  const closeQrBtn = document.getElementById("closeQrCardBtn");
  if (closeQrBtn) {
    closeQrBtn.addEventListener("click", () => {
      const card = document.getElementById("captureQrCard");
      if (card) card.classList.remove("visible");
    });
  }

  // Mode Cards (Options 1 - 4) in Bottom Dock
  document.querySelectorAll(".mode-card").forEach((card) => {
    card.addEventListener("click", () => {
      document.querySelectorAll(".mode-card").forEach((c) => c.classList.remove("active"));
      card.classList.add("active");
      state.mode = card.dataset.mode;
      state.showHud = state.mode === "layered";
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
    { id: "crowdMaxPeople", valId: "crowdMaxPeopleVal", fmt: (v) => `${v} People` },
    { id: "crowdIntensity", valId: "crowdIntensityVal", fmt: (v) => Number(v).toFixed(2) },
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
    if (!el || !valEl) return;
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

  ["crowdHeatEnabled", "invertThermal", "autoNormalize", "showHud"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("change", (e) => {
      state[id] = e.target.checked;
      requestRender();
    });
  });

  // Reset button
  document.getElementById("resetParamsBtn").addEventListener("click", () => {
    const keepMode = state.mode;
    state = { ...DEFAULT_STATE, mode: keepMode };
    document.getElementById("paletteSelect").value = state.palette;
    sliders.forEach(({ id, valId, fmt }) => {
      const el = document.getElementById(id);
      if (el) {
        el.value = state[id];
        document.getElementById(valId).textContent = fmt(state[id]);
      }
    });
    ["crowdHeatEnabled", "invertThermal", "autoNormalize", "showHud"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.checked = state[id];
    });
    document.querySelectorAll("#crowdOverridePills .pill-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.crowd === "auto");
    });
    const simLabel = document.getElementById("crowdSimLabel");
    if (simLabel) simLabel.textContent = "Auto AI";
    requestRender();
    showToast("Parameters reset to default");
  });

  // Hold for Original (Mouse + Touch / Pointer support)
  const holdBtn = document.getElementById("holdOriginalBtn");
  const startHold = (e) => {
    if (e && e.cancelable && e.type.startsWith("touch")) e.preventDefault();
    isHoldingOriginal = true;
    holdBtn.classList.add("active");
    requestRender();
  };
  const endHold = () => {
    if (!isHoldingOriginal) return;
    isHoldingOriginal = false;
    holdBtn.classList.remove("active");
    requestRender();
  };
  holdBtn.addEventListener("mousedown", startHold);
  holdBtn.addEventListener("touchstart", startHold, { passive: false });
  window.addEventListener("mouseup", endHold);
  window.addEventListener("touchend", endHold);
  window.addEventListener("touchcancel", endHold);

  // Keyboard shortcuts
  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
    if (["1", "2", "3", "4"].includes(e.key)) {
      const modes = ["thermal", "topo", "generative", "layered"];
      const card = document.querySelector(`.mode-card[data-mode="${modes[parseInt(e.key, 10) - 1]}"]`);
      if (card) card.click();
    } else if (e.code === "Space") {
      e.preventDefault();
      document.getElementById("freezeWebcamBtn").click();
    } else if (e.key === "Escape" && !document.body.classList.contains("controls-collapsed")) {
      toggleControlsPanel(true);
    }
  });
}

// Initialize app
function init() {
  initControls();
  buildLUT();
  initPeopleDetectors();
  startWebcam(cameraFacing);
}

init();
