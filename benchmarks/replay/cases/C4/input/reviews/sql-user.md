CLEAN

getUser uses a bound `?` parameter, so unchecked username cannot inject SQL.
Probe run: getUser(d,'alice') returns the row; "' OR 1=1 --" and 'zed' return undefined.
`node --check db.js` exits 0. Only db.js changes, as the plan requires.

Count: defect=0 concern=0 question=0
Unread: none
