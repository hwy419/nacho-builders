import { build } from 'velite'

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  swcMinify: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    serverActions: {
      enabled: true
    },
    serverComponentsExternalPackages: ['ioredis', 'ws'],
    instrumentationHook: true,
  },
  images: {
    domains: ['localhost']
  },
  webpack: (config, { isServer }) => {
    // Handle WASM files for Cardano serialization library
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    }

    // Don't bundle native Node.js modules on the server
    if (isServer) {
      config.externals = config.externals || []
      config.externals.push({
        '@emurgo/cardano-serialization-lib-nodejs': 'commonjs @emurgo/cardano-serialization-lib-nodejs',
      })
    }

    // Velite integration - build content during webpack compilation
    config.plugins.push(new VeliteWebpackPlugin())

    return config
  },
};

class VeliteWebpackPlugin {
  static started = false
  apply(/** @type {import('webpack').Compiler} */ compiler) {
    // Run Velite build before compilation starts
    compiler.hooks.beforeCompile.tapPromise('VeliteWebpackPlugin', async () => {
      if (VeliteWebpackPlugin.started) return
      VeliteWebpackPlugin.started = true
      const dev = compiler.options.mode === 'development'
      await build({ watch: dev, clean: !dev })
    })
  }
}

export default nextConfig;



