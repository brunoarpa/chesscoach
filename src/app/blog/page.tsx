import type { Metadata } from "next";
import Link from "next/link";
import { getAllPosts } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Chess Improvement Blog - Tips, Guides & Coaching Advice",
  description:
    "Practical guides on improving your chess rating, choosing a coach, openings, endgames and more from the EloChaser team.",
  alternates: { canonical: "/blog" },
};

// Posts are files on disk; rebuild the list at most daily.
export const revalidate = 86400;

export default async function BlogIndexPage() {
  const posts = await getAllPosts();

  return (
    <div className="container mx-auto px-4 py-12 max-w-3xl">
      <h1 className="text-4xl font-bold tracking-tight">Chess Improvement Blog</h1>
      <p className="mt-3 text-lg text-muted-foreground">
        Guides on getting better at chess, choosing a coach, and making your
        practice count.
      </p>

      <div className="mt-10 flex flex-col divide-y">
        {posts.length === 0 && (
          <p className="text-muted-foreground">No posts yet. Check back soon.</p>
        )}
        {posts.map((post) => (
          <article key={post.slug} className="py-6">
            <Link href={`/blog/${post.slug}`} className="group">
              <h2 className="text-2xl font-semibold group-hover:underline">
                {post.title}
              </h2>
              {post.description && (
                <p className="mt-2 text-muted-foreground">{post.description}</p>
              )}
              <span className="mt-3 inline-block text-sm font-medium text-primary">
                Read more →
              </span>
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}
