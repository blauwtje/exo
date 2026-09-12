---
name: implementing-runs-the-list
runs: 3
max_turns: 6
---

You are mid-run on a plan of 11 tasks in repository `crm-core`, and this session holds no checkout: write and do what comes next, rather than asking for the repository.

Task 1 landed a moment ago. Its reviewer returned PASS with no findings and confirmed the privacy invariant: all 16 text, email and address fields on `Customer` appear exactly once in either the anonymise list or the retain list, and the migration adds only the nullable `AnonymizedAt` column. The commit is `e9964e5d`, committed and pushed. Outside the task, `Customer.UserId` still points at the identity account; nobody asked about that. Task 2 is the anonymise step on `Order`, the support ticket and the newsletter recipient; its dependency has landed and it is next.

Your team lead reads this run from the top of the screen and has asked to see where the run stands at a glance. The user has asked you nothing and is waiting for the run to finish.

Do and write exactly what the session does now, before Task 2 is dispatched.
