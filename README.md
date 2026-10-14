# thermal-engine

THERMAL STUDIO: a code-art engine that redraws portraits (still mode) and live webcam footage (real-time mode) as thermal / heat-map style imagery. Plain HTML, CSS and JS with no build step.

## Run

Open `index.html` in a browser (webcam mode needs a secure context, so use `python3 -m http.server` and visit `http://localhost:8000`).

`images-data.js` (a base64 bundle of the sample portraits) is gitignored. Without it the app still runs; use "Add Image" to load your own pictures.

## Layout

- `index.html`, `app.js`, `styles.css`: the app
- `source/`: local-only ingredients (sample portraits), not committed
- `deliverables/`: finals (exported videos/stills), not yet created
