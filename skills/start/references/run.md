# Run and chain

- Tell the user no command to type; they already typed one.
- A skill carrying `disable-model-invocation` cannot be called through the Skill tool, so name the exact command to type instead, such as `/exo:improve <goal>`.
- Chain: each stage's handoff carries the run on to `ship`. Add no stop, summary or question of your own between stages; only the questions each stage's skill prescribes reach the user.
