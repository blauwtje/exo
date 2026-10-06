# Architecture

```
bin/members.mjs        command line entry point (export, signup)
config/models.json     which model the export writes and which model files are loaded
data/                  members.json and plans.json, the data the commands read
scripts/seed-demo.mjs  prints demo members for the sales deck
src/models/user.js     UserRecord: one registered member
src/models/plan.js     PlanRecord: one billing plan
src/models/index.js    barrel for the models
src/registry.js        loads the model files named in config/models.json
src/services/signup.js signup rules
src/export.js          CSV writer
```

`UserRecord` normalises the email (trimmed, lower case) and rejects an address without an `@`.
The export writes whichever model `exportModel` names in `config/models.json`.
