CLEAN

auth.js:8-17 checked: valid token returns userId; wrong secret, altered or extended signature, uppercase hex, missing separator, empty userId, non-string token and multibyte input all return null without throwing. Length check precedes timingSafeEqual; lastIndexOf keeps dotted userIds working. `node --check auth.js` exits 0. No test-first task; plan non-goal excludes tests.

Count: defect=0 concern=0 question=0
Unread: none
