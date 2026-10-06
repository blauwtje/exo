# expenses

Summarize an expense CSV by category.

    expenses data/2024-q3.csv
    cat data/2024-q3.csv | expenses - --top 3
    expenses data/2024-q3.csv --format json | jq '.[0].total'

The input has a header row with `date`, `category`, `description` and `amount`
columns. Amounts may carry a thousands separator or a currency sign.

## Options

| Option | Meaning |
|---|---|
| `--sort total\|name` | Order of the categories. Default `total`, largest first. |
| `--top N` | Show only the first N categories; the Total line still covers all. |
| `--category NAME` | Count only the rows of one category. |
| `--format text\|json` | Output format. Default `text`; `json` prints only a JSON array of `{category, count, total}` objects, totals rounded to cents, for piping into `jq`. |
| `-h`, `--help` | Show the usage text. |

Run it from a checkout with `node bin/expenses.mjs <file>`. Bad options exit 2
with a message on stderr; an unreadable file exits 1.

## Tests

    npm test
