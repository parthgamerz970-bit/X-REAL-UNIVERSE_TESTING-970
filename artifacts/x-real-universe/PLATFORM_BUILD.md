# Offline and cross-platform builds

The web build is self-contained. Vite emits relative asset URLs, the service
worker caches same-origin HTML/CSS/JavaScript/images/audio at runtime, and the
manifest makes the app installable as an offline PWA. There are no runtime CDN
or remote-font dependencies.

## Capacitor (Android and iOS)

Install the Capacitor CLI and platform packages in the app package, then run:

```sh
pnpm run build
pnpm exec cap add android
pnpm exec cap add ios
pnpm exec cap sync
pnpm exec cap open android
pnpm exec cap open ios
```

`capacitor.config.ts` points both platforms at `dist/public`, so the packaged
WebView loads the same offline build. Android Studio and Xcode are required to
produce the final APK and iOS archive.

## Electron (Windows and macOS)

With Electron and electron-builder available in the app package:

```sh
pnpm run build
pnpm exec electron electron/main.cjs
pnpm exec electron-builder --config electron-builder.yml
```

The Electron shell uses `loadFile` and never contacts a remote URL. The
builder configuration produces Windows NSIS installers and macOS DMG files
from the same `dist/public` build.