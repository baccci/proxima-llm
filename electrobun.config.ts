import type { BunPlugin } from 'bun'
import type { ElectrobunConfig } from 'electrobun'

// Electrobun's CLI is a precompiled binary carrying its own Bun, and that bundler does not read
// tsconfig paths. So @shared resolves for typecheck and tests but would fail the real build,
// and the alias has to be resolved by hand here. Run `bunx electrobun build` after changing an
// import in src/bun; the other gates cannot see this break.
const sharedAlias: BunPlugin = {
  name: 'shared-alias',
  setup(build) {
    build.onResolve({ filter: /^@shared\// }, (args) => ({
      path: Bun.resolveSync(
        `./${args.path.replace('@shared/', 'src/shared-contracts/')}`,
        __dirname,
      ),
    }))
  },
}

export default {
  app: {
    name: 'Proxima',
    identifier: 'sh.proxima.app',
    version: '0.0.1-pre-alpha',
  },
  build: {
    bun: {
      entrypoint: 'src/bun/index.ts',
      plugins: [sharedAlias],
    },
    copy: {
      'dist/index.html': 'views/mainview/index.html',
      'dist/assets': 'views/mainview/assets',
      'os/macos/native/libTrafficLights.dylib': 'native/libTrafficLights.dylib',
    },
    watchIgnore: ['dist/**'],
    mac: { bundleCEF: false, icons: 'os/macos/icon.iconset' },
    linux: { bundleCEF: false },
    win: { bundleCEF: false },
  },
} satisfies ElectrobunConfig
