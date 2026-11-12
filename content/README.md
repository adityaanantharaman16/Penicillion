# Medical content and editorial operations

The game uses a private, versioned answer bank. [Inventory and schedule](INVENTORY.md) counts a canonical concept once per prompt. [Top picks](TOP-PICKS.md) gives the 100-point answer, educational fact, source and editorial rationale for each prompt. [Review history](REVIEW.md) records corrections and negative cases. [Source and rights manifest](LICENSES.md) identifies the upstream material.

## Why two correct answers score differently

Editors rank the chance a mixed medical audience will recall a concept **for this wording**. A textbook diagram, mnemonic, instrument tray or familiarity with a subspecialty can make an answer easier to retrieve. Illness prevalence, spelling length, danger and population statistics do not determine the score. A red blood cell and an erythrocyte are the same answer. An astrocyte earns 30 for any human cell and 10 for a central glial cell because glial wording points straight at it. In the instrument prompt, someone picturing an operation is likely to reach first for a scalpel (10). A rongeur (85) calls to mind a bone-cutting task and a particular tool.

The current tier names are Classic (10), Clever (15), Student (30), Resident (60), Specialist (85) and “Are you a doctor?” (100). The public display vocabulary in `web/rarity.js` applies to every run by its awarded points. Published answer records retain their original labels and scores. A small closed set can use fewer tiers. Every prompt has an attainable 100-point answer. The scoring release `recall.1` fixes the points ladder and each content release fixes its assignments. The `reason` is an authored judgment. Counts of observed player selections belong to the statistical system, keyed to the exact prompt release and eligible completed runs.

## Sources and scope

Every family file under `editorial/` contains the player-facing prompt, inclusions/exclusions, eligible descriptor branches or a direct source, then an explicit point value for every selected concept. The curator checks physiology, organism, anatomical location and specificity before selecting a descendant. A MeSH descendant alone can include historical groupings, experimental models or a different species. `tools/build.py` verifies the selected relationship against branches of the pinned release. Exceptions and direct sources have evidence strings that can be checked against the named records. The complete 2026 XML is unnecessary at runtime. The bundled source subset makes normal builds offline and deterministic.

Canonical concepts have opaque `mesh:` descriptor IDs or stable local `pc:` IDs. The same ID can appear under multiple prompts with different scores. `names.tsv` supplies natural labels and safe equivalent forms. `extra-names.tsv` supplies more aliases. The loader only imports a restricted set of equivalent forms from the preferred MeSH concept. Meaning-changing qualifiers, numbers, sites, subtype names and word boundaries survive normalization. A disease name, vaccine, preparation or equipment brand does not automatically inherit its relative's score. The matching service stores exact, excluded and ambiguous forms by prompt version and uses a strictly limited correction pass for long inputs.

`facts.tsv` contains the curated fact overrides, and `gameplay-facts.tsv` adds further term-specific facts. A remaining taxonomic reveal identifies a verified direct parent in the 2026 MeSH index. `cues.tsv` supplies the retrieval context and an individually written rationale for each top pick. `supplements.tsv` supplies original evidence for relationships outside those hierarchical paths. Direct cited references remain on the answer in the browser reveal and in the operator records.

## Draft, validate and publish locally

From the repository root, compile a candidate and inspect the inventory. Python 3 uses only its standard library. Node dependencies and the local PostgreSQL connection are provided by project bootstrap.

```sh
python3 content/tools/build.py --out /tmp/penicillion-candidate.json
node content/validate.mjs /tmp/penicillion-candidate.json
node --test content/test.mjs
```

For a change, reproduce the miss against the published prompt and check its exact scope. Locate primary or authoritative relationship evidence, record source rights, merge synonyms into an existing concept when appropriate, choose a prompt-specific tier, and write a short original fact. Inspect the new verdict and the nearest medical negatives. For every changed top pick, open its source and check the fact as well as the prompt relationship. Pass proposed changes to the independent reviewer. If the reviewer flags a scope, fact or alias, revise the candidate and repeat the check.

After review, compile the selected release and update the server-only ledger. The seed installs its database snapshot and fills empty calendar dates in a single transaction.

```sh
python3 content/tools/build.py
node content/validate.mjs --report
node --test content/test.mjs
npm run migrate
npm run seed
```

The ID includes a digest of the release payload. A repeated compile is byte-identical. Database publication also hashes the actual snapshot and rejects an existing ID with different bytes. The publisher imports the mappings as a draft and marks the release published in one transaction. A completed run, an active run and all existing issued dates retain their original release and ordered slots. An accepted report can therefore first appear after the already-published scheduling horizon. Use a source-controlled, previously reviewed release for a rollback of future inventory. Keep existing issued dates and published rows in place.

### Refreshing the source index

Adding a MeSH term absent from the bundled subset requires the pinned [NLM 2026 descriptor download](https://nlmpubs.nlm.nih.gov/projects/mesh/MESH_FILES/xmlmesh/desc2026.gz). The extractor checks SHA-256 `ccd4d0d33bebfd4c836a59e7dd0c635b1d4e20c4f5a6abc55e2eb0ba4c8716dd` and extracts selected descriptor IDs, direct parents, tree positions and preferred-concept names. A new annual edition needs an explicit source review, a new hash, new attribution and a fresh release.

```sh
python3 content/tools/index_mesh.py /path/to/desc2026.gz
python3 content/tools/build.py --out /tmp/penicillion-candidate.json
node content/validate.mjs /tmp/penicillion-candidate.json
```

## Calendar and inventory fallback

The date argument is an America/New_York civil date. Issue numbering advances once per local calendar day. Schedule arithmetic uses date-only values, while the game computes actual midnight and grace instants using Eastern time, including 23- and 25-hour dates. Two deterministic rotations supply an accessible opener and six following prompts. Families are interleaved across each rotation. Date-aligned regeneration lets a refill resume at any day without changing previously issued choices.

The local seed materializes seven archive days, today and 35 future dates. Running `npm run seed` periodically extends that horizon. Existing dates remain fixed. `daily` inventory is reserved across releases. Practice and Party draw from a permanent `open` pool that contains enough distinct prompts for full games with substantial answer sets. Editions can share a concept under different written scopes. The surgical instrument demonstration uses an open-only prompt.

If there are too few scheduled prompts, the refill fails before changing the calendar. On a release transition it first tries eligible daily substitutes outside the seven-day exclusion window. A shortfall rolls back the transaction. Restore the previous validated release, run the refill again, add verified daily content and check adjacent dates before the next publication. Production requests only read materialized issues. The service can keep serving already-seeded days throughout the correction.

## Missing answers

The recap records an optional private report linked to its actual prompt and release. To inspect and resolve reports locally, run the following commands with the operator database connection. `list` returns at most 50 pending reports. Player text is untrusted and stays out of automatic publishing and public responses. Investigate the proposed concept independently and use the normal release process.

```sh
node server/solo/reports.mjs list
node server/solo/reports.mjs resolve REPORT_ID no-change
node server/solo/reports.mjs resolve REPORT_ID added PUBLISHED_RELEASE_ID
```
