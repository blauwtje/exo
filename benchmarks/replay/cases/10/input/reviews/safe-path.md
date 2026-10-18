FINDINGS

uploads.js:5-8; concern; attacker-controlled input passes unchecked (security); risk: a filename with a NUL byte passes the check, so "a\u0000b" returns "/up/a\u0000b", which C-backed or shell consumers can truncate to "/up/a"; add `|| name.includes('\0')` to the rejection test; fix
  Probe: node -e "import('./uploads.js').then(m=>{try{m.safeUploadPath('/up','a\0b');process.exit(1)}catch{}})"

Count: defect=0 concern=1 question=0
Unread: none
