# CLAUDE.md

> Contexte projet, lu automatiquement par Claude Code et les subagents.
> Exigences fonctionnelles & critères d'évaluation : voir [Instruction.md](Instruction.md)
> (source de vérité immuable — non dupliquée ici). Ce fichier = **comment on travaille**.

## 1. Nature du projet

- Type : **Front React + serveur SSR Node maison** (fullstack léger, pas de DB).
- But en une phrase : MVP e-commerce (galerie produits **PLP** + **panier**), kata de test technique **Senior Frontend**.
- Statut : POC d'évaluation **mais exigence production-grade explicite** (le brief évalue archi, perf et trade-offs autant que la feature). Pas de raccourci « POC jetable ».

## 2. Stack réelle

Front :

- Paradigme : **React** → agent `frontend-expert`.
- Framework : **aucun meta-framework** (Next.js / Nuxt **interdits** par le brief). **Vite + SSR custom**.
- React : **19.x** (≥ 19.0.1 — voir note sécurité), `renderToPipeableStream` pour le streaming SSR.
- TypeScript : **5.x, mode strict ON** (pas de `any`).
- Styling : **CSS Modules** (zéro runtime, scoping — choix orienté perf).
- Build : **Vite** (client + bundle SSR).
- Lib JS du projet : **TanStack Query** (cache data + dehydrate/hydrate SSR), **Zustand** (store panier + persistence), **XState** (machine optimistic/rollback du panier).

Back (serveur SSR + BFF maison, pas une API métier) :

- Runtime / framework : **Node + Express** (Vite middleware en dev ; static + render SSR en prod) → agent `backend-expert`.
- ORM / accès data : **aucun** — proxy BFF vers l'API publique **FakeStore** (`https://fakestoreapi.com/products`) avec couche de cache.
- Base : **aucune base de données**. Ne JAMAIS committer de secret.

> Note sécurité : React étant présent, vérifier en pré-déploiement le correctif CVE-2025-55182 (React ≥ 19.0.1). Version figée ci-dessus pour permettre de trancher sans demander.

## 3. Scripts (à créer en Phase 0/1)

- Install : `npm install`
- Dev : `npm run dev` (serveur SSR + Vite HMR)
- Build : `npm run build` (build client + serveur SSR)
- Preview prod : `npm run preview` (serveur SSR en mode prod)
- Lint : `npm run lint`
- Typecheck : `npm run typecheck` (`tsc --noEmit`)
- Tests : `npm run test` (Vitest)
- E2E : `npm run test:e2e` (Playwright)
- Bundle analysis : `npm run analyze` (bonus)

## 4. Tests et formulaires

- Runner : **Vitest**.
- Outillage front : **Testing Library + user-event** (unit/intégration), **Playwright** (E2E).
- Outillage back : **Vitest + supertest** sur le serveur SSR / BFF.
- Lib de formulaire : **natif** (recherche/filtres uniquement, pas de gros formulaire).
- Validation : **Zod** (valider les réponses de l'API FakeStore côté BFF).

Frontières NON négociables à couvrir (un trou ici = point d'arrêt) :

- **Panier — optimistic update** : tester le **rollback sur erreur**, pas seulement le happy path.
- **BFF / cache** : tester le cas **API indisponible** (network failure) → dégradation gracieuse.
- **Hydratation SSR** : aucun mismatch serveur/client.

Légitimement non testé (pas un trou) :

- Composants purement présentationnels sans logique.

## 5. Data

- MCP data connecté : **aucun**.
- Migration : **N/A** (pas de base de données).
- Données issues de l'API publique FakeStore via le BFF ; le panier vit côté client (les mutations POST de l'API sont factices, ne pas s'appuyer dessus).

## 6. Déploiement

- Cible : **exécution locale** (live demo pour l'interview) ; déploiement distant optionnel (bonus).
- Qui déclenche : **l'humain uniquement** — l'agent prépare et rend la main.
- Pré-déploiement attendu : build + lint + typecheck + tests verts + contrôle Web Vitals / Lighthouse.

## 7. Design review

- Outil de diff visuel : **NON** (aucune maquette Figma fournie).
- L'agent fait une **vérification visuelle manuelle responsive à 1440 / 768 / 375** (le brief évalue l'« Adaptability ») et le signale comme non automatisé dans le handoff.

## 8. Conventions locales (priment sur les défauts des agents)

- Structure de dossiers imposée : `/server` (back), `/src` (front), `/shared` (types contractuels), `/public`.
- **Contrat front/back = `/shared/types.ts`** : ne pas le casser sans synchro entre les deux agents.
- TS strict, pas de `any` ; types explicites aux frontières.
- Pas de logique métier dans les composants UI (extraire en hooks / store / machine).
- Commits **atomiques et lisibles** (l'historique est un critère d'évaluation).
- Tout trade-off non trivial : commenter le « pourquoi » **et** le consigner dans le README.

## 9. Pièges connus de ce repo

- **Meta-frameworks interdits** : ne jamais « simplifier » en proposant Next/Nuxt. Le SSR maison est volontaire (c'est l'axe d'évaluation principal).
- **SSR maison** : attention aux mismatches d'hydratation et au double-fetch — passer par dehydrate/hydrate de TanStack Query.
- **API FakeStore** : lecture seule fiable ; les écritures (POST/PUT) sont simulées et ne persistent pas.

## 10. Frontière agents (rappel)

- 🟩 `frontend-expert` → `/src` : PLP, panier (Zustand + XState), perf client, a11y.
- 🟦 `backend-expert` → `/server` : serveur SSR streaming, BFF + cache FakeStore, security headers.
- 🤝 Contrat → `/shared/types.ts`.
