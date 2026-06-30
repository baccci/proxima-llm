/// <reference types="vite/client" />

// CSS-only font packages ship no type declarations; declare them so TS 6 accepts
// the side-effect imports in main.tsx (TS2882).
declare module '@fontsource-variable/geist'
declare module '@fontsource-variable/geist-mono'
