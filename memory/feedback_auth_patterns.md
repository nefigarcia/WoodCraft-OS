---
name: Auth patterns and fixes for WoodCraft OS
description: Hard-won fixes for the JWT/Zustand auth stack — Edge runtime, token rotation, hydration race
type: feedback
---

Use these patterns when touching auth code in this project.

**1. JWT in Next.js middleware must use `jose`, not `jsonwebtoken`**
Middleware runs in Edge runtime which has no Node.js `crypto` module. `jsonwebtoken` silently fails, returning TOKEN_INVALID on every request. `jose` uses Web Crypto API and works in Edge.
Why: spent multiple sessions debugging 401s that were caused by this.
How to apply: middleware imports `jwtVerify` from `jose` directly — never import from `@/lib/auth` in middleware (that pulls in `bcryptjs` which can also cause Edge issues).

**2. Zustand `persist` hydration race in dashboard layout**
On any page load, the dashboard layout's first render sees `user: null` (Zustand hasn't read localStorage yet) and fires `router.replace("/login")` prematurely.
Fix: use a local `mounted` state — render nothing until after mount, then check auth.
```tsx
const [mounted, setMounted] = useState(false);
useEffect(() => setMounted(true), []);
useEffect(() => { if (mounted && !user) router.replace("/login"); }, [mounted, user, router]);
if (!mounted) return null;
```
Why: `onRehydrateStorage` callback in Zustand is unreliable for this use case.

**3. Refresh token rotation must update BOTH tokens on the client**
When the server does token rotation (refresh returns new access + refresh token), the client must store BOTH. Storing only the new access token causes TOKEN_REUSE on the next expiry — the server detects the old refresh token being reused, wipes the DB hash, and forces logout.
Fix: `refreshAccessToken` returns `{ accessToken, refreshToken }` and `setTokens(access, refresh)` stores both.

**4. `api.ts` must re-read the store when handling 401**
The refresh token is captured in a closure at the start of `request()`. If a concurrent request already refreshed the tokens by the time this request's 401 is handled, using the stale closure token triggers TOKEN_REUSE. 
Fix: call `useAuthStore.getState()` again inside the 401 handler to get the latest tokens. If a concurrent refresh already updated the access token, just retry with the new one instead of refreshing again.

**5. Proactive refresh before requests (not reactive)**
When `accessToken` is null but `refreshToken` exists (page reload), don't wait for a 401 — refresh proactively at the top of `request()`. Use a `refreshPromise` singleton to deduplicate concurrent calls (React StrictMode double-mounts fire two simultaneous requests).
