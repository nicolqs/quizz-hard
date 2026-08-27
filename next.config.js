/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
}

// Note: OPENAI_API_KEY is deliberately NOT listed under `env`. That option
// inlines the value at build time wherever `process.env.OPENAI_API_KEY` is
// referenced, client components included, which would publish the key in a
// public JS bundle. The key is only ever read server-side (lib/openai.ts and
// the two generate-* routes), where the runtime env is available directly.

module.exports = nextConfig
