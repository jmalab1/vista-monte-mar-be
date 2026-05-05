# Agent Instructions

Before making changes in this repo, run:

```powershell
context-pack --cwd . --changed-only --no-tree
```

Read `.context-pack/memory.md` before inspecting source files.

Use the memory file as repo orientation, but verify details against current code before editing.

If `.context-pack/memory.md` is older than 7 days and repo development has continued, refresh it with:

```powershell
context-pack --cwd . --refresh-memory
```
