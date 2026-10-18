FINDINGS

sales.js:4-5; defect; real-export input; a UTF-8 BOM before the header makes `indexOf('amount')` miss, so a file with `amount` first throws `no amount column`; fix
  Probe: printf '\xef\xbb\xbfamount,name\n3,a\n' | node --input-type=module -e "import {sumAmount} from './sales.js'; console.log(sumAmount('/dev/stdin'))"
sales.js:11; defect; real-export input; `line.split(',')` ignores CSV quoting, so `"Smith, John",10` shifts columns and its amount is lost (probe returns 21, not 15); fix
  Probe: printf 'name,amount\n"Smith, John",10\nAnn,5\n' | node --input-type=module -e "import {sumAmount} from './sales.js'; console.log(sumAmount('/dev/stdin'))"
sales.js:11-12; defect; broken-row handling; `Number()` accepts `0x10` as 16 and blank as 0, so broken amounts are summed instead of skipped; fix
  Probe: printf 'name,amount\nCy,0x10\nAnn,5\n' | node --input-type=module -e "import {sumAmount} from './sales.js'; console.log(sumAmount('/dev/stdin'))"
sales.js:12; question; swallowed failure; broken rows are skipped with no count or signal, and the plan does not say whether to skip, report or throw; report

Count: defect=3 concern=0 question=1
Unread: none
