# Front door patterns

Use a Parkinglot README as a navigation and decision surface. Do not make it the storage location for every supporting fact.

## One compact entry

Use one file when the subject has one clear reader, one content job, limited evidence, and no substantial alternatives or workstreams.

Recommended order:

1. Summary
2. Why it matters
3. Current state
4. Evidence
5. Actions and blockers
6. Related links

## Project front door

Use a concise README with linked pages when the subject contains several reader questions, workstreams, alternatives, calculations, validation records, or audiences.

Recommended order:

1. One paragraph orientation
2. Current conclusion or decision state
3. Why it matters
4. Decision or question map
5. Navigation by reader question
6. Owners and next action
7. Important uncertainty
8. Source and revision status

## Navigation by question

Prefer routes such as:

1. Understand the opportunity
2. Compare alternatives
3. Review financial assumptions
4. Inspect technical evidence
5. Follow the operating workflow
6. See unresolved decisions
7. Find owners and next actions

Avoid a bare list of filenames unless the filenames are already obvious to the intended reader.

## Split triggers

Move material into linked topic pages when the README includes:

1. Several distinct reader objectives
2. Long calculations or tables
3. Detailed test records
4. Extensive source notes
5. Several alternatives requiring separate analysis
6. Historical context that obscures current state
7. Procedures mixed with conceptual or reference material
8. Several audiences with different permissions or knowledge

Length and heading count are warning signals, not automatic proof that splitting is required.

## Diagram decision

Use a diagram when it reduces explanation of relationships, workflow, architecture, decision logic, ownership, lifecycle, alternatives, dependencies, or navigation.

For every diagram:

1. State the question it answers.
2. Use meaningful labels and semantic visual treatment.
3. Link nodes when Mermaid and the repository renderer support links.
4. Keep labels readable at ordinary viewing size.
5. Render and inspect the actual result.

For GitHub rendered Mermaid, use explicit GitHub `https://` URLs required by the live Parkinglot standard. Do not use relative Markdown click targets. Use semantic colors and shapes when they communicate stable categories, and make their meaning understandable to the reader.

Omit a diagram when prose or a small table is clearer. Decorative diagrams are not a quality signal.

## Successful front door test

A new reader should be able to answer within a few minutes:

1. What is this?
2. Why does it matter?
3. What is known?
4. What is uncertain?
5. What decision or action is next?
6. Who owns it?
7. Where should I go for detail?
