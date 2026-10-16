// The site's canonical origin, for metadata, the sitemap and robots.txt. An explicit
// NEXT_PUBLIC_SITE_URL wins; on Vercel the project's production domain is filled in
// automatically; locally it's the dev server.
const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;

// `||`, not `??`: an empty `NEXT_PUBLIC_SITE_URL=` line in .env must fall back too
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.trim() || (vercel ? `https://${vercel}` : "http://localhost:3000");
