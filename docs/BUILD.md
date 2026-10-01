# How Hushdeck was built

Less than three hours passed between the first brief and a complete, deployed tool. Implementation took about 90 minutes of that. A second session went to documentation and the demo. This page explains the method, because the method matters as much as the tool.

## Roles

I wrote the brief, set the constraints and the plan, made the product decisions, and checked every step by hand. Claude, in chat, helped me break the work down and challenged my choices. Claude Code wrote the code, one step and one commit at a time, following [CLAUDE.md](../CLAUDE.md).

## The plan

The plan has 40 steps in five phases: setup, the pipeline without AI, the AI and review layer, documentation, and the application. Each step has one owner:

- 22 steps for Claude Code: code, tests, deployment.
- 18 steps for me: accounts and settings, the sample deck, the README, and above all verification gates. At each gate I checked the result by hand before anything was built on top of it.

Each phase ended on an exit criterion, written before the work started. For the first build phase it was: "A PDF goes in, a masked PDF comes out, with no text layer, and it is live."

I also set a cut order up front: UI polish goes first, then tests. Three items could not be cut: the verifiable export, the fictional sample deck and the README.

## Riskiest part first

The question was never "can I build a PDF tool". It was "can a browser-only tool anonymize a deck reliably enough to be trusted". I ordered the work so the hardest parts of that question were answered first, at the lowest cost.

1. **Shipping.** The empty app was live on GitHub Pages before any feature existed. Deployment could not become the problem at the end.
2. **Text positions.** Before any detection rule, a debug overlay drew every text box over the rendered page. If the boxes had been off, nothing else would have mattered. They were not.
3. **The export.** The rasterized export was checked with `pdftotext` and `pdfinfo` before any AI was involved. The first milestone was a tool that already worked with rules only.
4. **The model.** The NER model was first tested alone: download size, hosts contacted, latency, raw output. It was wired in only once those numbers were known.

## A sample deck built to break the tool

The test fixture is a fictional 9-page deck designed around failure cases:

- a phone number split over two lines;
- a company name split over two lines;
- an email in the middle of a sentence;
- amounts in French and English notation;
- text baked into a screenshot;
- a logo;
- a document title in the metadata.

Every check ran against it. It ships with the app, so anyone can reproduce them.

## Decisions changed by evidence

The plan was a starting point. These changes came from something observed during the build.

- **The model.** The first choice was a multilingual model. Its license turned out to be non-commercial. I switched to an English model under MIT before any code was written, and accepted the loss of French.
- **Manual areas.** They started as a stretch goal. The debug overlay showed that the sample deck's logo had no text box, so the startup's name would have survived the export. Manual areas moved into the core scope.
- **One row per entity.** The first review panel listed "Claire" and "Claire Dubois" as separate rows. Dropping "Claire" would have leaked the first name where it appears alone. The fix groups every variant under one entity.
- **Character widths.** Claude Code found that boxes estimated by character count left a "$" or a "+" visible. It switched to width-weighted estimates and wider padding. A box may now cover one letter too many, never one too few.
- **Workers and CSP.** Claude Code found that the meta CSP did not apply to workers. Rather than writing an allowlist in code, the workers now start from blob URLs and inherit the page policy. The browser enforces it.

## Verification

- 90 unit tests. Most run against the text actually extracted from the sample deck, including values that must not be detected.
- Every step ended with a check I could run by hand in under a minute.
- Final checks: `pdftotext` prints nothing on the export, `pdfinfo` shows no original metadata, and the full flow works in airplane mode.

## What is not validated

Every hypothesis tested here is technical. None is about demand. I have not yet put Hushdeck in front of founders or investors. So I do not know whether they would use it, at which point in their workflow, or whether the review step is acceptable on a 40-page deck. That is the next test: five founders and five investors, one real deck each, watched rather than surveyed.

## Timeline

| Time (CEST) | Milestone |
|---|---|
| 19:14 | Brief and plan |
| 19:56 | Repository created |
| 20:33 | Empty app live on GitHub Pages |
| 20:41 | Debug overlay live, text positions checked by hand |
| 20:58 | Rasterized export live, checked with pdftotext and pdfinfo |
| 21:09 | NER model tested alone |
| 21:36 | NER, review panel and page CSP live |
| 21:56 | CSP extended to workers, manual areas, sample deck button, error states: feature-complete |

Times are commit and deploy times from git and GitHub, except the brief.
