/** One-level delegation never broadens the parent's exact tool grant. */
export function delegatedToolNames(
  catalog: readonly string[],
  parentAllowed?: readonly string[],
): string[] {
  return catalog.filter(
    (name) =>
      name !== 'Task' && name !== 'Agent' && (!parentAllowed || parentAllowed.includes(name)),
  );
}
