import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";
import { marked } from "marked";

// Blog posts are plain markdown files with frontmatter under /content/blog.
// This keeps publishing to "add a .md file" with no database or CMS.
const BLOG_DIR = join(process.cwd(), "content", "blog");

export interface PostMeta {
  slug: string;
  title: string;
  // Search-result title: keyword-led and short enough to survive Google's ~60
  // char cut once "| EloChaser" is appended. Falls back to title.
  seoTitle: string;
  description: string;
  date: string;
  keywords: string[];
}

export interface Post extends PostMeta {
  html: string;
}

interface FrontMatter {
  title?: string;
  seoTitle?: string;
  slug?: string;
  description?: string;
  // gray-matter/YAML parses an unquoted `2026-07-16` into a Date, not a string.
  date?: string | Date;
  keywords?: string[];
}

// Normalise a frontmatter date to an ISO date string (YYYY-MM-DD) so the
// <time> attribute and JSON-LD datePublished are machine-readable.
function normalizeDate(value: string | Date | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString().slice(0, 10);
}

async function readPostFiles(): Promise<string[]> {
  try {
    const files = await readdir(BLOG_DIR);
    return files.filter((f) => f.endsWith(".md"));
  } catch {
    // No content dir yet: treat as an empty blog rather than crashing the route.
    return [];
  }
}

function toMeta(fileName: string, data: FrontMatter): PostMeta {
  const title = data.title || fileName.replace(/\.md$/, "");
  return {
    slug: data.slug || fileName.replace(/\.md$/, ""),
    title,
    seoTitle: data.seoTitle || title,
    description: data.description || "",
    date: normalizeDate(data.date),
    keywords: data.keywords ?? [],
  };
}

export async function getAllPosts(): Promise<PostMeta[]> {
  const files = await readPostFiles();
  const posts = await Promise.all(
    files.map(async (file) => {
      const raw = await readFile(join(BLOG_DIR, file), "utf8");
      const { data } = matter(raw);
      return toMeta(file, data as FrontMatter);
    })
  );
  // Newest first.
  return posts.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export async function getPostBySlug(slug: string): Promise<Post | null> {
  const files = await readPostFiles();
  for (const file of files) {
    const raw = await readFile(join(BLOG_DIR, file), "utf8");
    const { data, content } = matter(raw);
    const meta = toMeta(file, data as FrontMatter);
    if (meta.slug === slug) {
      // The first "# Heading" is rendered by the page as the <h1>, so strip it
      // from the body to avoid two identical headings.
      const body = content.replace(/^\s*#\s+.*\n/, "");
      const html = await marked.parse(body);
      return { ...meta, html };
    }
  }
  return null;
}
