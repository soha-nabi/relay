import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Allow images from any hostname (for avatars / chart assets)
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
  // Proxy API calls in dev so the browser never hits CORS issues
  async rewrites() {
    const apiBase =
      process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://relay-recovery.onrender.com';
    return [
      {
        source: '/api/backend/:path*',
        destination: `${apiBase}/:path*`,
      },
    ];
  },
};

export default nextConfig;
