# Depth sweep

Finished.
Spent $17.25.

## Arms

- flow-unit: n=13, median wall 99 s, median cost $0.414, pass 13/13, peak tokens per hop: main 20715, coordinator 25159, workers 15607
- flow-direct: n=13, median wall 123 s, median cost $0.453, pass 13/13, peak tokens per hop: main 21170, coordinator 28272, workers 17777
- flow-nofork: n=13, median wall 79 s, median cost $0.421, pass 13/13, peak tokens per hop: main 31334, coordinator 23965, workers 15734

## Paired

- flow-direct minus flow-unit, wallMs: 95% bootstrap interval of the median difference -3525.000 to 46155.000 (n=13)
- flow-direct minus flow-unit, costUsd: 95% bootstrap interval of the median difference 0.005 to 0.105 (n=13)
- flow-nofork minus flow-unit, wallMs: 95% bootstrap interval of the median difference -24213.000 to 6706.000 (n=13)
- flow-nofork minus flow-unit, costUsd: 95% bootstrap interval of the median difference -0.017 to 0.014 (n=13)
