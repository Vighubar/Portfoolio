import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const about = defineCollection({
  loader: glob({ pattern: "*.md", base: "src/content/about" }),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      title: z.string(),
      avatar: image(),
      contact: z.object({
        email: z.string().email(),
        phone: z.string().optional(),
      }),
      socials: z.array(
        z.object({
          platform: z.string(),
          url: z.string().url(),
        })
      ),
      skills: z.array(z.string()),
      education: z.array(
        z.object({
          institution: z.string(),
          degree: z.string(),
          startYear: z.number(),
          endYear: z.number().optional(),
        })
      ),
      experience: z
        .array(
          z.object({
            company: z.string(),
            role: z.string(),
            startYear: z.number(),
            endYear: z.number().optional(),
          })
        )
        .optional(),
    }),
});

const projects = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "src/content/projects" }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
      coverImage: image(),
      gallery: z
        .array(
          z.object({
            image: image(),
            alt: z.string(),
            caption: z.string().optional(),
          })
        )
        .optional(),
      tags: z.array(z.string()),
      tools: z.array(z.string()),
      role: z.string(),
      timeline: z.object({
        startDate: z.coerce.date(),
        endDate: z.coerce.date().optional(),
      }),
      problem: z.string(),
      solution: z.string(),
      outcome: z.string(),
      links: z
        .array(
          z.object({
            label: z.string(),
            url: z.string().url(),
          })
        )
        .optional(),
      featured: z.boolean().default(false),
      sortOrder: z.number().optional(),
      publishedAt: z.coerce.date(),
    }),
});

export const collections = { about, projects };
