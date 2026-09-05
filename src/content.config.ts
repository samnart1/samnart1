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
    stack: z.array(z.string()),
    page: z.string().optional(),
    demo: z.string().url().optional(),
    repo: z.string().url().optional(),
    writeup: z.string().url().optional(),
    category: z.enum(["systems", "backend", "web", "experiments", "collections"]).default("backend"),
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

export const collections = { profile, about, experience, education, projects, tech };
