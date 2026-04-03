import type { LoaderFunctionArgs } from '@remix-run/node';

// Well-known browser/tool probes that should not pollute logs
const SILENT_PROBES = [
  '/.well-known/',
  '/apple-app-site-association',
  '/.git',
  '/robots.txt',
  '/sitemap.xml',
];

export function loader(args: LoaderFunctionArgs) {
  const url = new URL(args.request.url);
  const pathname = url.pathname;

  // Silently ignore well-known probes (Chrome DevTools, SEO crawlers, etc.)
  const isSilentProbe = SILENT_PROBES.some(probe => pathname.startsWith(probe));

  if (!isSilentProbe) {
    console.warn(`⚠️ No route matches URL "${pathname}"`);
  }

  throw new Response(null, { status: 204 });
}

export default function CatchAll() {
  return null;
}
