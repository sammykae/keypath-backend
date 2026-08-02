# Is Week Ka Testing Guide (BE-301 + BE-101)

## Kya kya banaya

| # | Feature | Endpoint | Kaam kya hai |
|---|---------|----------|----------------|
| 1 | **Credit Issue** (BE-301) | `POST /api/landlord/credits/issue` | Landlord/Admin tenant ko credits deta hai (EARN ya ADJUST) |
| 2 | **Ownership Credits** (BE-101) | `GET /api/tenants/ownership-credits` | Tenant apna balance + credit events list dekhta hai |

---

## Testing ka order (easy way)

### 1. Server chalao

```bash
npm run dev
# ya
node --loader ts-node/esm src/index.ts
```

Base URL: `http://localhost:3001` (ya jo PORT .env mein hai)

---

### 2. JWT tokens lo

- **Landlord token:** Login karo jis user ka role `landlord` ho (aur jis org ka OWNER/ADMIN ho).
- **Tenant token:** Login karo jis user ka role `tenant` ho.

(Agar login API nahi hai to seed se users banao aur JWT manually ya auth route se lo.)

---

### 3. Tenant ko org se link karo (agar abhi nahi hai)

- **Tenancy banao:** Landlord flow se ek **Tenancy** create karo — jisme `tenantUserId` = woh tenant user jisko credits dena hai, aur `unitId` = koi unit jo us org ke property ka ho.
- Endpoint: `POST /api/landlord/tenancies` (ya jo tenancy create route hai) — body mein `tenantUserId`, `unitId`, `leaseStart`, `leaseEnd`, `rentAmount`.

Bina active tenancy ke **Credit Issue** 403 dega: "Tenant is not in this organization".

---

### 4. Credit Issue test karo (BE-301)

**Request:**

```http
POST http://localhost:3001/api/landlord/credits/issue
Authorization: Bearer <LANDLORD_JWT>
Content-Type: application/json

{
  "tenantUserId": "<TENANT_USER_OBJECT_ID>",
  "amount": 100,
  "reason": "Monthly incentive",
  "idempotencyKey": "issue_001_20250203",
  "propertyId": "<PROPERTY_ID>"
}
```

**Optional:** `orgId` direct de sakte ho; warna `propertyId` se org resolve hota hai. `unitId` optional (account scope ke liye).

**Expect:**

- **201:** `message: "Credits issued successfully"`, `event`, `accountId`
- **400:** Validation error (missing/invalid body)
- **403:** Tenant is not in org / Insufficient permissions
- **409:** Same `idempotencyKey` different data se

**Idempotency check:** Wahi body + wahi `idempotencyKey` dubara bhejo → phir bhi 201, same event (duplicate create nahi hoga).

---

### 5. Ownership Credits test karo (BE-101)

**Request (as Tenant):**

```http
GET http://localhost:3001/api/tenants/ownership-credits?limit=10
Authorization: Bearer <TENANT_JWT>
```

**Optional query:**

- `cursor=<last_event_id>` — next page
- `limit=25` (default 25, max 100)
- `type=EARN` ya `REDEEM` ya `ADJUST` ya `EXPIRE` — filter by type

**Expect:**

- **200:**  
  `{ "balance": 100, "events": [ { "id", "type": "EARN", "amount", "occurredAt", "description", "referenceId" } ], "nextCursor": "..." }`
- **401:** No/invalid token

Step 4 ke baad is tenant se yeh call karo — jo credits issue kiye the woh `balance` aur `events` mein dikhne chahiye (type EARN).

---

## Quick checklist

- [ ] Server start ho raha hai
- [ ] Landlord JWT se `POST /api/landlord/credits/issue` 201 deta hai (tenant org mein ho)
- [ ] Same idempotencyKey dobara bhejne pe 201 (duplicate event nahi)
- [ ] Tenant JWT se `GET /api/tenants/ownership-credits` 200 + balance/events sahi
- [ ] `?type=EARN` lagane se sirf EARN events aate hain
- [ ] `?cursor=...&limit=5` se pagination kaam karta hai

---

## Postman / Thunder Client

1. Environment variables: `LANDLORD_TOKEN`, `TENANT_TOKEN`, `TENANT_USER_ID`, `PROPERTY_ID`
2. BE-301: New request → POST `{{baseUrl}}/api/landlord/credits/issue`, Auth = Bearer `{{LANDLORD_TOKEN}}`, body JSON (upar wala).
3. BE-101: New request → GET `{{baseUrl}}/api/tenants/ownership-credits`, Auth = Bearer `{{TENANT_TOKEN}}`.

Base URL = `http://localhost:3001` (ya apna PORT).
