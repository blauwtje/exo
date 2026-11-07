# Ask menu routes

This page holds the routes of step 3 in `ship` that skip or pre-answer the menu question.

   - An `Unasked: push` line runs `--route push` unforced before the question, dropping the menu's Push.
   - Plan `Land:` from `gate` sets the route with no question: `push-main` gives `push`, `pr` gives `open-pr`, `local` gives no route.
