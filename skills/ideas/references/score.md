Question: {question}

Read only these files: {run}/frame.md, {run}/pool.md (take only the ideas with these IDs: {batch}) and {run}/prior-art-{n}.md. Read no other file in {run}.

Judge each idea on its own, one at a time, against the goal and the constraints in frame.md. For each idea, first find where it breaks: the strongest objection, the assumption it needs that may be false, and the most likely reason it fails when tried. Disagree with an idea when the facts support it, and do not soften a finding because the idea is attractive.

Then give four scores, each a whole number from 0 to 5:
- Novelty: how new the idea is after the prior-art note. 5 means nothing close exists, 0 means it exists as it is.
- Usefulness: how much it moves the goal in frame.md if it works. 0 means it does not serve the goal.
- Feasibility: whether the constraints in frame.md allow it to be tried with the given resources. 0 means a constraint rules it out.
- Survival: how well the idea survives its strongest objection. 0 means the objection kills it.

Write {run}/score-{n}.md with one section per idea, in this form:

## <ID> <title>
Breaks where: <the strongest objection and where the idea fails>
Novelty: <0-5> <one line why>
Usefulness: <0-5> <one line why>
Feasibility: <0-5> <one line why>
Survival: <0-5> <one line why>
Total: <sum>/20

The total is the exact sum of the four scores. Reply with only the path you wrote.
