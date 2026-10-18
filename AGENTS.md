# TuxScale Project Instructions & Rules

## Package Manager

- **Always use Bun** (`bun`) for installing dependencies, running scripts, and development:
  - Install: `bun install`
  - Dev server: `bun run dev` (or `bun dev`)
  - Build: `bun run build`
  - Typecheck: `bun run typecheck`
  - Lint: `bun run lint`
- **Do not delete `package-lock.json`**; maintain dual compatibility with `npm` while always executing operations via `bun`.
- Always preserve `"trustedDependencies": ["electron", "esbuild"]` and `"overrides": { "strip-ansi": "^6.0.1" }` in `package.json` so Electron lifecycle binaries and CommonJS packages function without issues under Bun.
