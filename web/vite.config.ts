import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// maplibre-gl v6 loads its worker as a sibling module; Vite's dep optimizer
// breaks that URL in dev, so it must be excluded from pre-bundling.
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ["maplibre-gl"],
  },
});
