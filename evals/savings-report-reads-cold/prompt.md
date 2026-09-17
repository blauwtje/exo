---
name: savings-report-reads-cold
runs: 10
max_turns: 6
---

I installed a Claude Code plugin called exo a few weeks ago and have not looked into how it works. It just printed this report:

```text
┌────────────────────────────────────────────────────────────┐
│                                                            │
│  exo cost report · on                                      │
│  All projects, last 30 days · 228 sessions                 │
│                                                            │
└────────────────────────────────────────────────────────────┘

  exo cost   $17.51    254 calls · 27m
  Refused    72 reads  299 KB of file text never sent to Claude

  What exo saved is not measured. Refused text was never sent,
  so no token count or price exists for it.

What exo cost
┌──────────────────────────┬───────┬──────┬────────┐
│ Work                     │ Calls │ Time │   Cost │
├──────────────────────────┼───────┼──────┼────────┤
│ Loading exo skills       │   200 │  21m │ $16.50 │
├──────────────────────────┼───────┼──────┼────────┤
│ Re-reads after a refusal │    54 │   2m │  $1.02 │
├──────────────────────────┼───────┼──────┼────────┤
│ exo hooks                │     - │   4m │      - │
├──────────────────────────┼───────┼──────┼────────┤
│ Total                    │   254 │  27m │ $17.51 │
└──────────────────────────┴───────┴──────┴────────┘

What the read guard refused, and what its re-reads cost
┌──────────────────┬─────────┬───────────┬──────────┬───────┐
│ Guard            │ Refused │ File text │ Re-reads │  Cost │
├──────────────────┼─────────┼───────────┼──────────┼───────┤
│ Big file         │      70 │    290 KB │       54 │ $1.02 │
├──────────────────┼─────────┼───────────┼──────────┼───────┤
│ Same lines again │       2 │      8 KB │        0 │ $0.00 │
├──────────────────┼─────────┼───────────┼──────────┼───────┤
│ Total            │      72 │    299 KB │       54 │ $1.02 │
└──────────────────┴─────────┴───────────┴──────────┴───────┘

What exo does, and what this report measures

  Big-file guard                           70 refused · 290 KB
    Claude asked to read a file of over 400 lines in one go.
    exo said no and asked it to find the part it needs first.

  Repeat guard                                2 refused · 8 KB
    Claude asked again for lines it had already read, and the
    file had not changed. exo said no: it still had that copy.

  Helpers                                         not measured
    Searches and builds run in a helper, a second Claude with
    its own workspace, so their file dumps stay out of yours.

  Build only what is needed                       not measured
    Before writing code, exo checks whether it is needed or
    already exists, and then writes as little as works.

To spend less: re-reads after a refusal cost $1.02.
To refuse fewer reads, raise the big-file limit of 400
lines with /exo:savings guard-lines <lines>.
Loading skills cost $16.50 and has no switch; only
disabling the exo plugin stops it.

Tokens: exo's calls came to 3.6M in all. Text read back from
the prompt cache counts a tenth, text written to it more.
Cost: what these calls cost at API list price, not your bill.
Time: the calls' wall time plus exo's hook runs.
Not counted: the instructions exo adds when a session starts.
```

Turn off with `/exo:savings off`.

What did exo save me, and by what means?
