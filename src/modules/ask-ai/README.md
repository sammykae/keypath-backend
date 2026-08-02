# Ask AI Module (AI-002)

## Overview

Stub implementation of the Ask AI endpoint. Returns placeholder responses while Gemini/RAG integration is being built.

## API Contract

### Request

```json
POST /api/ask-ai
Authorization: Bearer <jwt-token>

{
  "question": "string",
  "mode": "tenant_dashboard | landlord_dashboard | community_dashboard | investor_dashboard | general",
  "context": {
    "unitId": "optional",
    "propertyId": "optional",
    "orgId": "optional"
  }
}
```

### Response

```json
{
  "answer": "Placeholder response",
  "citations": [],
  "safety": { "blocked": false },
  "meta": { "requestId": "uuid", "model": "stub", "latencyMs": 0 }
}
```

## Features

- **Zod request validation**: Validates question, mode, and optional context
- **Authentication**: Requires valid JWT token (401 if missing)
- **Feature flag**: Returns 503 with "Ask AI disabled" when disabled
- **Rate limiting**: Placeholder middleware (real implementation in AI-015)
- **Audit logging**: Writes `ASK_AI_REQUESTED` event for each request

## Middleware Chain

1. `askAiFeatureFlagMiddleware` - Check if feature is enabled (503 if disabled)
2. `authMiddleware` - Verify JWT authentication (401 if missing/invalid)
3. `askAiRateLimitMiddleware` - Rate limiting placeholder
4. `askAiController` - Process request and return stub response

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ASK_AI_ENABLED` | `true` | Enable/disable the Ask AI feature |

## Security Considerations

- Does not accept requests without authentication
- Does not echo back sensitive context in responses
- Truncates questions in audit logs to prevent sensitive data exposure

## Acceptance Criteria

- [x] Returns placeholder for all roles
- [x] If not authenticated → 401
- [x] If feature flag disabled → clean 503 with message "Ask AI disabled"
- [x] Zod request validation
- [x] Attach requestId to response
- [x] Add basic rate limit placeholder hook
- [x] Audit log write (ASK_AI_REQUESTED)

## Future Work

- **AI-003+**: Gemini/RAG integration
- **AI-015**: Real rate limiting implementation
