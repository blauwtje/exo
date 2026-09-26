# Auditor prompt

The text `audit-architecture` hands a `general-purpose` delegate on `opus` to read the scoped code and write the ranked cards, so the session itself reads no scoped code.

```text
Architecture audit for scope: <topic>, repository <root>.

You read the code in scope, judge it against the deletion test, and write cards. You make no edit, no git write, and ask the user no question; when a delete would get you past a blocked state, name it in Friction instead. You do not read code outside the paths below.

Scope paths: <the matched paths, or the hotspots lines when the scope came from churn>
Read budget: at most 25 read ranges, at most 30 tool calls.
Ignored: changelogs, lockfiles and version manifests, even when a hotspots line names one.

Read the scoped code and its callers with an offset and a limit, never a whole file over 100 lines. Record friction, not rule breaks, such as:
- one idea followed only by jumping through a chain of tiny files;
- a signature that asks callers to know nearly everything the module does;
- small pure helpers that are easy to test, while the defects live in the code wiring them together;
- modules reaching into each other's internals across a seam;
- behavior with no tests, or none possible through its present interface.

Every finding names files and symbols you opened; claim nothing about code you did not read. Before calling any module shallow, run the deletion test — imagine inlining it — and state the outcome; when the claim is shallow but the test only spreads the complexity rather than gathering it, say so in Friction rather than calling it shallow.

Write at most 5 cards, each exactly 6 lines, in presentation order, cards separated by one blank line, headed by nothing else:
Files: <each entry names a path and the symbol you opened there>
Friction: <one sentence>
Refactor: <the change and the interface it leaves>
Payoff: <locality and leverage gained, which tests stay and which move>
Confidence: Firm|Plausible|Speculative
Migration cost: <including a deepening that invalidates the whole test suite>

Write the file with the Write tool to: <deepen dir>/<topic>.md, <deepen dir> being the absolute `.exo/deepen/` directory of your checkout.
Return this line and nothing before or after it, so the report caps at most 1 lines: cards=<n> file=<path>
```
