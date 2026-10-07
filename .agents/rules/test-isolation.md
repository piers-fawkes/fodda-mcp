# Rule — Test Isolation & Build Cleanliness

> Enforced in `Fodda MCP`. Test files must NEVER break production builds, leak into `dist/`, or execute external network side effects during automated test runs.

## 1. Zero Test Pollution in Production Artifacts
- **Test files must never compile into `dist/`:** `tsconfig.json` MUST explicitly exclude `"src/test_*.ts"` and `"src/**/test_*.ts"`.
- Production tarballs (npm package `fodda-mcp`) and Docker images (Glama, Cloud Run) must contain strictly server runtime code.
- If a test script has a loose type or imports an ad-hoc module, it must NEVER fail the production `tsc` build or Docker build.
- `dist/` should never contain `test_*.js`, `test_*.d.ts`, or test source maps.

## 2. Running Tests
- Developer tests can be run standalone anytime via:
  ```bash
  npx tsx src/test_<name>.ts
  # or
  npx ts-node src/test_<name>.ts
  ```
- Any new test file created in `src/` must strictly follow the `src/test_*.ts` prefix so it is excluded from `tsconfig.json`. Prefer `test/` or `scratch/` for one-off scripts.

## 3. Test Webhook & Side-Effect Isolation
- Test scripts must NEVER trigger live outbound marketing/sales webhooks (e.g. `sendOnRequestDemandWebhook` to Fodda Sales intent webhooks).
- Always guard test callers with `isTestCaller` check:
  - `effectiveUser.startsWith('test_')` or `callerIdentity.startsWith('test_')`
  - `process.env.NODE_ENV === 'test'`
