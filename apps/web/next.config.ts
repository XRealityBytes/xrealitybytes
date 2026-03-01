import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    externalDir: true,
  },
  transpilePackages: ['@xrb/lab-core'],
  async redirects() {
    return [
      {
        source: '/lab/demos/webgpu-particles',
        destination: '/lab/001-particle-field',
        permanent: false,
      },
      {
        source: '/lab/demos/pointcloud-viewer',
        destination: '/lab',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
