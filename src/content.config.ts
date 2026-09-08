import { defineCollection, z } from "astro:content";
import { glob, file } from "astro/loaders";

/* PROFILE - single YAML: hero, socials, availability. */
const profile = defineCollection({
  loader: file("src/content/profile.yaml"),
  schema: z.object({
    name: z.string(),
    role: z.string(),
    tagline: z.string(),
    location: z.string(),
    availability: z.string().optional(),
    cv: z.string().optional(),
    socials: z.array(
      z.object({
        label: z.string(),
        href: z.string().url(),
        icon: z.enum(["github", "mail", "linkedin"]),
      })
    ),
  }),
});

/* ABOUT - one Markdown file, body is the bio prose. */
const about = defineCollection({
  loader: glob({ pattern: "index.md", base: "src/content/about" }),
  schema: z.object({
    heading: z.string().default("about"),
  }),
});

/* EXPERIENCE - one .md per role. order = reverse chronological. */
const experience = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "src/content/experience" }),
  schema: z.object({
    role: z.string(),
    org: z.string(),
    location: z.string().optional(),
    period: z.string(),
    order: z.number(),
    draft: z.boolean().default(false),
  }),
});

/* EDUCATION - location and period are separate fields. */
const education = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "src/content/education" }),
  schema: z.object({
    school: z.string(),
    program: z.string(),
    period: z.string().optional(),
    order: z.number(),
    draft: z.boolean().default(false),
  }),
});

/* PROJECTS - one .md per project. `page` is an internal write-up route. */
const projects = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "src/content/projects" }),
  schema: z.object({
    name: z.string(),
    headline: z.string().optional(),
    stack: z.array(z.string()),
    page: z.string().optional(),
    demo: z.string().url().optional(),
    repo: z.string().url().optional(),
    writeup: z.string().url().optional(),
    appStore: z.string().url().optional(),
    playStore: z.string().url().optional(),
    private: z.boolean().default(false),
    category: z.enum(["systems", "backend", "web", "mobile", "experiments", "collections"]).default("backend"),
    featured: z.boolean().default(false),
    order: z.number(),
    draft: z.boolean().default(false),
  }),
});

/* TECH - flat list, slug resolved to an inlined icon at build time. */
const tech = defineCollection({
  loader: file("src/content/tech.yaml"),
  schema: z.object({
    label: z.string(),
    slug: z.string(),
  }),
});

/* LEARNING — one YAML per language (meta), plus weekly log entries. */
const languages = defineCollection({
  loader: glob({ pattern: "**/_meta.yaml", base: "src/content/learning" }),
  schema: z.object({
    lang: z.string(),           // "German"
    native: z.string(),         // "Deutsch"
    flag: z.string(),           // emoji
    from: z.string(),           // "A0"
    to: z.string(),             // "B1-"
    started: z.string(),        // "Sep 2026"
    accent: z.string(),         // hex
    status: z.enum(["active", "paused", "planned", "done"]).default("planned"),
    order: z.number().default(99),
    tagline: z.string().optional(),
  }),
});

const weeks = defineCollection({
  loader: glob({ pattern: "**/week-*.md", base: "src/content/learning" }),
  schema: z.object({
    lang: z.string(),           // "german" (matches folder)
    week: z.number(),
    dates: z.string().optional(),   // "Sep 1 — 7"
    level: z.string().optional(),   // "pushing into A1"
    emoji: z.string().optional(),   // milestone emoji
    words: z.array(z.string()).default([]),  // new words/phrases
    hours: z.number().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { profile, about, experience, education, projects, tech, languages, weeks };
