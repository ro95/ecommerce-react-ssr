# Décisions techniques — Q&R (prep interview)

> Document de référence pour **justifier et comprendre** chaque choix technique du projet.
> Format question / réponse : ce qu'un examinateur peut demander, et comment y répondre
> avec le *quoi*, le *pourquoi*, le *comment*, et les alternatives écartées.
> Les bugs réels rencontrés sont en fin de document (§9).

---

## 1. Architecture générale & framework

### Q1.1 — Pourquoi React, et pourquoi PAS Next.js / Nuxt ?
**Réponse.** React parce que c'est imposé par la fiche de poste. Pas de meta-framework (Next/Nuxt) parce que **le brief l'interdit explicitement** — et surtout parce que l'objectif du test est de démontrer qu'on **maîtrise les mécanismes du SSR**, pas qu'on sait appuyer sur le bouton « SSR » de Next. J'ai donc monté un **SSR custom avec Vite**.

**Ce que ça veut dire.** *SSR (Server-Side Rendering)* = le HTML de la page est généré sur le serveur et envoyé déjà rempli au navigateur, au lieu d'envoyer une page vide que le JavaScript remplit ensuite (*CSR, Client-Side Rendering*). Avantage : premier affichage plus rapide, meilleur SEO.

**Trade-off.** Plus de code à écrire et à maîtriser (serveur, hydratation, build double) vs un framework qui fait tout. Le gain : contrôle total et compréhension fine — exactement ce qui est évalué.

### Q1.2 — C'est quoi « custom Vite SSR » concrètement ?
**Réponse.** Trois pièces :
1. Un **serveur Node/Express** qui reçoit la requête HTTP.
2. **Vite** qui fournit le rendu (transformation des modules, HMR en dev, build optimisé en prod).
3. Le **rendu React en streaming** (`renderToPipeableStream`) côté serveur, puis l'**hydratation** côté client.

Le serveur lit un template `index.html`, y injecte le HTML rendu par React, et envoie le tout. Le client « hydrate » ce HTML pour le rendre interactif.

**Ce que ça veut dire.** *Hydratation* = React reprend le HTML statique envoyé par le serveur et y rattache les écouteurs d'événements / l'état, sans tout re-rendre. Si le HTML serveur et le premier rendu client diffèrent → *hydration mismatch* (warning React, bugs visuels).

### Q1.3 — Pourquoi Vite plutôt que Webpack / esbuild seul ?
**Réponse.** Vite donne en dev un serveur ultra-rapide (ESM natif + HMR) et en prod un build Rollup optimisé (tree-shaking, code splitting). Il expose une API SSR de première classe (`ssrLoadModule`, `transformIndexHtml`, `middlewareMode`) qui rend le SSR custom réaliste à écrire. Le brief le suggère même (« how modern bundlers can assist with server-side capabilities »).

---

## 2. Le rendu SSR & l'hydratation

### Q2.1 — Pourquoi `renderToPipeableStream` plutôt que `renderToString` ?
**Réponse.** `renderToString` génère **tout** le HTML d'un coup, de façon **bloquante** : le serveur ne renvoie rien tant que toute la page n'est pas rendue. `renderToPipeableStream` **streame** le HTML : il envoie le « shell » (la coquille) dès qu'il est prêt, puis le reste au fil de l'eau.

**Pourquoi c'est mieux.** Meilleur **TTFB** (*Time To First Byte*) et **FCP** (*First Contentful Paint*) : l'utilisateur voit quelque chose plus tôt. C'est aussi compatible avec `<Suspense>` (streaming de morceaux asynchrones).

**Trade-off / nuance honnête.** Dans notre cas on **prefetch les produits AVANT de rendre** (voir Q3.2), donc on attend les données avant le premier octet — ce qui réduit l'avantage du streaming sur cette page précise. On garde quand même le streaming pour le reste du document et parce que c'est l'API moderne recommandée. Une évolution possible : streamer le shell immédiatement et laisser `<Suspense>` streamer la grille produits ensuite.

### Q2.2 — Comment garantissez-vous une hydratation sans mismatch ?
**Réponse.** En rendant **le même arbre React** côté serveur et client. La seule différence est le *routeur* injecté : `StaticRouter` (serveur, connaît l'URL de la requête) vs `BrowserRouter` (client, lit l'URL du navigateur). Cet arbre commun vit dans `App.tsx` ; les deux points d'entrée (`entry-server.tsx`, `entry-client.tsx`) ne font qu'injecter le bon routeur. Voir `src/App.tsx`.

**Ce que ça veut dire.** Si on dupliquait l'arbre (providers, routes) dans chaque entrée, le moindre écart créerait un mismatch. Un seul arbre partagé = garantie structurelle.

### Q2.3 — Le serveur fonctionne en dev ET en prod, comment ?
**Réponse.** Un seul serveur (`server/index.ts`), deux modes via `NODE_ENV` :
- **Dev** : Vite en `middlewareMode`, template lu et transformé à chaque requête, `render` rechargé via `ssrLoadModule` (les modifs de code sont prises en compte sans redémarrage, avec HMR).
- **Prod** : assets statiques servis depuis `dist/client` (avec `compression` + `sirv`), template lu **une seule fois** au démarrage, `render` importé depuis le bundle SSR buildé `dist/server`.

La logique de streaming est **partagée** (`server/ssr.ts`) pour que dev et prod ne divergent pas.

---

## 3. Données, cache & flux SSR

### Q3.1 — Pourquoi TanStack Query (React Query) ?
**Réponse.** C'est une lib de **gestion du cache de données serveur** côté client : déduplication des requêtes, cache avec invalidation, états loading/error standardisés, et surtout un mécanisme **dehydrate/hydrate** taillé pour le SSR.

**Ce que ça veut dire.** Plutôt que de gérer `useState` + `useEffect` + `fetch` à la main (et de tout refetcher), Query met en cache par *clé* (`queryKey`). On prefetch côté serveur, on « sérialise » ce cache dans le HTML, et le client le « réhydrate » → **pas de refetch au premier paint**.

### Q3.2 — Décris le flux de données SSR de bout en bout.
**Réponse.** (voir `src/entry-server.tsx` et `server/ssr.ts`)
1. Le serveur appelle `render(url, { origin })`.
2. `render` crée un **QueryClient par requête**, **prefetch** la query produits (clé `['products']`) en tapant le BFF via `origin`.
3. `dehydrate()` transforme le cache en JSON ; on l'injecte dans le `<head>` sous forme de `<script id="__RQ_STATE__" type="application/json">…</script>`.
4. React rend l'arbre — le cache est déjà chaud, donc la grille produits est **rendue peuplée** côté serveur.
5. Côté client, `entry-client.tsx` lit ce `<script>`, le `JSON.parse`, et le passe en `dehydratedState` → le cache client démarre rempli, **zéro refetch, zéro mismatch**.

### Q3.3 — Pourquoi un QueryClient PAR REQUÊTE côté serveur ?
**Réponse.** Un serveur Node traite plusieurs utilisateurs en parallèle. Un QueryClient **partagé** ferait fuiter les données d'un utilisateur dans le cache vu par un autre. Un client neuf par requête = isolation totale. C'est une règle de sécurité non négociable du SSR.

### Q3.4 — Pourquoi sérialiser l'état dans un `<script type="application/json">` et pas `window.__STATE__ = …` ?
**Réponse.** Un `<script type="application/json">` n'est **pas exécuté** par le navigateur (c'est de la donnée, pas du code). Donc il est compatible avec une **CSP stricte** (`script-src 'self'`) sans avoir besoin d'autoriser le JavaScript inline (`'unsafe-inline'` ou un nonce). On échappe aussi `<` (`<`) pour qu'une chaîne produit contenant `</script>` ne puisse pas « casser » la balise (protection XSS).

### Q3.5 — Pourquoi un BFF, alors que l'API FakeStore est publique ?
**Réponse.** *BFF (Backend For Frontend)* = une petite couche serveur dédiée au front. Ici elle apporte :
- **Cache** centralisé (TTL + stale-while-revalidate + coalescing — voir Q3.6) → moins d'appels à FakeStore, réponses plus rapides.
- **Validation** des réponses upstream avec Zod → si FakeStore renvoie un payload corrompu, on ne le propage pas au front.
- **Point de sortie unique** : le front ne parle qu'au BFF (`connect-src 'self'`), jamais directement à FakeStore. Plus simple à sécuriser et à faire évoluer.

### Q3.6 — Explique la stratégie de cache du BFF.
**Réponse.** (voir `server/bff/cache.ts`)
- **TTL** (*Time To Live*, défaut 60 s) : pendant cette fenêtre, la donnée est « fraîche » et servie sans rappeler FakeStore.
- **SWR** (*stale-while-revalidate*) : passé le TTL, on sert quand même la donnée « périmée » **immédiatement** et on lance une **revalidation en arrière-plan**. L'utilisateur n'attend jamais le réseau pour une donnée déjà connue.
- **Coalescing** (*single-flight*) : si 10 requêtes arrivent en même temps sur un cache froid, on ne déclenche **qu'un seul** appel upstream partagé, pas 10 (évite le *thundering herd*).
- **Invalidation** : temporelle (catalogue public en lecture seule, on ne possède pas de write path) ; un seam `clear()` est exposé pour une invalidation explicite future.

---

## 4. State management du panier

### Q4.1 — Pourquoi Zustand pour le panier ?
**Réponse.** Le panier est un **état global** (partagé entre la PLP, le header, la page panier) qui doit **persister** entre sessions. Zustand est un store minimal, sans boilerplate, avec un middleware `persist` (localStorage) intégré. Plus léger que Redux, suffisant ici.

### Q4.2 — Pourquoi AUSSI XState, en plus de Zustand ? Ça fait deux libs d'état.
**Réponse.** Ils ne gèrent **pas la même chose** :
- **Zustand** = *la donnée* (les articles du panier) + persistance. Source de vérité.
- **XState** = *l'orchestration asynchrone* de l'**optimistic update avec rollback** : la machine modélise explicitement les états `idle → syncing → (success | failure)`.

Le brief demande littéralement « state machines for complex UI states » et « optimistic updates with error rollback ». Une *machine à états* rend ce flux explicite, testable et impossible à mettre dans un état incohérent.

**Ce que ça veut dire.** *Optimistic update* = on met à jour l'UI **immédiatement** (sans attendre le serveur), puis on synchronise ; si le serveur échoue, on **annule** (rollback) en revenant à l'état d'avant. Ça rend l'interface instantanée tout en restant correcte.

### Q4.3 — Comment marche le rollback exactement ?
**Réponse.** (voir `src/features/cart/cartMachine.ts`) Sur une mutation : la machine **capture un snapshot** des items actuels, applique le changement optimiste et le commit au store, puis passe en `syncing` (POST `/api/cart`). Si la sync échoue → transition `failure` qui **re-commit le snapshot** au store (annulation) et expose un message d'erreur (Retry / Dismiss).

### Q4.4 — Pourquoi le store est-il « la source de vérité » et pas la machine ?
**Réponse.** Parce que plusieurs composants peuvent déclencher des mutations, et le panier doit rester cohérent partout. La machine **orchestre** mais **lit la donnée live du store** au moment d'agir (`useCartStore.getState()`), elle ne garde pas sa propre copie comme référence. C'est précisément le bug qu'on a corrigé (voir §9.4) : une machine qui se fie à sa copie interne se désynchronise.

### Q4.5 — Comment la persistance reste-t-elle compatible SSR ?
**Réponse.** `skipHydration: true` sur le middleware `persist` : le store **ne lit pas** localStorage automatiquement. Sur le serveur il n'y a pas de localStorage ; sur le client, on réhydrate **explicitement après** l'hydratation React (`useHydrateCart`). Résultat : serveur et premier rendu client démarrent tous deux à `items: []` (pas de mismatch), puis le panier persisté se réconcilie un tick plus tard, côté client uniquement. C'est un trade-off **assumé et documenté**.

---

## 5. TypeScript & le contrat partagé

### Q5.1 — Pourquoi TypeScript strict (et `noUncheckedIndexedAccess`) ?
**Réponse.** Le brief évalue « type-safe architecture ». Le mode strict + `noUncheckedIndexedAccess` (qui force à traiter `array[i]` comme potentiellement `undefined`) attrape des bugs à la compilation. Ça nous a d'ailleurs forcés à écrire du code plus robuste (ex. l'accès aux classes CSS Modules).

### Q5.2 — Pourquoi Zod, et pourquoi dans `/shared` ?
**Réponse.** *Zod* = validation de schéma à l'exécution. On définit le schéma `Product` **une seule fois** dans `shared/types.ts` ; on en **dérive le type TypeScript** (`z.infer`) ET on **valide les réponses** de FakeStore à l'exécution côté BFF. Un seul schéma = pas de divergence entre « le type que je crois » et « la donnée réelle ». `/shared` parce que c'est le **contrat** entre le front et le back (les deux l'importent).

**Ce que ça veut dire.** TypeScript ne vérifie qu'à la **compilation** ; il ne sait pas ce que renvoie vraiment une API à l'exécution. Zod comble ce trou en validant la donnée réelle à la frontière réseau.

---

## 6. Sécurité

### Q6.1 — Quels headers de sécurité, et pourquoi seulement en prod ?
**Réponse.** (voir `server/security.ts`) En prod : **CSP**, `Strict-Transport-Security` (HSTS), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`. En **dev**, la CSP est désactivée car Vite/react-refresh ont besoin de scripts inline et d'`eval` pour le HMR — une CSP stricte casserait le dev.

### Q6.2 — Détaille la CSP.
**Réponse.** `default-src 'self'` (tout vient de notre origine par défaut) ; `script-src 'self'` (pas d'inline exécutable — possible grâce au transport JSON, voir Q3.4) ; `img-src 'self' https://fakestoreapi.com data:` (les images produits viennent de FakeStore) ; `connect-src 'self'` (le front ne parle qu'au BFF) ; `frame-ancestors 'none'` (anti-clickjacking) ; `object-src 'none'`, `base-uri 'self'`, `upgrade-insecure-requests`.

**Ce que ça veut dire.** *CSP (Content-Security-Policy)* = une liste blanche qui dit au navigateur d'où il a le droit de charger scripts, images, etc. C'est la principale défense contre le XSS.

---

## 7. Tests

### Q7.1 — Quelle stratégie de tests ?
**Réponse.** Pyramide de tests avec **Vitest** en workspace à deux environnements : projet `server` (node) pour le BFF, projet `web` (jsdom) pour le front. On a priorisé les **frontières critiques** (pas le happy path uniquement) :
- panier : **rollback** sur échec de sync (add/remove/setQuantity) ;
- BFF : **API indisponible → 5xx propre sans fuite de stack**, cache SWR + coalescing, validation Zod ;
- logique pure (réducteurs, totaux, formatage) ; rendu SSR peuplé.

92 tests au total.

### Q7.2 — Pourquoi pas 100 % de couverture ?
**Réponse.** La couverture utile n'est pas un chiffre, c'est **couvrir les chemins risqués**. On teste la logique métier et les frontières (réseau, erreurs, rollback) ; on ne teste pas les composants purement présentationnels sans logique. Tester ce qui peut casser, pas ce qui est trivial.

---

## 8. Performance & accessibilité

### Q8.1 — Quelles optimisations de perf ?
**Réponse.** SSR avec données (premier paint utile), **CSS Modules** (zéro runtime CSS, scoping statique), images **dimensionnées** (`width`/`height` → pas de **CLS**), `loading="lazy"` hors viewport + `fetchPriority="high"` sur la première rangée (meilleur **LCP**), cache BFF. À venir (Phase 3) : code splitting par route et mesure Web Vitals.

**Ce que ça veut dire.** *CLS (Cumulative Layout Shift)* = les sauts de mise en page pendant le chargement. *LCP (Largest Contentful Paint)* = le temps d'affichage du plus gros élément. Ce sont deux *Core Web Vitals* (métriques Google).

### Q8.2 — Pourquoi CSS Modules plutôt que Tailwind ou styled-components ?
**Réponse.** *styled-components* = CSS-in-JS avec un coût runtime (génération de styles au rendu), mauvais pour le SSR/perf. *Tailwind* = bon mais ajoute une étape de build et de la verbosité dans le markup. *CSS Modules* = CSS classique avec scope automatique (pas de collision de noms), **zéro runtime**, parfait pour un objectif perf. Choix orienté performance.

---

## 9. Problèmes rencontrés (et comment je les ai résolus)

> Section clé : un senior sait parler de ses bugs. Chacun illustre un piège réel du SSR custom.

### 9.1 — Boucle de redémarrage du serveur de dev
**Symptôme.** `npm run dev` ne répondait jamais (`status 000`), le serveur redémarrait en boucle.
**Cause.** `node --watch` surveillait **tout** l'arbre de fichiers atteint, y compris ce que Vite écrit dans `node_modules/.vite` (cache d'optimisation des dépendances). Vite écrit → watch redémarre → Vite ré-écrit → boucle infinie.
**Fix.** Restreindre la surveillance à nos sources : `--watch-path=./server --watch-path=./shared`. Vite gère déjà le HMR de `/src`.
**Leçon.** Le tooling d'un SSR maison a des pièges que les frameworks cachent.

### 9.2 — Double application de l'optimistic update
**Symptôme.** Ajouter 1 article mettait le badge à **2**.
**Cause.** Dans la machine XState, l'action `commitItems` recalculait `applyMutation(context.items, …)` alors que l'`assign` précédent avait **déjà** muté `context.items` — en XState v5, les params d'une action lisent le contexte déjà mis à jour. La mutation était donc appliquée deux fois.
**Fix.** Committer le `context.items` déjà calculé, sans le re-dériver.
**Leçon.** Bien comprendre l'ordre d'évaluation `assign` → params d'action dans XState v5.

### 9.3 — Le panier vide rejeté en 400 (bug du « Remove » du dernier article)
**Symptôme.** Retirer le dernier article affichait « Cart sync failed: 400 » et l'article réapparaissait.
**Cause.** Le endpoint `POST /api/cart` synchronise l'**état complet** du panier ; son schéma Zod exigeait `min(1)` article. Vider le panier envoyait `{ items: [] }` → 400 → la machine interprétait ça comme un échec → rollback (l'article revenait).
**Fix.** Un panier vide est un état **légitime** → retirer le `min(1)` (en gardant la borne max).
**Leçon.** Un test vert ne vaut que si l'**attendu** est juste : le test couvrait ce cas mais assertait le mauvais comportement. D'où l'importance de tester aussi dans le vrai navigateur.

### 9.4 — Le panier qui « revient à 1 » en changeant de produit (race condition)
**Symptôme.** Ajouter depuis un produit, puis depuis un autre → le panier ne s'additionnait pas, retombait à 1 ; aléatoire.
**Cause.** Chaque `ProductCard` monte **sa propre** machine XState. Le `context.items` de chaque machine était figé au montage (souvent `[]`) et jamais resynchronisé avec le store. Ajouter depuis une 2ᵉ carte calculait l'optimistic depuis ce contexte périmé → **écrasait** le panier.
**Fix.** La machine lit désormais les items **live du store** (`getState()`) passés dans l'événement, jamais sa copie interne. Le store est l'unique source de vérité.
**Leçon (à verbaliser).** Une donnée dupliquée dans deux endroits finit par diverger. Limitation restante assumée : il y a une machine par carte ; l'idéal serait **une machine partagée** (provider React) pour sérialiser les mutations concurrentes.

### 9.5 — Config Tailwind « fantôme » qui polluait le build
**Symptôme.** Un warning Tailwind apparaissait alors qu'on n'utilise pas Tailwind.
**Cause.** Vite/PostCSS remonte l'arborescence et avait trouvé un `postcss.config.js` (+ Tailwind) dans le dossier **home** de l'utilisateur.
**Fix.** Épingler une config PostCSS explicite (vide) dans `vite.config.ts` pour stopper la recherche dans les dossiers parents.
**Leçon.** Un projet doit être **hermétique** : ne pas hériter d'une config globale traînant sur la machine. Critère « reproducible setup » du brief.

---

## 10. Questions « méta » probables en interview

### Q10.1 — Si tu devais passer ce projet à l'échelle (1000 produits, fort trafic), que changes-tu ?
**Réponse.** **Virtual scrolling** sur la PLP (ne rendre que les cartes visibles), **pagination/infinite scroll** côté BFF, **code splitting** par route, cache BFF distribué (Redis) au lieu d'en mémoire, **streaming SSR avec Suspense** pour ne pas bloquer sur le prefetch, et une **machine panier unique** partagée.

### Q10.2 — Pourquoi cette séparation `/src`, `/server`, `/shared` ?
**Réponse.** Frontière nette : `/src` = front (React), `/server` = SSR + BFF (Node), `/shared` = le **contrat** (types Zod) que les deux importent. Ça force à expliciter l'interface entre front et back et évite le couplage accidentel.

### Q10.3 — Qu'est-ce que tu n'as PAS fait, et pourquoi ?
**Réponse.** Pas de service worker / offline (lourd, fragile, chevauche le cache BFF — mauvais ratio effort/risque pour le périmètre), pas de meta-framework (interdit + perte de démonstration), pas de machine panier unique (limité le risque sur le MVP, documenté comme évolution).

---

*Ce document alimentera le README final (Phase 4).*
