# UpdatePlan

Replace the current plan file's content with the supplied plan body. Available only while in plan mode.

## When to use this tool

Use UpdatePlan as a convenience over `Write({file_path: <plan>, content: ...})` when you want to refresh the entire plan body in one call.

For iterative refinement (changing a section without rewriting the whole plan), use `Edit` against the plan file path instead.

## Args

- `plan` (required): the full plan body. This REPLACES the entire plan file.

## Errors

- "agent is not in plan mode" — call EnterPlanMode first.
- "plan must be a non-empty string" — pass actual content.
