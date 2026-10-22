Project rules:
- Never edit files under `dist/`, because `npm run build` regenerates them and an edit is lost.
- Never call `console.log` in `src/`, because the logger writes JSON lines on stderr and a stray stdout line breaks the log parser.
- Never delete a file; move it to `archive/`, because the audit needs every file the project once held.
