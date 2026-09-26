/**
 * Security headers.
 *
 * The policy is written against what this application actually does, not against
 * a generic template. MapLibre injects a worker and needs `worker-src blob:`;
 * Next.js needs `'unsafe-inline'` for its own bootstrap script; the map needs
 * its tile and style host; media needs Wikimedia and the YouTube thumbnail CDN;
 * routing needs the two OSRM hosts; and `frame-src` is needed because an
 * experience page embeds a YouTube player in an iframe.
 *
 * The one gap worth naming: `script-src` carries `'unsafe-inline'` because
 * Next.js App Router injects inline bootstrap scripts, and there is no
 * nonce-based rewrite without a server to mint a nonce per request. In exchange,
 * `object-src 'none'` and `frame-ancestors 'none'` are set, and the popup HTML
 * sink that would have made `'unsafe-inline'` dangerous has been removed in
 * favour of `setDOMContent`.
 */
const isDev = process.env.NODE_ENV !== "production";

/**
 * MapLibre's style and tile fetches, the OSRM routing hosts, the Wikimedia
 * image host and the YouTube thumbnail CDN. These four are the only third-party
 * origins the browser ever contacts.
 */
const CONNECT = [
  "'self'",
  "https://routing.openstreetmap.de",
  "https://router.project-osrm.org",
  "https://tiles.openfreemap.org",
  "https://i.ytimg.com",
  "https://commons.wikimedia.org",
].join(" ");

const IMG = [
  "'self'",
  "data:",
  "blob:",
  "https://i.ytimg.com",
  "https://commons.wikimedia.org",
  "https://*.tile.openstreetmap.org",
].join(" ");

/**
 * `unsafe-eval` only outside production. Next.js's dev server needs it for
 * webpack's module evaluation, and shipping it to production would be a real
 * weakening for no benefit.
 */
const SCRIPT = ["'self'", "'unsafe-inline'", isDev ? "'unsafe-eval'" : ""].filter(Boolean).join(" ");

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src ${SCRIPT}`,
  // Tailwind injects a style element and MapLibre sets inline styles on its
  // canvas and controls, so inline style is required.
  "style-src 'self' 'unsafe-inline'",
  `img-src ${IMG}`,
  "media-src 'self' https://i.ytimg.com blob:",
  `connect-src ${CONNECT}`,
  "font-src 'self' data:",
  // An experience page embeds a YouTube player.
  "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self), payment=(), usb=()",
  },
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
