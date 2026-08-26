# Fenice — fork di DeepSeek Harness: cosa cambia rispetto all'upstream

> **Nome adottato**: **Fenice** (rinascita dopo il guasto = cascata + breaker + sanitize).
> **Base**: upstream `master` @ `141eb6fef8` (release `dsh-0.1.0-rc.8`, PR #2783).
> **Stato**: working tree con modifiche pronte per commit; tutte le suite toccate sono verdi
> (suite toccate **996/996** su 58 file, oxlint full-repo **0/0** su 2622 file, `tsc -b` host+client **exit 0**,
> translation-pairing **986 coppie OK**, catalogo config sincronizzato).
>
> Questo documento è la mappa completa delle differenze. L'upstream resta intatto nel
> remote `origin`: un `git fetch origin && git log HEAD..origin/master` mostra sempre
> cosa l'upstream ha fatto da noi.

---

## 1. Panoramica

| Area | Upstream rc.8 | Questo fork |
|---|---|---|
| Resilienza provider | Nessun fallback | Cascata automatica con eligibility, single-flight, anti-ciclo, circuit breaker opzionale |
| Sicurezza output | Assente | Sanitizzatore streaming marker-based, JSON-safe sugli argomenti tool |
| FinOps contesto | Assente | Micro-compaction degli output tool con soglia configurabile |
| Chat UI | Solo copia+fork | Edit-and-regenerate reale, delete per turno, i18n completa |
| Impostazioni Modelli | — | Campi fallback/budget con guardie, datalist, warning route sconosciuta |
| Lingue | zh / en | **7**: zh, en, it, de, es, fr, ja (rollout incrementale con fallback EN) |
| Sperimentazione | — | Namespace `agent-lab`: 10 flag + telemetria JSONL esterna |
| Ouroboros | — | `.ouroboros/mechanical.toml` con comandi scoped per Stage-1 |

---

## 2. Resilienza LLM: cascata di fallback + circuit breaker

File: `packages/llm/llm-pi-ai/src/{adapter,config}.ts`

- **Cascata automatica**: se una rotta fallisce *prima di emettere token*, la richiesta
  viene servita dal provider/modello di riserva (`fallbackProvider`/`fallbackModel`
  nel profilo). I token già emessi non vengono mai riemessi (single-flight).
- **Eligibility**: cascatano solo i guasti transitori (`RATE_LIMIT`, `SERVER`,
  `TIMEOUT`, `TRANSPORT`). Auth, quota, context-overflow, richieste invalide e abort
  non cascatano: falliscono rumorosi dove è giusto che falliscano.
- **Anti-ciclo**: `resolveProfiles` respinge alla scrittura self-fallback, cicli mutui
  (A→B→A) ed edge verso rotte inesistenti. A runtime un set condiviso `visits`
  impone "ogni rotta al massimo una volta per richiesta".
- **Circuit breaker** *(flag `agent-lab.circuitBreaker`)*: 3 guasti eleggenti in 60s
  aprono la rotta per 30s — le richieste successive saltano il primario (codice
  `BREAKER_OPEN`). Successo pulito = reset. Mezzo-aperto con sonda singola.
- **Telemetria**: ogni hop passa dall'hook `onFallback` (log strutturato) e, con
  `cascadeMetrics`, nel file JSONL esterno.
- **Reasoning-effort aliasing**: scala condivisa `max↔high↔xhigh` tra cataloghi che
  nominano livelli diversi (un'unica funzione, niente duplicazione).

## 3. Sanitizzazione real-time dei proxy envelope

File nuovi: `packages/llm-pi-ai/src/sanitize.ts` (+ `tests/sanitize.spec.ts`)

I router proxy (TokenRouter, BluesMinds, …) iniettano blocchi telemetria tipo
`<details><summary>…Response ID…`. Tre regole di design:

1. **Solo contenuto con marker** (`Response ID|Request ID|Raw Model|Provider ID`)
   viene rimosso — i `<details>` legittimi dell'assistente passano intatti.
2. **Argomenti tool mai riscritti**: lo scanner JSON individua la fine del valore
   top-level rispettando stringhe ed escape; tutto ciò che segue è spazzatura del
   router e viene tagliato. Un payload valido torna byte-identico.
3. **Scan lineari** ovunque: nessun quantificatore annidato ⇒ niente ReDoS.

Integrazione: delta di testo/ragionamento in streaming (`StreamDeltaSanitizer`),
blocchi finalizzati (`sanitizeBlockText`) e argomenti serializzati
(`sanitizeToolArguments` in `stream.ts`).

## 4. Micro-compaction degli output tool (FinOps)

File: `packages/llm-pi-ai/src/context.ts`

Oltre la soglia `maxToolResultChars` (default 32.768, configurabile per profilo e
dall'UI) un risultato inline viene compattato: 45% testa + marcatore con caratteri
omessi + 45% coda. Cablata in **entrambi** i percorsi (text-only e con immagini);
la struttura multimodale passa integra. La soglia è validata in resolution
(positive integer) e modificabile dalle Impostazioni.

## 5. Chat UI: azioni reali sui messaggi

File: `ui-conversation/src/client/chat/*`, `contract/slots.ts`, `apply.ts`

- **Edit** (`forkAtPrefill`): fork ancorato al turno *precedente* (il cut del fork è
  a granularità turno) + prefill del prompt originale nel composer della sessione
  figlia → modifica-e-rigenera vero.
- **Delete**: fork che esclude il turno intero.
- **Branch** resta tail-only (semantica upstream ripristinata, guardia
  `branchUnavailable` inclusa).
- Limitazione nota e commentata: il primo turno di una conversazione non può
  produrre un figlio vuoto — Edit/Delete degradano a copia.
- i18n completa (niente stringhe hardcoded); classe layout `css.actions`
  ripristinata; bottone del TurnError fuori dalla live-region.

## 6. Impostazioni Modelli

File: `ui-settings-models/src/client/{ProviderEditor,ModelsSection,locales}.{ts,tsx}`

Nuovi campi per-profilo pi-ai: `fallbackProvider` (con datalist delle altre rotte +
warning live su route sconosciuta), `fallbackModel`, `maxToolResultChars`
(min=1, clear su valori invalidi). Scope limitato alla famiglia `pi-ai`; parità
EN/ZH imposta dai tipi.

## 7. Localizzazione: 7 lingue con rollout incrementale

File: `client/locale/src/**`, dizionari `.rollout.ts` in 21 pacchetti UI

- `LOCALE_IDS = [zh, en, it, de, es, fr, ja]`; picker, detection browser
  (primary subtag, `fr-CA→fr`) e `<html lang>` aggiornati.
- **Contratto di registrazione**: zh/en obbligatori (invariante bilingue),
  rollout opzionali — le chiavi mancanti cadono sul fallback EN per namespace.
  Coprire nuove superfici non blocca una release.
- Tradotte e verificate dal compilatore: copertura completa estesa a 21 pacchetti UI
  (oltre 2.500 stringhe × 5 lingue di rollout).

## 8. Agent-Lab: flag, telemetria esterna, bench

File: `llm-pi-ai/src/{lab,telemetry}.ts`, `ui-settings-agent-lab/**`, wiring in `index.ts`

- Namespace settings **`agent-lab`** con 10 flag; zh/en-style defaults; lettura
  *live* per richiesta.
- **Interfaccia utente dedicata**: `@deepseek-ai/dsh-client-ui-settings-agent-lab`
  con interruttori per i 10 flag e descrizioni bilingui/rollout.
- **Telemetria esterna**: JSONL in `~/.dsh-agent-lab/telemetry/events.jsonl`
  (override `DSH_AGENT_LAB_DIR`) — eventi `turn` (token, cache-read, latenza,
  esito, `prefixHash`) e `fallback` (hop con codice/messaggio). Append crash-safe.
- **Bench runner esterno** (fuori dal repo): `I:\DSH-Workspaces\agent-lab\run-bench.mjs`
  — N task × due fasi (OFF/ON) sotto guasti iniettati, check qualità
  deterministici, report `report.md`/`report.json`. Modalità `--selftest`
  completamente offline. Evidenza selftest corrente: successi **10/15 → 15/15**,
  qualità **10/15 → 15/15**, **12 skip** del primario via breaker, **3 hop**.
- `promptCacheStablePrefix` *(implementato)*: ordine strumenti deterministico
  (`stableToolOrder`) + impronta `prefixHash` in telemetria per misurare la
  stabilità del prefisso invece di presumere la cache-hit rate.

## 9. Toolchain

- `scripts/build.ts`: gestione completa `npm_execpath` su Windows (`.exe` nativo,
  entry JS sotto node, shim `.cmd/.bat` via cmd.exe `/d /s /c`).
- `.ouroboros/mechanical.toml`: comandi Stage-1 scoped (`build:lib:host`,
  vitest sul pacchetto, oxlint diretto) — i gate full-monorepo non stanno in un
  timeout di verifica; `verify_command_timeout_seconds: 600 → 1800`.

---

## Aggiornare dall'upstream

```bash
git fetch origin
git log --oneline HEAD..origin/master     # cosa è nuovo là
git merge origin/master                    # o rebase, a gusto
```

Conflitti attesi quasi solo nei file elencati sopra (§2–§8): sono tutti aggiunte
localizzate o funzioni nuove, quindi il merge tende a essere meccanico. Dopo il
merge rieseguire: `pnpm run typecheck && pnpm exec vitest run packages/llm/llm-pi-ai
packages/client/locale packages/client/ui-conversation packages/client/ui-settings-models
&& pnpm run lint:contracts-ready`, più `gen-config-catalog` /
`verify-translation-pairing` se si toccano schema o README.

## Non ancora incluso (flag presenti, implementazione futura)

`promptCacheStablePrefix` è ora reale; restano inertì fino a wiring:
`compactionPointer` (marker→spill store), `tierRouter`, `sessionTruncate`
(serve API host di troncamento), `mcpServer`, `semanticMemory`, `selfHealingLoop`.
Ognuna ha descrizione nel proprio flag e nessun effetto finché non cablata.

## Identità del fork (proposta)

Nome candidato principale: **Fenice** (rinascita dopo il guasto = cascata +
breaker + sanitize). Alternative e criteri: vedere la discussione di accompagnamento;
verificare disponibilità npm/GitHub prima di adottare (es. `npm view <nome>`).
