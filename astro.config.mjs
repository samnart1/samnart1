// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://samnart.website",
  integrations: [sitemap()],
  redirects: {
    "/projects/tolerant": "/writing/tolerant",
  },
  markdown: {
    shikiConfig: { theme: "tokyo-night", wrap: false },
  },
});
