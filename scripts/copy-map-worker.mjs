// MapLibre's web worker can't be bundled by Turbopack, so serve the installed
// copy from public/. Runs before dev and build to stay in step with the package.
import { copyFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const dist = dirname(require.resolve("maplibre-gl/dist/maplibre-gl.mjs"));
copyFileSync(join(dist, "maplibre-gl-worker.mjs"), new URL("../public/maplibre-gl-worker.mjs", import.meta.url));
