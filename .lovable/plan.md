

# Root Cause Analysis: Why Category Fetching Keeps Breaking

## The Real Problem (Now Proven)

I just tested the live edge functions directly:

| Function | Result |
|----------|--------|
| `wordpress-get-tags` | **200 OK** - Working |
| `wordpress-get-categories` | **404 Not Found** - Not deployed |

**The function code exists in your codebase, but it was NEVER deployed to production.**

## Why This Keeps Happening

Every time we "fix" something, the fix only exists in code - but the actual deployment to the live backend never happens for this specific function because:

1. **Missing from config.toml**: Neither `wordpress-get-categories` nor `wordpress-get-tags` are registered in `supabase/config.toml`
2. **No automatic redeployment**: Without config entries, the deployment system doesn't know to deploy these functions when other changes are made
3. **Tags works by accident**: `wordpress-get-tags` was manually deployed at some point and hasn't been removed, but it's equally vulnerable to disappearing

## The Permanent Fix

### Step 1: Add Both Functions to config.toml

Add these entries to `supabase/config.toml`:

```toml
[functions.wordpress-get-categories]
verify_jwt = true

[functions.wordpress-get-tags]
verify_jwt = true
```

### Step 2: Deploy the Missing Function

Explicitly deploy `wordpress-get-categories` to make it available on the live backend.

### Step 3: Verify Deployment

Test both functions to confirm they return 200 OK.

---

## Why This Will Be Permanent

| Before | After |
|--------|-------|
| Function code exists but not deployed | Function code + config entry + deployed |
| No config entry = forgotten during deploys | Config entry = always included in deploys |
| Can break when other changes trigger redeploy | Protected by explicit configuration |

## Files to Update

- `supabase/config.toml` - Add `[functions.wordpress-get-categories]` and `[functions.wordpress-get-tags]` entries

## Functions to Deploy

- `wordpress-get-categories` (currently 404)
- Optionally redeploy `wordpress-get-tags` for consistency

## Expected Outcome

After this fix:
- Categories will load in the "new article" section
- The function will remain deployed even when other parts of the system change
- No more "Failed to fetch categories" errors

