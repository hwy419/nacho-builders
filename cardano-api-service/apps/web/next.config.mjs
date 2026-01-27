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
    serverComponentsExternalPackages: [
      'ioredis',
      'ws',
      '@emurgo/cardano-serialization-lib-nodejs',
      '@meshsdk/core',
    ],
    instrumentationHook: true,
  },
  // Include WASM files in standalone output
  outputFileTracingIncludes: {
    '/api/trpc/[trpc]': ['./node_modules/@emurgo/**/*.wasm', './node_modules/@meshsdk/**/*.wasm'],
    '/api/**/*': ['./node_modules/@emurgo/**/*.wasm', './node_modules/@meshsdk/**/*.wasm'],
  },
  images: {
    domains: ['localhost']
  },
  webpack: (config, { isServer, webpack }) => {
    // Handle WASM files for Cardano serialization library
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    }

    // Add rule to handle WASM files
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'asset/resource',
    })

    // Don't bundle native Node.js modules on the server
    if (isServer) {
      config.externals = config.externals || []
      config.externals.push({
        '@emurgo/cardano-serialization-lib-nodejs': 'commonjs @emurgo/cardano-serialization-lib-nodejs',
      })

      // Ignore WASM file imports on server - use the nodejs version instead
      config.plugins.push(
        new webpack.IgnorePlugin({
          resourceRegExp: /cardano_serialization_lib_bg\.wasm$/,
        })
      )
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



