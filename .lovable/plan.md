
# Root Cause Analysis: Why Category Fetching Still Fails

## What I Found

After deep investigation, the function IS deployed and working. The real issue is **authentication** combined with **poor error messaging**.

### Evidence from Live Logs

| Time | Status | What Happened |
|------|--------|---------------|
| Earlier | 404 | Function not deployed (fixed) |
| 13:57:55 | **200 OK** | Function works with valid auth |
| 13:59:22 | **401** | User session expired/invalid |

### The Actual Problems

**Problem 1: Session/Auth Issues**

The edge function has `verify_jwt = true`, which means it requires a valid user session. When the Supabase client calls the function, it automatically attaches the auth token from the current session. If:
- User's session expired
- User is not logged in
- Browser has stale/invalid session data

Then the function returns 401, which the frontend interprets as "Failed to fetch categories. Check site connection." - a completely misleading error message.

**Problem 2: Misleading Error Messages**

The frontend code in `ComposeView.tsx` catches ALL errors and shows the same generic message:

```typescript
fetchCategories(currentSite).then(categories => {
  setAvailableCategories(categories);
}).catch(error => {
  console.error('Failed to fetch categories:', error);
  setFetchError('Failed to fetch categories. Check site connection.');  // ← Misleading!
});
```

This hides the real problem (auth expired) behind a "check site connection" message.

**Problem 3: Frontend Doesn't Handle 401 Specifically**

The `wordpress-api.ts` code throws a generic error without checking if it's an auth issue:

```typescript
if (error) {
  console.error('[fetchCategoriesViaEdgeFunction] Invoke error:', error);
  throw new Error(error.message || 'Failed to fetch categories');  // ← No auth check
}
```

---

## The Fix: Multi-Layer Solution

### Layer 1: Improve Error Detection in wordpress-api.ts

Update `fetchCategoriesViaEdgeFunction` to detect auth errors and provide specific messages:

```typescript
if (error) {
  console.error('[fetchCategoriesViaEdgeFunction] Invoke error:', error);
  
  // Check for auth errors
  if (error.message?.includes('401') || error.message?.includes('unauthorized')) {
    throw new Error('Session expired. Please refresh the page or sign in again.');
  }
  
  throw new Error(error.message || 'Failed to fetch categories');
}
```

### Layer 2: Improve Error Handling in ComposeView.tsx

Show different messages based on error type:

```typescript
fetchCategories(currentSite).then(categories => {
  setAvailableCategories(categories);
}).catch(error => {
  console.error('Failed to fetch categories:', error);
  
  // Show appropriate error message
  if (error.message?.includes('Session expired') || error.message?.includes('sign in')) {
    setFetchError('Session expired. Please refresh the page.');
  } else if (error.message?.includes('SSL') || error.message?.includes('certificate')) {
    setFetchError('SSL certificate issue with WordPress site.');
  } else {
    setFetchError('Failed to fetch categories. Check site connection.');
  }
});
```

### Layer 3: Add Session Refresh Attempt

Before failing, try to refresh the session automatically:

```typescript
async function fetchCategoriesViaEdgeFunction(siteId: string): Promise<WPCategory[]> {
  // Try to refresh session first if it might be stale
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('Please sign in to continue.');
  }
  
  // Proceed with the existing logic...
}
```

---

## Files to Update

| File | Change |
|------|--------|
| `src/lib/wordpress-api.ts` | Add auth error detection and session check |
| `src/components/views/ComposeView.tsx` | Show specific error messages based on error type |
| `src/components/views/AdminAISettingsView.tsx` | Same error handling improvements |
| `src/components/views/AdminMediaManagementView.tsx` | Same error handling improvements |

---

## Technical Details

### Why This Keeps Breaking

The pattern is:
1. User opens app → session is valid → categories load ✓
2. User leaves tab open for a while → session expires silently
3. User tries to load categories → 401 error → "Check site connection" message
4. User thinks the site is broken, asks for fix
5. We deploy function again → still 401 because session is expired
6. User refreshes page → new session → works again
7. Cycle repeats

### The Permanent Solution

1. **Better error detection** - Distinguish between auth errors and actual site connection issues
2. **Automatic session refresh** - Check session validity before making requests
3. **Clear user messaging** - Tell users to refresh/re-login when auth fails, not "check connection"

---

## Expected Outcome

After these changes:
- Users will see "Session expired. Please refresh the page." instead of "Check site connection." when auth fails
- The app will attempt to refresh the session before giving up
- Auth issues won't be confused with WordPress site issues
- The category fetching will be more resilient and self-healing
