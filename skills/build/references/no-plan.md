# No plan

A decided change with no plan file runs these steps, so a small change gets the same proof.

1. **Orient.** Read only the ranges the request names. Otherwise dispatch `exo:researcher` with `Sources: repo`, with the Agent tool's `model: haiku` and `effort: high`, and read only its `Read next` ranges. Upstream decisions are settled.
2. **Decide the route.** An open product decision goes to `exo:spec` first. Count these facts: over two source, test or config files change, a dependency is added, a public signature changes, a persisted format or security boundary is crossed. With none, read the code rules, which every builder reads too, then edit directly, run the check and end on `exo:ship` as in End of the run, so the edit does not sit uncommitted. A test-first request continues at any count.
3. **Workspace.** Settle where the change commits, as in step 1 of The loop. For a multi-file change, confirm a clean working tree or name its changed paths.
4. **Build.** Over 2 files, send each independent part to `exo:builder` in dependency order; otherwise read the same code rules and edit in dependency order.
5. **Prove.** Done needs a `Proof: <command> -> <output>` line from a real call on input this session did not write; otherwise write `Unverified: <reason>`. A test runner is no proof unless `package.json` names no `bin` and no `scripts.start`. For a test-first bug, commit the failing test alone, because a test committed with its fix does not show it failed. Run runners unpiped, so the failing command shows.
6. **Review and commit.** Run `code-review` as in End of the run, commit where step 3 placed it, leaving out paths that were already changed, then end on `exo:ship` unless the request rules out a push.

When the goal command is red, change the project until the command as typed is green without destroying anything; ask the user only about a destructive step.
