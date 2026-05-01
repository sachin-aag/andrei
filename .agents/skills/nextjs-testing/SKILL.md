---
name: nextjs-testing
description: Plan, add, configure, and run tests for Next.js App Router projects. Use when the user asks to test code, add tests, choose a testing framework, set up Vitest, Jest, Playwright, Cypress, component tests, integration tests, E2E tests, snapshots, or verify Next.js behavior.
license: MIT
metadata:
  author: project
  version: "1.0.0"
---

# Next.js Testing

Use this skill when adding or improving tests for a Next.js App Router codebase. Follow the project’s existing package manager, scripts, file layout, and conventions before introducing new tools.

Primary reference: [Next.js Testing Guide](https://nextjs.org/docs/app/guides/testing).

## Test Selection

Choose the smallest test type that proves the behavior:

- Unit tests: pure functions, utilities, schema validation, formatting, hooks that can be isolated.
- Component tests: client components, prop-driven rendering, user interactions, accessible states.
- Integration tests: multiple modules working together, server actions plus validation, API route behavior with mocked boundaries.
- E2E tests: full user flows in a browser, routing, forms, auth-like behavior, async Server Components, and anything that depends on real Next.js rendering.
- Snapshot tests: only for stable, intentionally reviewed UI output. Avoid broad snapshots for frequently changing UI.

For async Server Components, prefer E2E coverage over unit tests because React and Next.js testing tools may not fully support async Server Component unit testing.

## Default Tooling

If the repo already has test tooling, extend it. If not:

- Use Vitest for unit and lightweight component tests.
- Use React Testing Library for Client Component behavior tests.
- Use MSW when component or integration tests need realistic network boundaries.
- Use Playwright for E2E tests.
- Use Cypress only when the repo already uses it or the user asks for Cypress.
- Use Jest only when the repo already uses Jest or a dependency strongly expects it.

For this repo, prefer `npm` because `package-lock.json` is present.

## Setup Workflow

1. Inspect `package.json`, lockfiles, existing test config, and existing `*.test.*`, `*.spec.*`, or `e2e` files.
2. Add only the missing test tooling needed for the requested coverage.
3. Add scripts with conventional names:
   - `test` for unit/component tests.
   - `test:watch` for watch mode when supported.
   - `test:coverage` when coverage reporting is configured.
   - `test:e2e` for Playwright or Cypress E2E tests.
4. Keep test files near the code under test unless the repo already uses a central test directory.
5. Run the narrowest useful command first, then broader verification if the change touches shared behavior.

## Test Utilities

Create reusable test helpers when tests need the same setup more than twice:

- Factory functions for database records, authenticated users, scoped resources, and AI responses.
- Mock adapters for external services such as databases, model providers, file parsing, network calls, and time.
- Render helpers that wrap Client Components with required providers.
- Request builders for Route Handler tests.

Keep helpers explicit. Tests should make the scenario readable without hiding the important inputs.

## Writing Tests

Write tests around behavior, not implementation details:

- Assert visible UI, accessible names, route outcomes, returned data, and persisted side effects.
- Mock network, database, AI, file system, and time boundaries in unit/component tests.
- Prefer real browser interaction in E2E tests instead of mocking the feature being verified.
- Cover loading, empty, error, and success states when user-facing UI changes.
- Include at least one regression test for a bug fix when practical.
- For authorization or scoped data, cover unauthenticated access, wrong scope or role, missing resource, and the happy path.

## Next.js App Router Notes

- Server Components are the default; avoid forcing them into client-style component tests.
- Client Components can be tested with a DOM environment and Testing Library when configured.
- Route Handlers can often be tested by constructing `Request` objects and asserting `Response` output.
- Hooks should be tested through the component behavior they enable unless the hook owns substantial standalone logic.
- Server Actions are best covered through integration or E2E tests unless their core logic is extracted into testable pure functions.
- Use E2E tests for routing behavior, browser APIs, hydration-sensitive behavior, and async Server Components.

## Dependency Boundaries

Tests must not touch production services:

- Use local, test, or mocked databases only.
- Never use production API keys, AI provider credentials, storage buckets, or webhooks in tests.
- Prefer deterministic fixtures over live external calls.
- Use E2E tests against a local dev server or disposable preview environment.

## Verification

After adding tests or test config:

- Run the new test command.
- Use watch mode while iterating locally, then run the non-watch command before reporting completion.
- Run coverage when adding shared business logic, regression tests, or test infrastructure.
- Run `npm run typecheck` when TypeScript config or typed tests changed.
- Run lint only if the repo has a working lint script.
- If a dev server is required for E2E tests, reuse an existing server if one is already running; otherwise start it once and verify the browser flow.

When reporting results, include what was tested, the exact commands run, and any remaining gaps.
