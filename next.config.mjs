/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Ninguém põe o app num iframe (clickjacking), nem o navegador adivinha tipos.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // A volta do banco traz code/state na URL: não vazam para outros sites.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
        ],
      },
    ];
  },
  // Self-hosted prod: emit a minimal standalone server (server.js + traced
  // node_modules) so the Docker runner image stays small. See Dockerfile.
  output: "standalone",
  experimental: {
    // Allow larger file uploads (bank statements/PDFs) to Server Actions/route handlers.
    serverActions: {
      bodySizeLimit: "15mb",
    },
  },
};

export default nextConfig;
