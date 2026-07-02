import type { ElectrobunConfig } from 'electrobun'

export default {
  app: {
    name: 'Proxima',
    identifier: 'sh.proxima.app',
    version: '0.0.1-pre-alpha',
  },
  build: {
    bun: {
      entrypoint: 'src/bun/index.ts',
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
