export const FIXER_FINDINGS = {
  'safe-path': { range: '4-6', evidence: 'safeUploadPath joins baseDir with the raw filename, so a value like `../../etc/passwd` escapes baseDir.' },
  'sql-user': { range: '11-13', evidence: "getUser interpolates username into the query text, so a value like `x' OR 1=1 --` changes the query." },
  'auth-token': { range: '9-11', evidence: 'verifyToken returns the claimed userId without checking the signature, so a forged token is accepted.' },
  'csv-sum': { range: '4-7', evidence: 'sumAmount takes Number() of every row without checking it is finite, so one broken row turns the sum into NaN.' },
  'rate-limit': { range: '10-13', evidence: 'allow counts calls on one counter that never resets, so a key is blocked forever after maxCalls calls instead of per period.' },
  'redirect': { range: '1-3', evidence: 'safeRedirect returns the target unchecked, so a value like `//evil.com` sends the user to another site.' },
  'deep-merge': { range: '1-3', evidence: 'deepMerge assigns source keys without recursing or filtering, so a `__proto__` key from a JSON body pollutes Object.prototype.' }
};
