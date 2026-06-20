# UI: project-scoped API key management

## What to build

Update the account page API key management to be project-aware.

- API key creation form gains a project selector dropdown (populated from `GET /api/projects`)
- Selecting a project is required before creating a key
- The API key list shows the project name alongside each key
- Revoke flow unchanged

## Acceptance criteria

- [ ] API key creation form includes a project selector populated with all projects
- [ ] Submitting without selecting a project is blocked (client-side validation)
- [ ] Created key displays the associated project name in the key list
- [ ] Revoking a key still works correctly
- [ ] `tsc --noEmit` passes

## Blocked by

- #21 UI: projects landing and creation
