import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";

const config = defineConfig({
  globalCss: {
    "html, body, #root": {
      height: "100%",
    },
    body: {
      bg: "paper",
      color: "ink",
      fontFamily: "body",
    },
  },
  theme: {
    tokens: {
      colors: {
        paper: { value: "#f7f5f2" },
        panel: { value: "#fdfcfa" },
        ink: { value: "#1a1817" },
        inkSecondary: { value: "#52514e" },
        inkMuted: { value: "#898781" },
        hairline: { value: "#e3dfd7" },
        bucketDedicated: { value: "#2a78d6" },
        bucketCountyJail: { value: "#d95926" },
        bucketUsms: { value: "#199e70" },
        bucketFederalPrison: { value: "#4a3aa7" },
      },
      fonts: {
        heading: {
          value: `"Newsreader Variable", Georgia, "Times New Roman", serif`,
        },
        body: {
          value: `"Public Sans Variable", system-ui, -apple-system, "Segoe UI", sans-serif`,
        },
      },
    },
  },
});

export const system = createSystem(defaultConfig, config);
