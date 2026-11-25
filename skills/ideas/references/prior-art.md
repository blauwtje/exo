Question: {question}

Read {run}/frame.md for the goal, the constraints and what already exists. Read {run}/pool.md and take only the ideas with these IDs: {batch}.

For each of these ideas, search the web for solutions that already do the same thing: products, services, papers, projects, programs and common practice, in any language the topic needs. Run at least two differently worded searches per idea. Judge on what you find, not on whether the idea sounds familiar.

Give each idea one verdict:
- exists: a solution that does the core of the idea is already in use.
- partly: parts of the idea exist, but the combination, the target group or the mechanism is not covered.
- new: you found nothing that does the core of the idea.

Write {run}/prior-art-{n}.md with one section per idea, in this form:

## <ID> <title>
Verdict: exists | partly | new
Found: <what exists and how close it is to the idea, or what you searched for and did not find>
Links: <up to 3 URLs, or none>
Gap: <what the idea adds beyond the closest match, or none>

Do not rate or rank the ideas and do not suggest improvements. Reply with Result: {run}/prior-art-{n}.md as the last line.
