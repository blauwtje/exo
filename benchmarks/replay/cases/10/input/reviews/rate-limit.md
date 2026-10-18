FINDINGS

limiter.js:6-20; defect; security: unbounded memory growth; risk first: abusive clients sending many distinct keys exhaust server memory, because `callsByKey` never deletes a key, even after its window has fully expired (probe: 100000 keys, clock advanced 1e9 ms, one more call, `callsByKey.size` stays 100002); fix
  Probe: node --input-type=module -e "import {RateLimiter} from './limiter.js'; let t=0; const r=new RateLimiter(2,1,()=>t); for(let i=0;i<100000;i++) r.allow('k'+i); t=1e9; r.allow('x'); if (r.callsByKey.size > 1) { console.error('size', r.callsByKey.size); process.exit(1) } console.log('ok')"

Count: defect=1 concern=0 question=0
Unread: none
