# members-tool

Small internal tool that keeps our member list and exports it for the billing team.
Nothing outside this repository imports these modules; it is run through `bin/members.mjs`.

## Usage

```sh
node bin/members.mjs export                          # CSV of every member on stdout
node bin/members.mjs signup --email a@b.co --name Ann  # register a member, prints the record
npm test
```

## Using the model in a script

```js
import { UserRecord } from './src/models/index.js';

const member = new UserRecord({ id: 1, email: ' Ann@Example.com ', name: 'Ann' });
console.log(member.displayName); // Ann <ann@example.com>
```

See `docs/architecture.md` for the layout.
