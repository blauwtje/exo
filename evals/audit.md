# Audit exo

Rapport van de audit. Achteraf gedaan: dependabot toegevoegd (.github/dependabot.yml); `claude plugin validate . --strict` slaagt; GitHub-releases bestaan (v1.1.0 is Latest); userConfig past bij de docs maar `options` vraagt Claude Code v2.1.271 of nieuwer. CODEOWNERS is niet gemaakt, omdat een eigenaarsnaam in een repo-bestand botst met de privacyregel. De rest is niet gerepareerd. Moeite: S = minder dan 30 min, M = tot 2 uur, L = meer.

## Top 5

1. **Agents missen `color` en `<example>`-blokken** (S). Bron: plugin-validator. Bewijs: agents/builder.md:1-8, agents/researcher.md:1-9.
2. **Twee skills zijn handmatig zonder gezien falen** (S). Bron: plugin-validator tegen .claude/CLAUDE.md (Editing). Bewijs: skills/ideas/SKILL.md:4, skills/search/SKILL.md:4. Controleer of een route-eval of verzoek dit dekt.
3. **Geen dependabot en geen CODEOWNERS** (S). Bron: vergelijking met affaan-m/ECC (310k sterren). Bewijs: https://github.com/affaan-m/ECC/tree/main/.github tegenover `ls .github` in exo.
4. **Skill-descriptions van watch en save missen gebruikerszinnen** (S). Bron: skill-reviewer. Bewijs: skills/watch/SKILL.md:3, skills/save/SKILL.md:3.
5. **Workflow-hardening en issue-triage ontbreken** (M). Bron: vergelijking met anthropics/claude-code (157k). Bewijs: https://github.com/anthropics/claude-code/tree/main/.github/workflows (workflow-hardening.yml, claude-issue-triage.yml); exo heeft 2 workflows.

## Plugin, skills, agents, hooks

| Bevinding | Bron | Bewijs | Moeite |
|---|---|---|---|
| Prompt-bestanden staan in de skill-root, niet in references/ (controleer eerst harde paden in tests) | skill-reviewer | skills/build/run-task-prompt.md, skills/diagnose/fixer-prompt.md, skills/diagnose/investigator-prompt.md | S |
| .DS_Store in skillmappen (controleer of getrackt) | skill-reviewer | skills/build/.DS_Store, skills/spec/.DS_Store | S |
| build is de grootste skill (2207 woorden, onder 3000) | skill-reviewer | skills/build/SKILL.md | M |
| Frontmatter niet uniform: model/effort alleen bij watch en diagnose | skill-reviewer | skills/watch/SKILL.md:5-7, skills/diagnose/SKILL.md:5-7 | S |
| docs/ staat in .gitignore maar een bestand is getrackt | plugin-validator | .gitignore, docs/specs/repo-survey-improvements.md | S |
| `claude plugin validate --strict` niet gedraaid in deze audit | plugin-validator | verify/checks/plugin-validate.mjs | S |
| userConfig-schema (options/default bij string) niet bevestigd tegen docs | docs-helper | .claude-plugin/plugin.json:11-26; https://code.claude.com/docs/en/plugins-reference#user-configuration | S |
| `metadata` in skill-frontmatter wordt door Claude Code genegeerd (onschadelijk) | docs-helper | skills/*/SKILL.md; https://code.claude.com/docs/en/skills | S |
| Descriptions beginnen met werkwoord, niet met "This skill should be used when" (bewuste stijl, laag risico) | skill-reviewer | regel 3 van de 5 geteste SKILL.md | S |

Docs-helper vond geen afwijking in frontmatter van skills en agents, hooks.json en de gebruikte manifest-velden; de fetch was deels afgekapt.

## Repo-inrichting tegenover ECC, andrej-karpathy-skills en claude-code

README, CONTRIBUTING, LICENSE, SECURITY, CODE_OF_CONDUCT, CHANGELOG, release-workflow, issue-sjablonen en PR-sjabloon: exo heeft alles. Verschillen:

| Bevinding | Bron | Bewijs | Moeite |
|---|---|---|---|
| Extra issue-sjablonen (install, documentatie) | claude-code, ECC | https://github.com/anthropics/claude-code/tree/main/.github/ISSUE_TEMPLATE; exo heeft 2 yml | S |
| Supply-chain-checks (npmscan, supply-chain-watch) | ECC | https://github.com/affaan-m/ECC/tree/main/.github/workflows | M |
| Echte GitHub-releases niet nagegaan, alleen tags gezien | vergelijking | `gh release list` | S |
| Burst- en spamguards | ECC | pr-burst-guard.yml, issue-submission-guard.yml; waarschijnlijk overkill | L |
| Exo is sterker dan karpathy-skills (geen .github, geen licentie) | vergelijking | https://github.com/multica-ai/andrej-karpathy-skills | geen |
