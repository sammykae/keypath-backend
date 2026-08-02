# Atlas Vector Search Index: askAiKnowledgeDocs (AI-004)

Create this index in **MongoDB Atlas** so that vector search and role filtering work for the Ask AI knowledge library.

## Steps

1. In Atlas: **Database** → your cluster → **Browse Collections** → select the database that contains `askAiKnowledgeDocs`.
2. Go to **Search** tab → **Create Search Index**.
3. Choose **JSON Editor**.
4. **Index name:** `ask_ai_knowledge_vector_index` (must match `ASK_AI_KNOWLEDGE_VECTOR_INDEX` in code).
5. **Database and collection:** the DB and collection where `askAiKnowledgeDocs` lives.
6. Paste the definition below.

## Index definition (JSON)

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 768,
      "similarity": "cosine"
    },
    {
      "type": "filter",
      "path": "audienceRole"
    },
    {
      "type": "filter",
      "path": "sourceType"
    }
  ]
}
```

- **768** must match your embedding model (e.g. `gemini-embedding-001` with `outputDimensionality: 768`).
- **filter** fields allow efficient filtering in `$vectorSearch` by `audienceRole` and `sourceType`.

## Verification

After the index is built:

- **Can insert docs:** use the seed script or call `insertDoc()` from `askAiKnowledge.service`.
- **Vector search returns results:** run a query that calls `vectorSearch(queryEmbedding, { limit: 5 })`.
- **Role filtering works:** run `vectorSearch(queryEmbedding, { limit: 5, audienceRole: 'landlord' })` and confirm only docs with `audienceRole: 'LANDLORD'` or `audienceRole: 'ALL'` are returned.
