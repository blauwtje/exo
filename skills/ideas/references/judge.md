Question: "{question}"

Read {run}/existing.md and only the `## Ideas` section of {run}/ideas-a.md and of {run}/ideas-b.md. Read no other file in {run}. Write only {run}/judge.md, in the language of the question with the labels in English, and no other file.

Judge each idea against the goal, the constraints and the criteria in existing.md. Disagree with an idea when the facts support it, and do not soften a finding because the idea is attractive.

## Screen

Give each idea:
- Verdict: `exists` (a solution that does the core of the idea is in use), `variant` (parts exist, but the combination, the target group or the mechanism is not covered) or `new` (nothing that does the core).
- Breaks where: the strongest objection and the most likely reason it fails when tried.
- Four scores, each a whole number from 0 to 5: Novelty (5 means nothing close exists, 0 means it exists as it is), Usefulness (how much it moves the goal if it works), Feasibility (whether the constraints allow it to be tried), Survival (how well it survives its strongest objection).
- Total: the exact sum of the four scores, out of 20.

Search the web only for ideas with a total of 12 or more, at most one search per idea for the closest existing solution, with all searches in one message, in parallel. Set the verdict from existing.md and what you found.

## Improve

Each idea with a total of 12 to 15 and a verdict that is not `exists` gets exactly one rewrite, aimed at its Breaks where and its closest existing solution. Give the rewrite the ID with the suffix `r` (I3 becomes I3r) and score it again. Keep the better version and drop the other.

## Compare

Compare each idea with a total of 16 or more and a verdict that is not `exists` with the Best existing answer in existing.md twice, on the criteria in existing.md: once with the idea as option A and once as option B. `Beats best existing: yes` only when the idea wins both orders; otherwise `no`. For an idea not compared write `-`.

## Strong

An idea is strong only when its total is at least 16 out of 20, its verdict is not `exists`, and it beats the best existing answer in both orders.

## Rank

Rank strong ideas first, ordered by total, then by Usefulness, then by Survival. Then rank the other ideas by total.

For each of the top 3, write a first test that shows whether the idea works: what to do in two or three steps, `Pass if:` and `Fail if:` as measurable results against the criteria in existing.md, and `Cost:` in time and money. One person must be able to do it within a month.

## Write

Write {run}/judge.md in this order:
1. For each of the top 3, a section `## <rank>. <title>` with the lines `Score: <n>/20`, `Prior art: <exists|variant|new>`, `Beats best existing: <yes|no|->`, `Strong: <yes|no>`, `Why it could fail:`, and `First test:` with its pass and fail rule, then the idea's description.
2. A table of all ideas: rank, ID, title, total, verdict, beats best existing (`yes`, `no` or `-`), strong.
3. One section per idea in this form:

### <ID> <title>
Verdict: exists | variant | new
Breaks where: <text>
Novelty: <0-5> <one line why>
Usefulness: <0-5> <one line why>
Feasibility: <0-5> <one line why>
Survival: <0-5> <one line why>
Total: <sum>/20
Beats best existing: yes | no | -
Strong: yes | no

4. The line `Strong: <n> of <m>`.

Then reply with text: the `Strong: <n> of <m>` line, then the top 3 as one line each with the title, the total, strong yes or no and one sentence.
