import { defineCollection, z } from "astro:content";
import { glob, file } from "astro/loaders";

/* ------------------------------------------------------------
   PROFILE — single YAML: hero + socials + meta.
   file() loader: one object, queried by a fixed id.
   ------------------------------------------------------------ */
const profile = defineCollection({
  loader: file("src/content/profile.yaml"),
  schema: z.object({
    name: z.string(),
    role: z.string(),                    // mono hero sub-line
    affiliations: z.array(z.string()),   // hero card lines
    location: z.string(),
    socials: z.array(
      z.object({
        label: z.string(),
        href: z.string().url(),
        icon: z.enum(["github", "mail", "linkedin"]),
      })
    ),
  }),
});

/* ------------------------------------------------------------
   ABOUT — one Markdown file, body is the bio prose.
   ------------------------------------------------------------ */
const about = defineCollection({
  loader: glob({ pattern: "index.md", base: "src/content/about" }),
  schema: ({ image }) =>
    z.object({
      heading: z.string().default("About"),
      photo: image().optional(),         // optimized at build if present
      photoAlt: z.string().default(""),
    }),
});

/* ------------------------------------------------------------
   EXPERIENCE — one .md per role. order controls display.
   ------------------------------------------------------------ */
const experience = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "src/content/experience" }),
  schema: ({ image }) =>
    z.object({
      role: z.string(),
      org: z.string(),
      location: z.string().optional(),
      period: z.string(),                  // mono, e.g. "Apr 2025 — Aug 2025"
      order: z.number(),                   // lower = earlier in list
      image: image().optional(),           // optional top banner (grayscale)
      draft: z.boolean().default(false),   // hide until confirmed
      // body = description
    }),
});

/* ------------------------------------------------------------
   EDUCATION — one .md per school.
   ------------------------------------------------------------ */
const education = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "src/content/education" }),
  schema: z.object({
    school: z.string(),
    program: z.string(),                 // mono sub-line
    period: z.string().optional(),
    order: z.number(),
    draft: z.boolean().default(false),
  }),
});

/* ------------------------------------------------------------
   PROJECTS — one .md per project. Only shipped ones (draft:false).
   ------------------------------------------------------------ */
const projects = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "src/content/projects" }),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      stack: z.array(z.string()),        // mono tech tags
      demo: z.string().url().optional(),    // live demo (preferred primary)
      repo: z.string().url().optional(),
      writeup: z.string().url().optional(), // build notes / presentation
      href: z.string().url().optional(), // "Open project"
      cover: image().optional(),
      order: z.number(),
      featured: z.boolean().default(true), // featured => card; else text line
      draft: z.boolean().default(false),   // shipped gate
      // body = description
    }),
});

/* ------------------------------------------------------------
   TECH — flat list in one YAML. Icon slug maps to an SVG later.
   ------------------------------------------------------------ */
const tech = defineCollection({
  loader: file("src/content/tech.yaml"),
  schema: z.object({
    label: z.string(),
    slug: z.string(),                    // icon key
  }),
});

export const collections = { profile, about, experience, education, projects, tech };
