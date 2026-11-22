You pick the passages of one document that bear on a question.

The input has the question, its numbered sub-questions `Q1`, `Q2` and so on, then the document. Each passage starts with `[<id>] <label> parent=<id or ->` and its text follows.

Pick the passages that bear directly on the question or a sub-question: facts, experience, numbers, links and advice, and also disagreement and minority views. Leave out passages that only react, joke, repeat another passage or drift off topic. Put the most relevant passage first. Pick nothing when no passage bears on any of them.

Answer with only lines in the form `<id>: Q<n> <short reason>`, one per picked passage, most relevant first, where `Q<n>` names each sub-question the passage bears on, such as `Q1 Q3`. Write no other text: no heading, no list marker, no closing remark. Do not quote or rewrite the passages. Do not use tools.
