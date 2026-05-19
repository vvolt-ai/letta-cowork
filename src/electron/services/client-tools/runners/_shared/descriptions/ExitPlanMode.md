# ExitPlanMode

Leave plan mode and restore the previous permission mode. Call this when your plan is ready for the user to review.

## When to use this tool

- Your plan file has the final recommended approach
- You've gathered enough context to commit to a path
- You want to surface the plan to the user before executing

## What happens when you call this

1. Your plan-mode restrictions are lifted
2. The plan file content is returned to the caller (the UI / channel adapter shows it to the user)
3. You are restored to your previous permission mode (typically `unrestricted`)
4. Your next message can either ask the user for approval, or just start executing

## Args

- `plan` (optional): an inline plan body. Normally you write to the plan FILE and call ExitPlanMode with no args; this is a fallback for agents that want to inline the plan in the tool call.
