# Style Guide

- Not defined here. For now, follow the same conventions and patterns that you detect in the surrounding code.

# Environment Guide

- Use `node -e` for scripting tasks, not `python` or `python3`.

# Repo Structure

This directory is a Git repo containing a `npm` workspace:

- The codebase is primarily TypeScript.
- The codebase uses React with Tailwind.


Edits to source files take effect after rebuilding the package via `npm build`.

# Astro Quick Reference

- Use `astro dev` to start the local dev server with HMR. Do not use other web servers (`python -m http.server`, etc.).
- Use `astro build` to create a production build in `dist/`, by default.
- Use `astro preview` to serve the production build locally. Do not use other web servers (`python -m http.server`, etc.).
- Use `astro check` to run type checking and diagnostics.
- Use `astro sync` to generate and update TypeScript types.
- Use `astro add` to install and configure an official integration.
- Fetch **LLM-optimized** docs at https://docs.astro.build/llms.txt.
- Fetch **Full docs** at https://docs.astro.build/ (primary source, use when llms.txt lacks info).
- Use the Astro MCP server to query more in-depth information about Astro.

# `agent-browser`

Use `agent-browser` for web automation or when UI interaction, long-running browsers, or HMR testing is required. Do not use `curl` to test HMR issues.

Use `agent-browser --help` to see all available commands.

Workflow:

1. `agent-browser open <url>` - Navigate to page
2. `agent-browser snapshot -i` - Get interactive elements with refs (@e1, @e2)
3. `agent-browser click @e1` / `fill @e2 "text"` - Interact using refs
4. Re-snapshot after all page changes, navigations, interactions.

Note: `agent-browser` should be installed globally, and is not a dependency of this repo. If `agent-browser` isn't available on this machine, ask the user to run `npm install -g agent-browser && agent-browser install`. If you are running in headless mode with no human operator and need this tool to complete your job, it is best to fail the job vs. trying to work around not having the tool.

# Deep Dives

Detailed reference documents on specific subsystems. Read the relevant section before diving into a bug or feature in that area.


## Vite Dep Optimizer (`optimizeDeps`)

When a bug works in `astro build` but fails in `astro dev` with errors like `require is not defined`, the root cause is almost always Vite's dep optimizer failing to pre-bundle a CJS dependency. `astro build` uses Rollup and handles CJS→ESM reliably; `astro dev` relies on esbuild's optimizer scan, which is intentionally shallow and will miss deps that are only reachable through non-JS files (like `.astro` components in `node_modules`). The key files are `packages/astro/src/vite-plugin-environment/index.ts` (sets `optimizeDeps.entries`) and `packages/astro/src/core/create-vite.ts` (wires up `vitefu`/`crawlFrameworkPkgs`). For a full deep-dive including a debugging playbook and potential fixes, see [`reference/optimize-deps.md`](./reference/optimize-deps.md).
