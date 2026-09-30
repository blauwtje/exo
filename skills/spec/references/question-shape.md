# Question shape

Ask the costly questions as an interview, one per message. The enemy is developer vocabulary, or several choices stacked in one message. The overcorrection is so much context that the choice gets lost.

## Each message

No name from the code appears in any message, assumptions included: no path, field, setting, role or technical term, only what it means for the user.

- First line `Question <n>`, rising by one each question turn.
- The question in everyday words; one context line above it only when it needs one.
- Two or three one-line options `a.` `b.` `c.`, holding only what the user gets.
- Recommended first, with the output style's recommended marker; only without one, `(recommended)`.
- Under them, one unlabelled sentence under 20 words on why it wins, not inside an option.
- Last, one reply hint line; no recap of earlier answers.
- Ask first the question whose answer could remove others, so later ones may drop out.
- The final question alone adds an `Assuming:` list above its hint: one plain line per user-visible default neither request nor code fixes.

```text
Question 1

How should harbour masters get their tide alerts out of the app?
a. Download their harbour's alerts as a spreadsheet. (recommended)
b. Add the alerts to their own calendar.
A spreadsheet opens anywhere and needs no setup.

Reply a, b, your own words, or ok for the recommendation.
```

```text
Question 2

Who may download the alerts?
a. Harbour masters, for their own harbour. (recommended)
b. Everyone who can see the alerts.
Bulk harbour plans should not reach outsiders.

Assuming:
- The export uses the date format the alert list shows.
- The download button sits beside the refresh button.

Reply a, b, your own words, or ok to take this and every assumption.
```

## Replies

- A letter or own words answer the current question; the next follows alone in the next turn.
- `ok` or `go` takes this and every remaining recommendation and assumption; an unanswered question takes its recommendation.
- The final answer confirms: the brief follows with no confirmation round.
- A reply opening a new costly point adds one question to the queue.
- "I don't know" gets two everyday sentences on the difference, with one example, then the question again; a second takes the recommendation, credited to exo.

## Judgment

- Everyday words outrank precision, because a term the user must look up blocks the answer.
- A reply that confirms outranks another round.
