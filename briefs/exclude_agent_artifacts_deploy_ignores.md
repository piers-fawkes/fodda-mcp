# Brief: Exclude .claude, .gemini, and scratch from .dockerignore and .gcloudignore

## Context
AI coding agents generate local worktrees and tool scratch caches (e.g. `.claude/worktrees`). In `Fodda MCP`, neither `.dockerignore` nor `.gcloudignore` exclude `.claude`, `.gemini`, `.agents`, `.secrets`, or `scratch`, causing Docker build context and Cloud Build uploads to bloat with agent worktrees and scratch files.

## What to build
1. In `.dockerignore`, add:
   - `.claude`
   - `.gemini`
   - `.agents`
   - `.agent`
   - `.secrets`
   - `scratch`
2. In `.gcloudignore`, add:
   - `.claude`
   - `.gemini`
   - `.agents`
   - `.agent`
   - `.secrets`
   - `scratch`
3. Verify that docker and gcloud ignore rules cleanly exclude agent directories.

## Where to register
- Update `CHANGELOG.md` in Fodda MCP.

## Definition of Done
- Docker build context and gcloud upload list exclude agent worktrees and cache.
- Packaging size is kept under 5 MB.

## Do Not
- Do not modify tool schemas, `toolHandlers.ts`, or manifest configurations.

## Files Expected to Change
- `.dockerignore`
- `.gcloudignore`
- `CHANGELOG.md`
