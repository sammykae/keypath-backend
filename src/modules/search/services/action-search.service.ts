import { ACTION_REGISTRY, Action } from '../actions/action-registry';
import { SearchResult } from '../types/search.types';

// Tokenize a string into lowercase words, stripping punctuation
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

// Score a single query token against a pool of action tokens.
// Returns 0 if no match, higher for closer matches.
function scoreToken(qt: string, actionTokens: string[]): number {
  let best = 0;
  for (const at of actionTokens) {
    if (at === qt) { best = Math.max(best, 1.0); break; }     // exact
    if (at.startsWith(qt)) best = Math.max(best, 0.85);        // prefix ("creat" → "create")
    else if (qt.startsWith(at)) best = Math.max(best, 0.75);  // query longer ("campaigns" → "campaign")
    else if (at.includes(qt)) best = Math.max(best, 0.55);    // substring
  }
  return best;
}

function buildActionTokens(action: Action): string[] {
  const sources = [
    action.label,
    action.description,
    ...action.keywords,
    action.category,
  ];
  return [...new Set(sources.flatMap(tokenize))];
}

// Returns confidence in [0, 1] or 0 if the action should not appear.
// ALL query tokens must match something in the action — prevents noise.
function scoreAction(queryTokens: string[], action: Action): number {
  const actionTokens = buildActionTokens(action);
  let totalScore = 0;

  for (const qt of queryTokens) {
    const s = scoreToken(qt, actionTokens);
    if (s === 0) return 0; // one unmatched token disqualifies the action
    totalScore += s;
  }

  // Normalize by query length, then map into confidence range [0.68, 0.96]
  const normalized = totalScore / queryTokens.length;
  return 0.68 + normalized * 0.28;
}

export function searchActions(q: string, role: string): SearchResult[] {
  const queryTokens = tokenize(q);
  if (queryTokens.length === 0) return [];

  const scored: Array<{ result: SearchResult; score: number }> = [];

  for (const action of ACTION_REGISTRY) {
    if (!action.roles.includes(role)) continue;

    const score = scoreAction(queryTokens, action);
    if (score > 0) {
      scored.push({
        result: {
          type: 'action',
          label: action.label,
          subLabel: `${action.category} — ${action.description}`,
          route: action.route,
          confidence: Math.round(score * 100) / 100,
        },
        score,
      });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((s) => s.result);
}

// Returns all actions for a role — used for command palette listing
export function getActionsForRole(role: string): Action[] {
  return ACTION_REGISTRY.filter((a) => a.roles.includes(role));
}
