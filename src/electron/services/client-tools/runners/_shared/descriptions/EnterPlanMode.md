# EnterPlanMode

Switch into plan mode — a read-only mode where you research, analyze, and produce a written plan instead of making changes.

## When to use this tool

Enter plan mode when the user asks for any of:
- A plan / approach / design for a complex change
- A research summary they want to review before you act
- An estimate of work without committing to it
- An exploratory analysis

You can also enter plan mode proactively when:
- The task requires modifying many files and you want user buy-in first
- You see risk in the request (data loss, irreversible changes) and want to plan first
- You need to explore extensively before knowing the right approach

## Rules while in plan mode

- READ-ONLY tools are allowed: Read, Glob, Grep, LS, ViewImage, TodoWrite, Skill, BashOutput, TaskOutput
- WRITE tools (Write, Edit, MultiEdit, ApplyPatch) are allowed ONLY targeting your assigned plan file
- Bash is allowed only for read-only commands (ls, cat, grep, git status, etc.)
- Task is NOT allowed — finish your plan first, then exit, then dispatch
- All other tools are blocked

## Workflow

1. Call `EnterPlanMode({})` — you'll receive a plan file path
2. Explore the codebase, read relevant files, take notes via TodoWrite
3. Write your plan to the assigned file (use Write or ApplyPatch with the plan file path)
4. Iterate — update the plan file as you learn more
5. Optionally ask the user clarifying questions
6. Call `ExitPlanMode({})` when the plan is ready for user review

## Example

```
EnterPlanMode({ name: "auth-refactor" })
→ "Plan mode active. Write your plan at /Users/x/.letta/plans/conv-abc/auth-refactor.md ..."

# ...explore, read files, refine...

Write({ file_path: "/Users/x/.letta/plans/conv-abc/auth-refactor.md", content: "# Refactor plan\n..." })

ExitPlanMode({})
→ "Plan mode exited. Restored permission mode: unrestricted. Plan is ready for user review."
```
