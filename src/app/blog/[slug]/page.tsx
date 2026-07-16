import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllPosts, getPostBySlug } from "@/lib/blog";
import { SITE_URL } from "@/lib/site";
import { JsonLd } from "@/components/json-ld";

export async function generateStaticParams() {
  const posts = await getAllPosts();
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) return { title: "Post not found" };

  return {
    title: post.title,
    description: post.description,
    keywords: post.keywords,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.description,
      url: `${SITE_URL}/blog/${post.slug}`,
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) notFound();

  const formattedDate = post.date
    ? new Date(post.date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <div className="container mx-auto px-4 py-12 max-w-3xl">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          headline: post.title,
          description: post.description,
          url: `${SITE_URL}/blog/${post.slug}`,
          ...(post.date ? { datePublished: post.date } : {}),
          author: { "@type": "Organization", name: "EloChaser" },
          publisher: { "@type": "Organization", name: "EloChaser" },
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Blog", item: `${SITE_URL}/blog` },
            {
              "@type": "ListItem",
              position: 2,
              name: post.title,
              item: `${SITE_URL}/blog/${post.slug}`,
            },
          ],
        }}
      />
      <Link
        href="/blog"
        className="text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        ← All posts
      </Link>
      <h1 className="mt-4 text-4xl font-bold tracking-tight">{post.title}</h1>
      {formattedDate && (
        <time
          dateTime={post.date}
          className="mt-3 block text-sm text-muted-foreground"
        >
          {formattedDate}
        </time>
      )}
      <div
        className="blog-content mt-8"
        dangerouslySetInnerHTML={{ __html: post.html }}
      />
      <div className="mt-12 rounded-lg border bg-muted/40 p-6">
        <p className="text-lg font-semibold">Ready to work with a coach?</p>
        <p className="mt-1 text-muted-foreground">
          Browse online chess coaches by rating and budget, message them free,
          and get your first lessons free.
        </p>
        <Link
          href="/search"
          className="mt-4 inline-block rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground"
        >
          Find a chess coach
        </Link>
      </div>
    </div>
  );
}
