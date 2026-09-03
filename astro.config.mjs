// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// Custom domain (CNAME in public/). Repo → domain deploy already wired.
export default defineConfig({
  site: "https://samnart.website",
  integrations: [sitemap()],
});
