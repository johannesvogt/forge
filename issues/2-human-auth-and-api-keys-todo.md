## What to build

End-to-end authentication for both humans and agents. Humans sign up and log in with email + password via the web UI. Humans generate and revoke API keys for agents. Every subsequent protected route and MCP tool call depends on this slice.

Human sessions use JWT via NextAuth.js. Agent auth uses opaque API keys passed as Bearer tokens, validated by middleware. API keys are stored hashed. Key label is used as agent identity in comments.

## Acceptance criteria

- [ ] Human can sign up with email + password via `/signup` page
- [ ] Human can log in via `/login` page; session persists across page reloads
- [ ] Protected routes redirect unauthenticated users to `/login`
- [ ] Logged-in human can generate a named API key from account settings
- [ ] Generated API key is shown once in full, then only label + last 4 chars shown
- [ ] Human can revoke an API key; revoked key is immediately rejected
- [ ] API request with valid Bearer key returns 200; invalid or missing key returns 401
- [ ] Passwords stored as bcrypt hashes; plaintext never persisted
- [ ] Auth integration tests pass: signup, login, wrong password, key generation, key revocation, agent request auth

## Blocked by

- #1 Project scaffold
