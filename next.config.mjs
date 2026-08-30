/** @type {import('next').NextConfig} */
const nextConfig = {
  // The lead-gen engine in src/ is plain ESM JavaScript shared with the CLI.
  // exceljs and pg are server-only CJS-heavy packages; keep them external.
  serverExternalPackages: ["exceljs", "pg"],
};

export default nextConfig;
