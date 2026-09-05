# Studio efficienza LLM — Fenice (settembre 2026)

Studio prodotto da 4 subagenti specializzati (anatomia del contesto, economia tool-result/compaction,
cache e request economics, scan upstream/esterno) più sintesi manuale. Evidenze come `file:line`.
Stime: 1 token ≈ 4 char; payload JSON-heavy possibili sottostime fino a ~30%. Nessun dato inventato:
dove la verifica non era possibile è dichiarato.

## Stato attuale (cosa il fork GIÀ fa — non riproposto)

Micro-compaction inline + spill store con `[compaction_pointer: <id>]`; `maxToolResultChars` (32.768);
summary compaction (`compaction-basic`, threshold 0.8/retain 0.16) + tool-result-pruner (8192/4096/1024);
token-meter; tier router per complessità task + self-healing; fallback cascade/circuit breaker; packed
session history; session format v2; per-model reasoningEffort editor; `LlmCallConfig` freeze/epoch per la
prompt-cache; budget immagini (pixel/bytes); runtime-context delta-only (emesso solo quando cambia).

## Mappa del costo di una richiesta (profilo headless, 24 tool)

| Componente | tok/request | Note |
|---|---|---|
| Identity + persona | ~40 | snello |
| Sezioni guida per-tool (17) | ~1.050 | `system-prompt` |
| Schemi tool (24) | ~5.720 | workflow 983, str_replace_editor 763, bash 441, todo 292, subagent 270 |
| **Fisso totale** | **~6.800** | pago a ogni request |
| Runtime-context snapshot | ~100 | solo on-change, dedup |
| Skill catalog | ~120 + 125×N skill | cap 500 char/desc |
| agent-instructions (AGENTS.md) | fino a 16.400 | budget 64 KiB, head-only |
| Storia (tutta la surface) | crescente | mitigata da pruner/compaction |
| PTC mode (opt-in) | SDK ~7.184 | più costoso del nativo che sostituisce a 24 tool |
| Preset cordis (opt-in) | ~3.700 | sezione 10.2k char + 4 tool |

## Insight trasversale chiave

Con il context caching automatico DeepSeek (hit ≈ 1/31 del prezzo miss; finestre 1M), la gerarchia
economica cambia: **un token in cache costa così poco che conviene proteggere la stabilità del prefisso
e comprimere meno aggressivamente**, mentre restano costosi i token *output* (reasoning) e la massa dei
tool result nei turni in cui sono freschi. Le due leve dominanti sono quindi: (1) hit-rate della cache,
(2) massa tool-result — in quest'ordine. La summary compaction stessa è ora un costo (busta l'intera
cache) da usare tardi, non presto.

## P0 — Quick win (config-only, giorni, rischio minimo)

1. **Accendere `promptCacheStablePrefix`** (`packages/llm/llm-pi-ai/src/lab.ts:73`, flag testato ma
   OFF; contenuti: sort tool per nome, canonicalizzazione ricorsiva delle chiavi JSON Schema, CRLF,
   fingerprint). Evita i bust sporadici tra restart/merge config. Impatto: evita re-miss integrali
   ($0.018/turno su flash a 40k tok); è il moltiplicatore di tutte le altre voci. Sforzo S.
2. **Cap web fetch 200k → ~32k char con taglio head/tail** (`packages/web/tool-web/src/index.ts:34`,
   taglio head-only in `fetch.ts:265-291` → head 70%/tail 30%). Un solo fetch grande pesa 50k tok nel
   log per sempre (il pruner taglia solo a 8.192+). 5 fetch/sessione ≈ −200k tok di massa. Sforzo S.
3. **Pruner tool-result per-step, fuori dalla compaction** (`compaction-basic/src/index.ts:305-312`
   esegue `pruneSession()` solo dentro `compactIfNeeded`; è model-free e replay-safe:
   `compaction-tool-result-pruner/src/index.ts:136-184`). Massa tool-result −57% in sessioni ricche di
   fetch/letture; raddoppia il runway prima della summary compaction. Sforzo S.
4. **Configurare `modelPolicies` per `compaction-basic`** (implementato, mai configurato:
   `base/cordis.patch.yml:326-328`; nota `2026-07-20-routed-model-context-and-compaction-policy.md`):
   riassuntore su tier economico, cap output, retry. Con finestre 1M valutare threshold ≥ 0.8 (v. insight). Sforzo S.
5. **Off-peak scheduling per headless/jobs** — tariffa DeepSeek dimezzata in certe fasce UTC
   (ufficiale, fonti sotto). ~50% su tutte le voci per run schedulati. Sforzo S (cron). Rischio nullo.
6. **Skill catalog: cap 500→200 char/desc + unificare la prose ripetuta**
   (`skill/tool-skill/src/index.ts:27,254-300`). −75 tok/request ogni 10 skill. Sforzo S.

## P1 — Piccolo codice, alto valore

7. **Differire le famiglie tool "lontane"** (workflow, ralph, goal): schema+sezione solo on-demand
   (pattern già esiste con `read_image`/`ToolRestriction`). ~1.9-2.1k tok/req (−30% del fisso).
   `tool-workflow/src/index.ts:137-214`, `tool-goal/src/index.ts:112-191`. Sforzo M.
8. **Rimuovere `str_replace_editor` dal base** (read/write/edit coprono tutto; preset compat lo
   rimonta): −763 tok/req. `fs/tool-str-replace-editor`, `base/cordis.patch.yml:424-426`. Sforzo S.
9. **Gate pwsh su win32**: −570 tok/req su POSIX. `shell/tool-pwsh/src/index.ts:119-120`. Sforzo S.
10. **Canonicalizzare gli schema tool alla registrazione** (portare la canonicalizzazione del flag lab
    nel default di `dsh-tools`): stabilità garantita su tutti i path, non solo pi-ai.
    `system-prompt/src/index.ts:286` vs `llm-pi-ai/src/context.ts:200-214`. Sforzo S/M.
11. **Budget wire progressivo per età del tool result** (ultimi 2 turni 32k, oltre 8k, oltre 10 turni
    4k — solo a livello wire, log intatto): −50-75% sulla massa vecchia. `context.ts:75`. Sforzo M.
12. **Retrieval dei compaction pointer**: estendere `session_event_read`
    (`session-query/tool-session-query/src/index.ts:109`) per risolvere `[compaction_pointer: <id>]`
    all'evento originale, poi enabling di default del flag (`lab.ts:96`). Rende sicuro abbassare il
    budget wire. Sforzo M.
13. **Deduplicare la guida sezione↔description** (subagent/jobs/goal ripetono le stesse regole):
    −150-250 tok/req e niente istruzioni doppie divergenti. Sforzo S.

## P2 — Strutturali / flag-gated (valutare caso per caso)

14. **Tombstone per risultati superati** (stile Anthropic context editing: rilettura stesso file,
    comando rieseguito → tombstone di 1 riga + puntatore): −1.3k tok per risultato vs prune attuale.
    Rischio: euristica di "superseded" da tenere conservativa. Sforzo M.
15. **Drop del `reasoning_content` storico sui turni non-tool-call** dopo K turni
    (`llm-deepseek/src/serialize.ts:225-234` rispedisce tutto per protocollo): −30-100k tok/request su
    sessioni reasoner lunghe. Rischio medio-alto (protocol API, 400 senza passback sui turni tool —
    solo flag-gated e testato per gateway). Sforzo M/L.
16. **Dedup byte-level dei risultati identici consecutivi**: −10-20% della massa tool-result nel
    coding. Sforzo M.
17. **GC dello spill store** (`spill.ts:139-146` oggi senza eviction). Igiene, S.
18. **PTC SDK prompt slimming**: istruzioni fisse ~1.5-2k tok + output-map di TUTTI i tool; a 24 tool
    la PTC costa più del nativo. Emettere l'output-map solo per i tool sub-dispatchati.
    `core/tools/src/ts-types.ts:297-315`. Sforzo M.
19. **`semanticMemory`** (flag dichiarato "(coming soon)" in `lab.ts:38`) su embeddings + session-query:
    recupero cross-session senza ricaricare history. Progetto L.
20. **Montare il tool `session-query` + `openAt: first-search`** (`base/cordis.patch.yml:129-133`,
    oggi opt-in spento): l'agente interroga le sessioni passate invece di ricaricare contesto. S/M.

## Cosa NON fare (peggiorerebbe le prestazioni)

- **Non abbassare ciecamente `reasoningEffort`** di default: i reasoning token dominano il costo con i
  tool loop, ma `max`→`low` degrada i task complessi. Default `high`, `low` solo per superfici non-code,
  `max` opt-in (nessun benchmark nel repo: procedere con misurazioni via token-meter).
- **Non anticipare la summary compaction**: con hit a 1/31 e finestre 1M, compattare presto costa più
  del contesto extra (ogni compaction ri-missa integralmente la storia). Meglio pruner model-free +
  prefissi stabili, compaction tarda.
- **Non introdurre paginazione model-facing** (`head_limit`/`offset` nei tool schema): rifiutata per
  decisione documentata (`2026-07-06-tool-result-retention-library.md:141,157`), i budget da config +
  spill coprono.
- **Non rompere il passback `reasoning_content`** sui turni tool (l'API risponde 400).

## Stima aggregata (scenario: sessione agent 20 turni, contesto medio 40k)

- Senza cache: ~800k input tok → flash peak ≈ $0.35. Con prefisso stabile ~90% hit ≈ $0.045 (7.8×).
- P0+P1 (masse tool-result e fisso): −30-50% dei token effettivi per request nelle sessioni ricche di
  fetch/letture, −20-30% del fisso nei profili con famiglie differite.
- Off-peak: −50% su tutte le voci per i run schedulati.

## Fonti esterne (verificate settembre 2026)

- Pricing DeepSeek (flash: hit $0.014 / miss $0.44 /1M peak; pro: hit $0.044 / miss $1.32; off-peak −50%):
  https://api-docs.deepseek.com/quick_start/pricing/
- Context caching automatico (best-effort, prefisso, usage fields): https://api-docs.deepseek.com/guides/kv_cache/
- Thinking mode (reasoning_effort low|high|max, default high; temperature ignorata in thinking):
  https://api-docs.deepseek.com/guides/thinking_mode/
- Context editing (Anthropic, tecnica di riferimento per i tombstone):
  https://platform.claude.com/docs/en/build-with-claude/context-editing
- Effective context engineering (Anthropic engineering):
  https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

---

# Addendum — Allineamento alla visione multi-provider

Fenice non è un harness DeepSeek: è un harness per **tutti gli LLM**, con massime prestazioni e
risparmio token *a parità di prestazioni*. Ogni proposta dello studio è stata riclassificata con il
**test di neutralità**: (a) il risparmio è nel *payload* → valido identico su qualunque provider;
(b) il *meccanismo* è universale ma i *parametri* sono policy per-provider; (c) è provider-specific
→ non fa parte del core.

## (a) Neutre per costruzione — il cuore del roadmap

Fetch cap 32k, pruner per-step, budget wire per età, tombstone, dedup risultati, differimento tool
lontane, rimozione `str_replace_editor`, gate pwsh, dedup guida, skill catalog cap, PTC slimming,
spill GC, session-query, semanticMemory, budget agent-instructions. Riducono i token *del messaggio*,
che qualunque provider fattura; nessuna dipende da pricing o meccaniche DeepSeek.

## (b) Meccanismo universale, parametri per-provider

- **Stabilità del prefisso** resta la leva #1 per TUTTI: DeepSeek (automatica), OpenAI (automatica),
  Google (implicita+esplicita), Bedrock — tutte hanno prefix caching; Anthropic la vuole *esplicita*.
  Il lavoro universale è: (1) prefisso byte-stabile (canonicalizzazione schema alla registrazione,
  non solo dietro flag lab), (2) emettere i **marker dove il provider li chiede** — pi-ai ha già
  `cacheRetention`/`cache_control` ma manca il posizionamento strategico dei breakpoint
  (fine system / fine tools / ultimo punto stabile).
- **Telemetria cache unificata**: il mapping degli usage fields esiste già per provider
  (`llm-deepseek/src/translate.ts:48-66` → `cacheReadTokens`); serve esporre l'**hit-rate e il
  fingerprint del prefisso in token-meter/session-query** così l'efficienza è misurabile su ogni
  route, non solo DeepSeek.
- **`modelPolicies` + tier router** = routing multi-provider: riassuntore economico e mapping
  complessità→route su QUALSIASI mix di provider, non solo deepseek/alibaba. È il pezzo che
  realizza "massime prestazioni a minor costo" indipendentemente dal vendor.
- **Effort/reasoning per-modello**: il modello dati è già neutro (`LlmModelReasoningInfo`,
  `thinkingLevelMap` per wire spelling per modello — v. editor appena fatto). La *policy*
  (default `high`, `max` opt-in, `low` per superfici non-code) va espressa come default per-route
  nel config, mai nel core.

## (c) Provider-specific — fuori dal core

Off-peak scheduling e le stime in dollari dello studio sono DeepSeek-only: restano valide come
*illustrazione* e come eventuale policy plugin di costo (cost calendar), non come comportamento
dell'harness.

## Il meccanismo che garantisce "a parità di prestazioni"

Il corpus snapshot keyless già replaya sessioni complete con output attesi. L'aggiunta decisiva:
**metriche di efficienza per scenario** (tok/turno, massa tool-result, hit-rate stimata dal token-meter)
affiancate agli output attesi — così ogni PR di ottimizzazione dimostra nel gate stesso il risparmio e
l'assenza di regressioni, su ogni provider registrato nel corpus. È ciò che trasforma il risparmio da
promessa a proprietà verificata.

## Priorità rivista (visione multi-provider)

1. Canonicalizzazione schema alla registrazione (universale) — era P1, ora P0.
2. `promptCacheStablePrefix` ON + posizionamento cache markers per provider (Anthropic esplicito).
3. Fetch cap, pruner per-step, budget per età, tombstone (payload-neutral, invariati).
4. `modelPolicies` + tier router come routing multi-provider documentato e configurato nei bundle.
5. Metriche di efficienza nel corpus snapshot come gate di non-regressione.
6. Effort/reasoning default per-route via settings (policy, non core).
7. Off-peak/cost calendar come plugin opzionale provider-specific.
