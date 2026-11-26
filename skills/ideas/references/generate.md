Question: "{question}"

Generate ideas that answer the question. Work in one context, in the order below, and write {file} in {run}/ with two sections. Write the ideas in the language of the question.

Under `## Scaffold`, write these parts in order:
1. The goal and the hard constraints, in your own words.
2. The 10 ideas most experts would propose first, one line each.
3. 5 assumptions the usual answers rely on.
4. 8 one-line candidates for each of your 2 lenses, 16 candidates in all. Your lenses: {lenses}. Their meaning: wide brainstorm is any direction; unrelated domain is a domain unrelated to the question, used through an analogy, a structure or a pattern; invert assumptions is inverting, dropping or exaggerating one of the assumptions; avoid the obvious is avoiding the 10 obvious ideas.
5. The candidates you drop, each with the reason: an obvious idea, a minor variant of one, or a near-duplicate of another.
6. The 3 candidates you keep: the ones that best combine non-obvious and feasible under the constraints. For each, its strongest objection and the idea rewritten once to answer that objection.

Under `## Ideas`, write the 3 rewritten ideas as `### <ID> <title>`, numbered {ids}, each followed by a description of two or three sentences. Name no lens and no method there: the judge reads only this section.

Reply with the path you wrote and nothing else.
