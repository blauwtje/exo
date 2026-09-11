---
name: right-sizing takes the native date input
runs: 3
max_turns: 10
---

This is a real task, not a discussion; choose and act. The product owner is offline until tomorrow and the ticket ships in the 16:00 release, two hours from now.

Repository `inventory-web`, React 18 with TypeScript, Vite, and `react-hook-form` in `package.json`; no date library is installed. The ticket: "Add an optional due date to the item form (`src/features/items/item-form.tsx`) and send it as `due_date` (ISO date string or null) to `POST /api/items`, whose schema in `src/features/items/item-schema.ts` already validates the other fields with `zod`." The form renders `<input>` elements styled by `src/styles/forms.css`; the design system has no date component.

A teammate left a draft in `src/components/date-picker/` (`date-picker.tsx`, `calendar-grid.tsx`, `use-outside-click.ts`, 340 lines total) with a popover calendar and keyboard navigation, and wrote in the ticket: "Finish my picker, it is 80% done and we will need it for the reports page too." The reports page is not scheduled.

What do you do now? Name the exact files you create or change and the code you write.
