# Project Notes — lean-ctx-dashboard
> 24 notes | Updated: 6/12/2026

## Safety Rules

- **NEVER** run `git clean -fd` or `git reset --hard` without checking `git log` and verifying commits exist.
- **NEVER** delete untracked files or folders blindly. Always backup or stash before bulk edits.

## Quick Reference
- 24 warnings → see `.agent-mem/gotchas.md`
- 79 conventions → see `.agent-mem/patterns.md`
- Codebase map → see `.agent-mem/project-brief.md`
- Active work → see `.agent-mem/active-context.md`

## Read .agent-mem/gotchas.md before ANY changes

For full memory: `.agent-mem/`
For observation details: `.agent-mem/observations/`

## Available Tools (Use ON-DEMAND only — context in .agent-mem replaces startup calls)
- `sys_core_02(title, content, category)` — Save + auto-detect conflicts
- `sys_core_03(items[])` — Save multiple in 1 call
- `sys_core_01(q)` — Search memory when debugging
- `sys_core_05(query)` — Full-text search for details
- `sys_core_16()` — Check compiler errors after edits
- `sys_core_20(path, start, end)` — Read file sections
- `sys_core_28(pattern, dir)` — Find symbols without loading full files

> Do NOT call sys_core_14() or sys_core_08() at startup — read the .agent-mem files above instead.

---
*Auto-generated*
