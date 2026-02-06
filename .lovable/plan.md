
# Why Edge Functions Keep Crashing: Root Cause Analysis

## The Core Problem

Your edge functions have been fixed repeatedly, but the fixes haven't addressed the **systemic issues** that cause recurring failures. Each fix addresses one symptom, but new problems emerge because the codebase lacks a unified, resilient architecture.

---

## 5 Systemic Root Causes Identified

### 1. Duplicate Code Bug (Active Bug Right Now)

**Location:** `wordpress-upload-media/index.ts` lines 41-42

```text
return uploadWithRetry(url, authHeader, wpFormData, attempt + 1);
return uploadWithRetry(url, authHeader, wpFormData, attempt + 1);  ← DUPLICATE
```

This was introduced in the last edit. The duplicate `return` statement causes unpredictable behavior and runtime errors.

**Fix:** Remove the duplicate line.

---

### 2. Inconsistent Error Response Patterns

Different functions handle errors differently:

| Function | Error Response | UI Behavior |
|----------|---------------|-------------|
| `wordpress-upload-media` | Returns `200 OK` with error payload ✅ | Shows message |
| `generate-article` | Returns `500 Internal Server Error` ❌ | Crashes with "Failed to fetch" |
| `wordpress-publish-article` | Returns WordPress status code ❌ | Crashes on 503 |
| `generate-description` | Returns `500 Internal Server Error` ❌ | Crashes |

When functions return HTTP 500, the frontend treats it as a network failure and shows "Failed to fetch" instead of the actual error message.

**Fix:** Standardize ALL functions to return `200 OK` with a JSON error payload containing `{ success: false, error: "message" }`.

---

### 3. External Service Dependency Without Isolation

Your functions depend on external WordPress servers that frequently return 503 errors:

```text
[wordpress-upload-media] WP API error: 503 {}
[wordpress-upload-media] Got 503, retrying after delay...
```

When the WordPress server is overwhelmed:
- AI auto-publish uploads images → server gets busy
- Manual publish tries simultaneously → gets 503
- Both fail, causing cascading crashes

**Fix:** Add request jitter (random delay) before WordPress API calls to prevent request collision between automated and manual operations.

---

### 4. Missing Global Try-Catch Protection

Several functions have unprotected code paths that can throw unhandled exceptions:

**Example in `generate-article/index.ts`:**
```typescript
// This can fail if AI returns malformed response
const content = data.choices?.[0]?.message?.content;
if (!content) {
  throw new Error('No content received from AI');  // ← Returns 500
}
```

**Fix:** Wrap all main handlers in comprehensive try-catch with graceful degradation.

---

### 5. No Centralized Resilience Pattern

Each function was built independently with different:
- Timeout configurations
- Retry strategies  
- Error response formats
- CORS header handling

When one function gets fixed, others still have the old patterns.

---

## Implementation Plan

### Phase 1: Fix Active Bugs (Critical)
1. Remove duplicate return statement in `wordpress-upload-media`
2. Redeploy immediately

### Phase 2: Standardize Error Responses
Update these functions to return `200 OK` with error payloads:
- `generate-article/index.ts` (line 345: change `status` to `200`)
- `generate-description/index.ts` (line ~70: change status 500 to 200)
- `wordpress-publish-article/index.ts` (lines 120-123, 163-165: return 200 with error)

### Phase 3: Add Request Isolation
Add random jitter (0-2 seconds) before WordPress API calls to prevent simultaneous requests from AI and manual publishing colliding on the same server.

### Phase 4: Improve Retry Logic
Add retry logic with exponential backoff to `wordpress-publish-article` (currently has no retry mechanism).

---

## Technical Details

### Standardized Error Response Pattern (All Functions)

```typescript
// ALWAYS return 200 OK with error details
return new Response(
  JSON.stringify({ 
    success: false, 
    error: 'User-friendly error message',
    code: 'error_code',
    retryable: true  // or false
  }),
  { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
);
```

### Request Jitter Pattern

```typescript
// Add before any WordPress API call
const jitter = Math.random() * 2000; // 0-2 seconds random delay
await new Promise(r => setTimeout(r, jitter));
```

### Files to Update
1. `supabase/functions/wordpress-upload-media/index.ts` - Remove duplicate line
2. `supabase/functions/generate-article/index.ts` - Return 200 on errors
3. `supabase/functions/generate-description/index.ts` - Return 200 on errors
4. `supabase/functions/wordpress-publish-article/index.ts` - Add retry logic + return 200 on errors

---

## Expected Outcome

After these changes:
- No more "Failed to fetch" UI crashes
- All functions return valid JSON responses
- WordPress server overload is handled gracefully
- Automated and manual publishing don't interfere with each other
- Error messages are displayed to users instead of crashes
