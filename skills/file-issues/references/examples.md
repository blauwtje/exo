# Worked issue bodies

Three shapes, three different subjects. Copy the shape, not the facts.

## Feature from a brief

Spec shape. Title: `Warn users before their session expires`

```
### Outcome

A signed-in user sees a warning two minutes before the session ends and can extend it.

### Problem

Sessions end without notice, and users lose unsaved form input.

### Done when

- [ ] A banner appears 2 minutes before expiry, showing the seconds left.
- [ ] "Stay signed in" renews the session and hides the banner.
- [ ] Ignoring the banner signs the user out at expiry and shows the sign-in page.
- [ ] A session shorter than 2 minutes shows the banner at once.

### Out of scope

Changing the session length, remember-me.

### References

- src/auth/session.ts
- src/auth/SessionBanner.tsx
```

## Bug from a chat

Report shape. Title: `Search returns no results for a query with a trailing space`

```
### What happens

Searching "invoice " (trailing space) returns zero results.

### Expected

The same results as "invoice".

### Steps

1. Open Search.
2. Type `invoice ` with a trailing space.
3. Press Enter.

### Environment

- App: 2.4.1
- Browser: Firefox 131
- OS: Windows 11

### Evidence

    GET /api/search?q=invoice%20 -> 200 {"items":[]}
```

## Chore with no user-visible change

Report shape, `### Steps` and `### Evidence` left off because there is nothing to reproduce. Title: `Drop the unused moment dependency`

```
### What happens

`package.json` lists `moment`, and no file under `src/` imports it.

### Expected

The dependency is removed and the lockfile matches.

```
