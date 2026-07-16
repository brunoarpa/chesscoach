/**
 * Renders a JSON-LD structured-data block. Search engines read this to
 * understand what a page is about (an organisation, a coach, ratings, prices)
 * and can show rich results (star ratings, sitelinks) because of it.
 *
 * The `data` object is trusted, app-generated content, not user input, so
 * serialising it into a script tag is safe here.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
