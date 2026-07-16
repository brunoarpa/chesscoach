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
  description: string;
  date: string;
  keywords: string[];
}

export interface Post extends PostMeta {
  html: string;
}

interface FrontMatter {
  title?: string;
  slug?: string;
  description?: string;
  date?: string;
  keywords?: string[];
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
  return {
    slug: data.slug || fileName.replace(/\.md$/, ""),
    title: data.title || fileName.replace(/\.md$/, ""),
    description: data.description || "",
    date: data.date ? String(data.date) : "",
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
