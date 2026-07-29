---
name: writing-parkinglot-content
description: Creates, revises, restructures, audits, and graduates Verivolt Parkinglot content using reader centered architecture, evidence discipline, deliberate diagrams, and scaled adversarial STORM review. Use for Parkinglot READMEs, research notes, project documentation, reports, decision material, manuals, guides, presentations, navigation, or substantial updates that must be understandable, grounded, and shareable.
---

# Write Parkinglot content

Treat Parkinglot as a human navigation and decision surface, not an agent output archive. Preserve useful depth through progressive disclosure while keeping each front page concise and navigable.

## Nonnegotiable boundaries

1. Read the live repository standard at `parkinglot/_meta/entry-writing-standard.md` before creating or materially changing content. It remains canonical.
2. Search for related entries before creating anything.
3. Read the nearest parent `README.md` before choosing structure or location.
4. Use the smallest useful location. Personal work belongs under `people/<human>/`. Shared work belongs under `shared/<topic>/` only when its audience and sensitivity permit it.
5. Never place Level 4 restricted content, secrets, credentials, raw chat dumps, or machine local paths in Parkinglot.
6. Do not use Parkinglot as a daily diary, routine status log, or same day completed work list.
7. Do not commit or push unless the human has authorized it under the applicable repository rules.
8. Do not recreate prior work from memory. Retrieve and inspect the original artifact.
9. When revising, preserve approved structure, content, and visual language outside the requested scope.
10. Do not describe content as final, approved, released, compliant, or ready merely because it builds.

## Workflow overview

1. Classify the assignment and its stakes.
2. Inspect existing context and evidence.
3. Select a scaled STORM mode.
4. Challenge the narrative before drafting.
5. Design the information architecture.
6. Draft with the correct specialist workflow.
7. Attack the completed artifact.
8. Repair, retest, and account for residual risk.
9. Validate the actual output and navigation.
10. Report the result plainly.

### Trivial correction fast path

For a typo, date correction, broken link repair, or one field update with no change to meaning, scope, structure, evidence, or audience:

1. Confirm the exact artifact.
2. Read the entry and nearest parent README.
3. Make only the requested correction.
4. Run the deterministic audit.
5. Inspect the changed rendering when the correction affects layout.
6. Report the result.

Skip STORM and the full adversarial checklist for this fast path. Escalate to the full workflow when the change affects a claim, decision, owner, authorization, safety instruction, structure, or publication status.

## 1. Classify the assignment

Determine:

1. Reader and reader objective.
2. Content type.
3. New creation, correction, revision, restructure, audit, or graduation.
4. Sensitivity and allowed audience.
5. Decision owner, operational owner, contributors, and reviewers.
6. Consequences if the content is wrong or misunderstood.
7. Evidence available and evidence missing.
8. Correct Parkinglot destination.
9. Required specialist skills.

Read `references/content-type-routing.md` when the content type, audience, or specialist route is not obvious. If the content is an electronic equipment manual, operational guide, quick start guide, installation procedure, troubleshooting procedure, pinout, safety instruction, or bilingual hardware guide, invoke `authoring-electronic-equipment-manuals` before selecting architecture or drafting.

## 2. Inspect existing context

Before drafting:

1. Search filenames and content for the topic and likely synonyms.
2. Read the closest navigation README and relevant linked pages.
3. Inspect original source documents and existing rendered artifacts.
4. Identify approved content that must remain unchanged.
5. Separate genuine gaps from information that already exists.
6. Record the artifact version, source date, and review boundary.
7. Identify conflicts between sources instead of silently choosing one.

If the intended artifact or source cannot be identified confidently, ask one focused question before editing.

Before continuing, cross-check the live standard for requirements that vary by entry type. At minimum verify artifact disambiguation, required metadata values, explicit diagram decision, engineering context when applicable, material change log, navigation update, and graduation destination.

## 3. Select the STORM mode

Invoke `researching-with-storm` for substantial research, critique, audit, strategy, decision material, manuals, or high consequence content. Use the following scale.

### Light

Use for narrow, low consequence notes and small README improvements.

Require:

1. Novice or outsider review.
2. Hostile skeptic review.
3. Evidence audit.
4. One falsification attempt.
5. Explicit gaps and confidence limits.

When parallel reviewers are unavailable, label sequential role simulation as correlated self review. It is acceptable for Light mode when disclosed, but it does not satisfy the independence gate for Standard or Deep work.

### Standard

Use for substantial research, project structures, operational processes, reports, and decision material.

Require:

1. At least five independent perspectives.
2. Thesis, antithesis, and synthesis.
3. Claim, assumption, contradiction, and missing evidence ledgers.
4. Artifact attack after drafting.
5. Repair and retest.
6. Coverage accounting.

### Deep

Use for manuals, safety relevant procedures, external publication, financial recommendations, strategic investments, compliance adjacent analysis, and high consequence technical decisions.

Require:

1. All applicable specialist perspectives.
2. Execution, reproduction, rendering, or measurement where possible.
3. Broad critique coverage.
4. Independent repair challenge and retest.
5. Explicit publication blockers and residual risks.

Do not run a deep process for a trivial correction. Do not call a light process comprehensive. Read `references/adversarial-review-contract.md` for roles, ledgers, findings, gates, and integration with the STORM skill.

## 4. Challenge the narrative before drafting

For Standard and Deep work, do not begin with polished prose.

1. State the emerging thesis.
2. Define what would falsify it.
3. Identify dominant assumptions and likely source bias.
4. Create independent attack perspectives.
5. Build the strongest supported antithesis.
6. Record supporting, refuting, conflicting, and missing evidence.
7. Produce a synthesis that preserves real disagreement and uncertainty.
8. Let the synthesis determine the outline.

Presentation quality must never increase claim certainty. Classify important claims as confirmed, observed, inferred, hypothetical, illustrative, open, conflicting, proposed, or approved. This claim class is separate from the entry level `Confidence` field, which must use the values defined by the live Parkinglot standard.

## 5. Design the information architecture

Choose among:

1. One compact entry for one clear content job.
2. A concise front README with linked topic pages for several reader questions.
3. A decision page with alternatives, evidence, and authority boundaries.
4. A report with supporting evidence and appendices.
5. An operational guide or manual.
6. A project front door with workstream routes.
7. A graduated pointer page to the canonical destination.

Use progressive disclosure. The front page should let a reader understand the subject within a few minutes, then route to deeper evidence.

Split a README when it contains several distinct reader questions, unrelated content jobs, large calculations, detailed test evidence, lengthy alternatives, or historical material that obscures the current decision.

Read `references/front-door-patterns.md` before creating or restructuring a project README. Use `assets/compact-entry-template.md` or `assets/project-front-door-template.md` as a starting point, then verify required fields against the live standard.

## 6. Draft for the actual reader

1. Lead with what is true, why it matters, and what happens next.
2. Organize by reader question, decision, workflow, or lifecycle, not research chronology.
3. Define unfamiliar terms at first use.
4. Distinguish confirmed facts, assumptions, alternatives, and open questions.
5. Name owners and authority accurately. Do not broaden scope through polished wording.
6. Use realistic anonymized examples when examples improve application.
7. Label illustrative values clearly.
8. Link material claims to named evidence.
9. Keep internal engineering diary language out of customer and user material.
10. Preserve important contradictions rather than polishing them away.

Use diagrams only when they clarify workflow, architecture, decision logic, ownership, lifecycle, alternatives, dependencies, or navigation. Every diagram must answer a reader question. Render and inspect it.

For GitHub rendered Mermaid navigation, use the explicit GitHub `https://` file or directory URL format required by the live standard. Do not use relative Markdown click targets. Use semantic colors and shapes when they convey stable meaning, and explain that meaning.

For an electronic equipment manual, quick start guide, installation procedure, troubleshooting guide, pinout, safety instruction, or bilingual hardware guide, invoke `authoring-electronic-equipment-manuals`. Do not duplicate its task, safety, technical validation, translation, or publication gates here.

For deep public or internal research, use `researching-with-storm` as the primary evidence and critique workflow.

## 7. Attack the completed artifact

Run independent initial reviews before reviewers see one another's conclusions. At minimum test:

1. Cold start comprehension and navigation.
2. Domain correctness.
3. Evidence, source independence, and confidence calibration.
4. Scope, authority, ownership, and operational completeness.
5. Failure, edge, misuse, maintenance, and lifecycle conditions.
6. Simplicity, deletion opportunities, and unnecessary structure.
7. Sensitivity, audience leakage, accessibility, and localization where applicable.
8. Visual and rendered output quality.

Every material finding must identify exact evidence, affected reader, trigger, failure path, impact, root cause, smallest effective repair, and verification method.

Do not open an audit with praise. Do not soften a defect to sound balanced.

## 8. Repair and retest

For every blocking finding:

1. Establish the original failure.
2. Apply the smallest effective repair.
3. Run targeted, negative, boundary, regression, and operational checks as applicable.
4. Attach or record after state evidence.
5. Reinvoke the relevant independent attack perspective.
6. Keep unresolved risk visible.

Do not close a finding because prose changed or a build passed. Close it only when its verification condition passes.

## 9. Validate the actual output

Before reporting completion:

1. From the skill directory, run `python scripts/audit_parkinglot_content.py <parkinglot-entry-path> --entry --strict` against the Parkinglot file or directory, not against the skill directory.
2. Check internal links and navigation routes.
3. Render diagrams.
4. Build generated artifacts.
5. Open the actual outputs.
6. Inspect every changed page, slide, diagram, or major section.
7. Check wrapping, overflow, spacing, hierarchy, contrast, tables, images, warnings, and page breaks.
8. Build and inspect every required audience and language variant.
9. Update the nearest navigation README when the repository structure changed.
10. Account for critique coverage as covered, partial, gap, blocked, or not applicable with reason.
11. Add a dated change log entry when the update is material.
12. For engineering, hardware, firmware, platform, or validation content, include the engineering context required by the live standard.

Read `references/final-review-checklist.md` before completing Standard or Deep work.

Do not commit temporary STORM scaffolds, reviewer transcripts, redundant source notes, or raw attack prompts. Preserve only durable evidence, material contradictions, decision relevant assumptions, unresolved blockers, and findings needed to understand the final content.

## 10. Completion gate

Do not call the work ready when any of these conditions is true:

1. A high severity finding remains undisclosed.
2. A major claim lacks adequate evidence or an uncertainty label.
3. Important scope or authority is ambiguous.
4. An applicable review dimension is unaccounted for.
5. Execution or visual inspection was possible but not performed.
6. The artifact version or destination is uncertain.
7. The review relied only on the author, build success, source inspection, or screenshots.
8. Required product facts for a procedure remain missing.

When blocked, state the exact blocker, affected content, required evidence or decision, and safest current status.

## Reporting contract

Lead with:

1. Repository relative path.
2. What changed.
3. STORM mode and independent perspectives used.
4. Validation and visual checks performed.
5. Repairs completed.
6. Unresolved blockers and residual risks.
7. Existing commit, branch, or package identifier when applicable. This reporting item never grants permission to create a commit or push.

Keep tool plumbing and generated file counts secondary unless requested.
