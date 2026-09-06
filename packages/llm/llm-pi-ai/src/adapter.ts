/**
 * Generic pi-ai-backed implementation of the Harness LLM seam.
 *
 * Each resolution produces one **immutable** snapshot — the profiles plus a
 * `Models` collection holding the `Provider` each route built — and an
 * operation captures a whole snapshot before its first `await`. A
 * configuration change builds a *new* collection rather than mutating the one
 * in use, because `Models.streamSimple()` is lazy: it resolves the provider
 * when the stream is first consumed, which is after the credential await, so a
 * mutated collection would let a request that started under one configuration
 * finish under another — or fail with a provider that no longer exists. This is
 * what makes the seam's per-step call freeze (`llm.prepareCall()`) hold all the
 * way down: switching models mid-reply takes effect on the next step, never
 * inside the one in flight.
 *
 * A route naming a credential reference still resolves it through the harness
 * seam and passes it as the request's `apiKey` option, which pi-ai treats as
 * the highest-priority auth override — that is what keeps the fail-loud
 * reference semantics. Everything that override does not cover reaches pi-ai
 * through the collection's own auth: the credential store holds the records a
 * login wrote and a refresh rotates, and the auth context answers the ambient
 * questions a provider asks while resolving. Both are stable across snapshots,
 * so a configuration change rebuilds the collection without forgetting who is
 * signed in.
 *
 * @module dsh-llm-pi-ai/adapter
 */

import { createModels, getSupportedThinkingLevels } from '@earendil-works/pi-ai'
import type {
  Api,
  AuthContext,
  Context as PiAiRequestContext,
  CredentialStore,
  Model,
  Models,
  ModelThinkingLevel,
  MutableModels,
  SimpleStreamOptions,
  ThinkingLevel,
} from '@earendil-works/pi-ai'
import {
  attributionHeaders,
  contentHasImage,
  LlmAdapter,
  LlmError,
  ReasoningEffortId,
} from '@deepseek-ai/dsh-llm'
import type {
  GenerateOptions,
  ImageAttachmentAccess,
  LlmModelInfo,
  LlmProviderInfo,
  LlmResolvedModelInfo,
  PreparedAdapterCall,
  ReasoningEffortId as ReasoningEffortIdType,
  ResolvedRetryPolicy,
  StreamChunk,
} from '@deepseek-ai/dsh-llm'
import type { AttachmentStore, ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { idleWatchdog, timeoutOf } from '@deepseek-ai/dsh-timeout'
import type { AgentLabFlags } from './lab.ts'
import type { ResolvedPiAiProviderProfile } from './config.ts'
import { normalizeSystemPrompt, prefixFingerprint, stableToolOrder, toPiContext } from './context.ts'
import { CompactionSpillStore, defaultCompactionSpillStore } from './spill.ts'
import { classifyPiAiError, toStreamChunks } from './stream.ts'
import { routeTier, type TaskComplexityReport } from './tier-router.ts'

/** One resolution's frozen view: the profiles and the collection built from them. */
interface PiAiSnapshot {
  /** The resolved profiles this collection was built from, used as its identity. */
  profiles: ReadonlyMap<string, ResolvedPiAiProviderProfile>
  /** Providers for exactly those profiles; never mutated once published. */
  models: Models
}

/** Constructor options for {@link PiAiAdapter}: the two resolution hooks the plugin owns. */
export interface PiAiAdapterOptions {
  /** Current validated profiles by provider route; called once per operation. */
  profiles: () => ReadonlyMap<string, ResolvedPiAiProviderProfile>
  /**
   * Resolve the credential for one already-resolved profile; called once per
   * stream call and frozen for that call. `undefined` defers to the route's own
   * pi-ai auth, which for an installed catalog route is its provider-native
   * ambient discovery; the plugin allows that only for a profile naming no
   * credential at all, because a named reference that misses throws `LlmError`
   * `MISSING_CREDENTIAL` rather than falling back.
   */
  resolveApiKey: (provider: string, profile: ResolvedPiAiProviderProfile) => Promise<string | undefined>
  /**
   * How every collection this adapter builds resolves auth the request-level
   * `apiKey` override does not cover. Required rather than optional: a
   * collection built without them gets pi-ai's in-memory default store, which
   * is empty at every boot and discarded on every configuration change, so a
   * route whose only method is a login would report itself unconfigured on
   * every request no matter how often the human signed in.
   */
  auth: PiAiAuthInjection
  /** Resolve the optional durable attachment service at request time. */
  resolveAttachments?: () => AttachmentStore | undefined
  /** Bridge one attachment reference into the current model-tool execution world. */
  resolveImageAccess?: (attachments: AttachmentStore, ref: ImageAttachmentRef) => ImageAttachmentAccess | undefined
  /**
   * Observe one assistant history message degrading to provider-neutral
   * conversion because its stored replay state is unusable by this build.
   */
  onReplayDegrade?: (detail: { provider: string; model: string; reason: string }) => void
  /**
   * Observe one cascade hop AFTER eligibility passes and BEFORE the delegated
   * attempt starts. Observers must never break the stream: a throwing hook is
   * contained by the adapter. Absent compositions stay silent.
   */
  onFallback?: (detail: {
    /** Route whose attempt failed and triggered the hop. */
    fromProvider: string
    /** Fallback route about to serve the request. */
    toProvider: string
    /** Model id the failing route was asked for. */
    model: string
    /** Model id the fallback route will receive. */
    fallbackModel: string
    /** Harness machine code that qualified the failure (`BREAKER_OPEN` when a tripped breaker forced the hop). */
    code: string
    /** Flattened failure text, for logs and counters. */
    message: string
  }) => void
  /**
   * Observe one finished streaming turn on THIS route. Emitted exactly once
  * per frame — including the synthetic `fallback` outcome of a frame that
  * handed off to its cascade — so external telemetry can reconstruct both
  * legs of every hop. Absent compositions stay silent.
   */
  onTurnTelemetry?: (detail: {
    provider: string
    model: string
    /** Harness outcome: `stop`, `tool-calls`, `max-tokens`, `error`, `aborted`, or `fallback`. */
    finish: string
    inputTokens?: number
    outputTokens?: number
    cacheReadTokens?: number
    latencyMs: number
    /** Stability fingerprint of the cache-relevant request prefix (when built). */
    prefixHash?: string
    /** Task complexity tier resolved by tierRouter (when active). */
    tier?: string
    /** Numeric complexity score from 0 to 100 evaluated for this turn. */
    tierScore?: number
  }) => void
  /**
   * Current Agent-Lab experiment switches, consulted live (per request, not
   * frozen): flipping a settings flag affects the next request without any
   * re-registration.
   */
  labFlags?: () => AgentLabFlags
  /**
   * Optional custom spill store for compaction pointers.
   */
  spillStore?: CompactionSpillStore
}

/** The two auth injectables a pi-ai collection is built with. */
export interface PiAiAuthInjection {
  /** Durable storage for credentials pi-ai itself writes: logins, and the refreshes it runs under its own lock. */
  credentials: CredentialStore
  /** Ambient lookups a provider performs while resolving its own auth. */
  authContext: AuthContext
}

/** Copy profile stream knobs into pi-ai's common option vocabulary. */
function profileOptions(
  profile: ResolvedPiAiProviderProfile,
  reasoning: ModelThinkingLevel | undefined,
  apiKey: string | undefined,
): SimpleStreamOptions {
  const enabledReasoning: ThinkingLevel | undefined = reasoning === 'off' ? undefined : reasoning
  return {
    ...apiKey === undefined ? {} : { apiKey },
    ...enabledReasoning === undefined ? {} : { reasoning: enabledReasoning },
    ...profile.thinkingBudgets === undefined ? {} : { thinkingBudgets: profile.thinkingBudgets },
    ...profile.cacheRetention === undefined ? {} : { cacheRetention: profile.cacheRetention },
    ...profile.transport === undefined ? {} : { transport: profile.transport },
    ...profile.timeoutMs === undefined ? {} : { timeoutMs: profile.timeoutMs },
    ...profile.websocketConnectTimeoutMs === undefined ? {} : { websocketConnectTimeoutMs: profile.websocketConnectTimeoutMs },
    // The agent recovery layer owns visible attempts; one adapter call is one SDK attempt.
    maxRetries: 0,
  }
}

/**
 * Failure codes that justify rerouting a request to its fallback provider:
 * transient infrastructure failures only. Deliberately excluded — aborts
 * (caller-owned), context overflow and invalid requests (the same payload
 * cannot succeed elsewhere), auth/quota/unsupported failures (terminal or
 * configuration-owned), and every unknown code (fail loud rather than retry
 * blind). This is the allow-list side of the cascade's stated contract:
 * rate limits, gateway 5xx, timeouts, and transport drops.
 */
const FALLBACK_ELIGIBLE_CODES: ReadonlySet<string> = new Set([
  'RATE_LIMIT',
  'SERVER',
  'TIMEOUT',
  'TRANSPORT',
])

/**
 * Classify one THROWN error into the shared taxonomy so thrown pre-stream and
 * mid-stream failures are held to the same eligibility bar as in-stream error
 * finishes. `LlmError` already carries a code; anything else is classified by
 * message the way pi-ai's own flattened failures are.
 * @param error - the caught value.
 * @returns the harness machine code, or undefined when none can be derived.
 */
function thrownFailureCode(error: unknown): string | undefined {
  if (error instanceof LlmError) return error.code
  if (error instanceof Error) return classifyPiAiError(error.message)
  return classifyPiAiError(String(error))
}

/** Flatten one caught value to the failure text telemetry carries along. */
function streamErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

/**
 * Resolve one requested effort to the level THIS model can take, following the
 * alias ladder when the literal spelling is unavailable. `max` and `xhigh` are
 * spellings newer catalogs ship ahead of their `.d.ts` entries, so the ladder
 * compares them as plain strings; the single contained assertion covers that
 * one out-of-union return value.
 * @param effort - the requested level id or profile default.
 * @param supported - the model's declared thinking levels.
 * @returns the resolved level, or undefined when no spelling applies.
 */
function nearestSupportedThinkingLevel(
  effort: ReasoningEffortIdType | ModelThinkingLevel,
  supported: readonly ModelThinkingLevel[],
): ModelThinkingLevel | undefined {
  const levels = supported as readonly string[]
  const key = String(effort)
  if (levels.includes(key)) return key as ModelThinkingLevel
  if (key === 'max' && levels.includes('high')) return 'high'
  if (key === 'high' && levels.includes('xhigh')) return 'xhigh'
  if (key === 'xhigh' && levels.includes('high')) return 'high'
  return undefined
}

/**
 * The profile default this exact model can actually take, for DESCRIBING it.
 * A configured level the model does not support yields none rather than
 * throwing: `resolveModel` builds the model catalog, and a catalog that fails
 * takes its whole provider out of every picker — so one mis-set profile field
 * would hide every model on the route, including the ones that support the
 * level. The request path still refuses, which is where a bad configuration
 * belongs: describing what a model can do must not fail because a deployment
 * asked it for something it cannot.
 * @param model - the resolved model descriptor.
 * @param effort - the profile's configured level, if any.
 * @returns the level when this model supports it, otherwise undefined.
 */
function describableReasoningLevel(
  model: Model<Api>,
  effort: ReasoningEffortIdType | ModelThinkingLevel | undefined,
): ModelThinkingLevel | undefined {
  if (effort === undefined) return undefined
  return nearestSupportedThinkingLevel(effort, getSupportedThinkingLevels(model))
}

/** Validate an explicit Harness/profile effort without invoking pi-ai's clamp. */
function resolveReasoningLevel(
  model: Model<Api>,
  effort: ReasoningEffortIdType | ModelThinkingLevel | undefined,
): ModelThinkingLevel | undefined {
  if (effort === undefined) return undefined
  const resolved = nearestSupportedThinkingLevel(effort, getSupportedThinkingLevels(model))
  if (resolved !== undefined) return resolved
  throw new LlmError(
    `pi-ai provider "${model.provider}" model "${model.id}" does not support reasoning effort "${effort}"`,
    'UNSUPPORTED_REASONING_EFFORT',
  )
}

/**
 * Selectable reasoning efforts for one model, or nothing at all.
 *
 * A model that carries no reasoning metadata — every hand-declared one, and
 * every catalog model pi-ai marks as non-reasoning — is reported by pi-ai as
 * supporting the single level `off`. Passing that through would offer a control
 * that cannot do what it says: `off` is translated to *omitting* the reasoning
 * option, which for such a model is byte-for-byte the same request as naming no
 * effort — so a provider whose own default is to think would keep thinking with
 * `off` selected. Omitting `reasoning` entirely is the seam's way of saying the
 * capability is unavailable, which leaves the surface offering only the
 * provider's default.
 * @param model - the resolved model descriptor.
 * @param defaultLevel - the profile's configured effort, already validated.
 * @returns the `reasoning` field, or an empty object when none can be offered.
 */
function reasoningInfo(
  model: Model<Api>,
  defaultLevel: ModelThinkingLevel | undefined,
): Pick<LlmResolvedModelInfo, 'reasoning'> | Record<string, never> {
  if (!model.reasoning) return {}
  const levels = getSupportedThinkingLevels(model)
  return {
    reasoning: {
      efforts: levels.map(level => ({
        id: ReasoningEffortId(level),
        name: `${level.charAt(0).toUpperCase()}${level.slice(1)}`,
      })),
      ...defaultLevel === undefined ? {} : { defaultEffort: ReasoningEffortId(defaultLevel) },
    },
  }
}

/** Merge deployment headers while removing case-insensitive attribution collisions. */
function requestHeaders(headers: Readonly<Record<string, string>> | undefined): Record<string, string> {
  const attribution = attributionHeaders()
  const reserved = new Set(Object.keys(attribution).map(name => name.toLowerCase()))
  return {
    ...Object.fromEntries(Object.entries(headers ?? {}).filter(([name]) => !reserved.has(name.toLowerCase()))),
    ...attribution,
  }
}

/**
 * pi-ai-backed multi-provider adapter. Each operation reads the current
 * profiles, so a configuration change reaches the next request without a
 * restart; model descriptors come from the collection those profiles built.
 */
export class PiAiAdapter extends LlmAdapter {
  private snapshot: PiAiSnapshot | undefined

  // --- Circuit breaker state (Agent-Lab `circuitBreaker` flag) ---------------
  /** Failure timestamps per route, pruned to the sliding window on every read. */
  private readonly breakerFailures = new Map<string, number[]>()
  /** Route → instant until which the breaker stays open (skips the primary). */
  private readonly breakerOpenedUntil = new Map<string, number>()

  /** Breaker tuning: failures within the window open the route for a cooldown. */
  private static readonly BREAKER_WINDOW_MS = 60_000
  private static readonly BREAKER_THRESHOLD = 3
  private static readonly BREAKER_COOLDOWN_MS = 30_000

  private labFlag(name: keyof AgentLabFlags): boolean {
    return this.config.labFlags?.()[name] === true
  }

  /**
   * Whether the route is currently skipped by the breaker. Reading prunes the
   * failure window; an expired cooldown clears the open state so the next
   * attempt acts as the single half-open probe (a fresh failure re-opens).
   */
  private breakerOpen(route: string): boolean {
    if (!this.labFlag('circuitBreaker')) return false
    const now = Date.now()
    const until = this.breakerOpenedUntil.get(route)
    if (until !== undefined) {
      if (now < until) return true
      this.breakerOpenedUntil.delete(route)
    }
    const windowStart = now - PiAiAdapter.BREAKER_WINDOW_MS
    const recent = (this.breakerFailures.get(route) ?? []).filter(ts => ts >= windowStart)
    this.breakerFailures.set(route, recent)
    return recent.length >= PiAiAdapter.BREAKER_THRESHOLD
  }

  /** Record one failed attempt against the route, tripping the breaker at threshold. */
  private recordRouteFailure(route: string): void {
    if (!this.labFlag('circuitBreaker')) return
    const now = Date.now()
    const recent = [...(this.breakerFailures.get(route) ?? []), now]
      .filter(ts => now - ts < PiAiAdapter.BREAKER_WINDOW_MS)
    this.breakerFailures.set(route, recent)
    if (recent.length >= PiAiAdapter.BREAKER_THRESHOLD) {
      this.breakerOpenedUntil.set(route, now + PiAiAdapter.BREAKER_COOLDOWN_MS)
    }
  }

  /** A clean outcome resets the route's history and closes its breaker. */
  private recordRouteSuccess(route: string): void {
    this.breakerFailures.delete(route)
    this.breakerOpenedUntil.delete(route)
  }

  readonly spillStore: CompactionSpillStore

  constructor(private readonly config: PiAiAdapterOptions) {
    super()
    this.spillStore = config.spillStore ?? defaultCompactionSpillStore
  }

  /**
   * The snapshot for the current profiles. Resolution memoizes its result, so
   * an unchanged configuration is recognized by identity; a changed one gets a
   * brand-new collection, leaving any snapshot an operation already captured
   * untouched for as long as that operation holds it.
   */
  private current(): PiAiSnapshot {
    const profiles = this.config.profiles()
    if (this.snapshot?.profiles === profiles) return this.snapshot
    const models: MutableModels = createModels(this.config.auth)
    for (const profile of profiles.values()) models.setProvider(profile.piProvider)
    this.snapshot = { profiles, models }
    return this.snapshot
  }

  /** The profile for one route within one snapshot, or the not-owned failure. */
  private profileOf(snapshot: PiAiSnapshot, provider: string): ResolvedPiAiProviderProfile {
    const profile = snapshot.profiles.get(provider)
    if (profile === undefined) {
      throw new LlmError(`pi-ai adapter does not own provider "${provider}"`, 'NO_ADAPTER')
    }
    return profile
  }

  /** The configured descriptor for one exact route/model pair within one snapshot. */
  private modelOf(snapshot: PiAiSnapshot, provider: string, model: string): Model<Api> {
    this.profileOf(snapshot, provider)
    const resolved = snapshot.models.getModel(provider, model)
    if (resolved === undefined) {
      throw new LlmError(`pi-ai provider "${provider}" has no configured model "${model}"`, 'UNKNOWN_MODEL')
    }
    return resolved
  }

  override providerInfo(provider: string): LlmProviderInfo {
    // The configured name, not the route key: `displayName` exists so a
    // deployment can label a route, and a label only the configuration surface
    // reads would leave every selector showing the raw key.
    return { id: provider, name: this.current().profiles.get(provider)?.displayName ?? provider }
  }

  override providerRetryPolicy(provider: string): ResolvedRetryPolicy | undefined {
    return this.current().profiles.get(provider)?.retryPolicy
  }

  override listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    return Promise.resolve().then(() => {
      const snapshot = this.current()
      this.profileOf(snapshot, provider)
      return snapshot.models.getModels(provider).map(model => ({
        provider,
        id: model.id,
        name: model.name,
        inputModalities: [...model.input],
      }))
    })
  }

  override resolveModel(
    provider: string,
    model: string,
    _signal?: AbortSignal,
  ): Promise<LlmResolvedModelInfo> {
    return Promise.resolve().then(() => {
      const snapshot = this.current()
      return this.modelInfo(snapshot, provider, model)
    })
  }

  private modelInfo(snapshot: PiAiSnapshot, provider: string, model: string): LlmResolvedModelInfo {
    const profile = this.profileOf(snapshot, provider)
    const resolvedModel = this.modelOf(snapshot, provider, model)
    const defaultLevel = describableReasoningLevel(resolvedModel, profile.reasoning)
    // Only a cap the deployment configured is a request default; the
    // catalog's `maxTokens` sizes the model and stops there.
    const configuredMaxTokens = profile.configuredMaxTokens.get(model)
    return {
      provider,
      id: model,
      name: resolvedModel.name,
      inputModalities: [...resolvedModel.input],
      context: { contextWindow: resolvedModel.contextWindow },
      ...configuredMaxTokens === undefined ? {} : { defaultMaxTokens: configuredMaxTokens },
      ...reasoningInfo(resolvedModel, defaultLevel),
    }
  }

  override prepareCall(provider: string, model: string, _signal?: AbortSignal): Promise<PreparedAdapterCall> {
    const snapshot = this.current()
    return Promise.resolve({
      model: this.modelInfo(snapshot, provider, model),
      stream: options => this.streamWithSnapshot(options, snapshot),
    })
  }

  override stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    return this.streamWithSnapshot(options, this.current())
  }

  private async * streamWithSnapshot(
    options: GenerateOptions,
    snapshot: PiAiSnapshot,
  ): AsyncGenerator<StreamChunk> {
    yield* this.streamRouted(options, snapshot, new Set<string>([options.provider]))
  }

  /**
   * One routed streaming attempt with fallback delegation.
   * @param options - the request; `provider`/`model` name the CURRENT route.
   * @param snapshot - the frozen snapshot for this attempt.
   * @param visits - routes already visited by THIS logical request, shared
   *   mutably across every delegation frame. A route lands here BEFORE its
   *   delegated attempt starts, so no later failure — from this frame's loop,
   *   its catches, or inside any delegated stream — can route back to it: a
   *   misconfigured cycle (A→B→A), a self-fallback, or a flapping chain stops
   *   after visiting each route once instead of recursing forever.
   */
  private async *streamRouted(
    options: GenerateOptions,
    snapshot: PiAiSnapshot,
    visits: Set<string>,
  ): AsyncGenerator<StreamChunk> {
    if (options.stop !== undefined) {
      throw new LlmError('llm-pi-ai does not support GenerateOptions.stop', 'UNSUPPORTED_OPTION')
    }
    // Agent-Lab tierRouter: dynamically evaluate task complexity heuristics
    // to route or recommend appropriate model tiers based on difficulty.
    let routedOptions = options
    let taskComplexityReport: TaskComplexityReport | undefined
    if (this.labFlag('tierRouter')) {
      const availableModels = snapshot.models.getModels(options.provider).map(m => m.id)
      const routed = routeTier(options, availableModels)
      routedOptions = routed.options
      taskComplexityReport = routed.report
    }

    // One capture per stream call, taken before any await: the profile, the
    // model descriptor, and the collection all come from the same immutable
    // snapshot, and the credential freezes with them. A configuration change
    // mid-request builds a separate snapshot, so this request finishes under
    // the one it started with and the next call picks up the new one.
    const profile = this.profileOf(snapshot, routedOptions.provider)
    const model = this.modelOf(snapshot, routedOptions.provider, routedOptions.model)
    const reasoning = resolveReasoningLevel(
      model,
      routedOptions.reasoningEffort ?? profile.reasoning,
    )
    const apiKey = await this.config.resolveApiKey(routedOptions.provider, profile)

    /**
     * Decide whether THIS failure justifies one cascade hop, returning the
     * delegated generator when it does. Single-flight by construction: the
     * target route lands in the SHARED `visits` set before delegation starts,
     * so neither this frame nor the delegated one can ever hop to it again.
     */
    const tryFallback = (
      code: string | undefined,
      failureMessage: string,
      opts?: { bypassEligibility?: boolean },
    ): AsyncGenerator<StreamChunk> | undefined => {
      const route = profile.fallbackProvider
      if (route === undefined) return undefined
      if (!opts?.bypassEligibility && (code === undefined || !FALLBACK_ELIGIBLE_CODES.has(code))) return undefined
      if (visits.has(route)) return undefined
      if (!snapshot.profiles.has(route)) return undefined
      if (routedOptions.signal?.aborted === true) return undefined
      const fallbackModel = profile.fallbackModel ?? routedOptions.model
      // Observability before delegation: a cascade hop is a latency- and
      // billing-relevant fact, so it reaches the deployment log even when the
      // fallback then succeeds. A throwing observer never breaks the stream.
      try {
        this.config.onFallback?.({
          fromProvider: routedOptions.provider,
          toProvider: route,
          model: routedOptions.model,
          fallbackModel,
          code: code ?? 'UNKNOWN',
          message: failureMessage,
        })
      } catch (_observerCrash) {
        // Contained: the cascade proceeds without telemetry.
      }
      visits.add(route)
      return this.streamRouted({
        ...routedOptions,
        provider: route,
        model: fallbackModel,
      }, snapshot, visits)
    }

    const consumer = new AbortController()
    const upstream = routedOptions.signal === undefined
      ? consumer.signal
      : AbortSignal.any([routedOptions.signal, consumer.signal])
    const streamIdleTimeoutMs = profile.streamIdleTimeoutMs
    using watchdog = idleWatchdog(upstream, streamIdleTimeoutMs, 'LLM_STREAM_IDLE_TIMEOUT')

    // Whether any content chunk reached the consumer on THIS route. Shared by
    // all three cascade sites: once tokens flowed, a restarted answer from a
    // fallback would duplicate visible output, so every site refuses.
    let hasYieldedTokens = false

    // Agent-Lab per-turn accounting: one telemetry event per frame, plus the
    // breaker bookkeeping that turns repeated failures into skipped attempts.
    const startedAt = Date.now()
    let lastUsage: { inputTokens?: number; outputTokens?: number; cacheReadTokens?: number } | undefined
    let turnEmitted = false
    // Fingerprint of the cache-relevant request prefix; assigned once the
    // context is built (the breaker-skip arm legitimately has none yet).
    let turnPrefixHash: string | undefined
    const emitTurn = (finish: string): void => {
      if (turnEmitted) return
      turnEmitted = true
      if (this.labFlag('turnTelemetry')) {
        try {
          this.config.onTurnTelemetry?.({
            provider: routedOptions.provider,
            model: routedOptions.model,
            finish,
            latencyMs: Date.now() - startedAt,
            ...(turnPrefixHash !== undefined ? { prefixHash: turnPrefixHash } : {}),
            ...(taskComplexityReport !== undefined ? {
              tier: taskComplexityReport.tier,
              tierScore: taskComplexityReport.score,
            } : {}),
            ...lastUsage,
          })
        } catch (_observerCrash) {
          // Contained: telemetry never breaks a stream.
        }
      }
      if (finish === 'error' || finish === 'aborted' || finish === 'fallback') this.recordRouteFailure(routedOptions.provider)
      else this.recordRouteSuccess(routedOptions.provider)
    }

    // Agent-Lab circuit breaker: an open route skips its doomed attempt and
    // hops straight to the fallback (bypassing the eligibility list — the hop
    // is forced by the breaker, not by the failure classification).
    if (this.breakerOpen(routedOptions.provider)) {
      const forced = tryFallback('BREAKER_OPEN', `circuit breaker open for route "${routedOptions.provider}"`, { bypassEligibility: true })
      if (forced !== undefined) {
        emitTurn('fallback')
        yield* forced
        return
      }
    }

    try {
      const containsImage = options.messages.some(message => contentHasImage(message.content))
      if (containsImage && !model.input.includes('image')) {
        throw new LlmError(`pi-ai model "${model.id}" does not support image input`, 'UNSUPPORTED_CONTENT')
      }
      const attachments = containsImage ? this.config.resolveAttachments?.() : undefined
      if (containsImage && attachments === undefined) {
        throw new LlmError('pi-ai image input requires the durable attachment service', 'UNSUPPORTED_CONTENT')
      }
      const onReplayDegrade = (reason: string): void => {
        this.config.onReplayDegrade?.({ provider: options.provider, model: options.model, reason })
      }
      const promptCacheStablePrefix = this.labFlag('promptCacheStablePrefix')
      const compactionPointer = this.labFlag('compactionPointer')
      const spillStore = this.spillStore

      let context: PiAiRequestContext = attachments === undefined
        // Sync shape: position 4 is the tool-result budget (see toPiContext).
        ? toPiContext(options, undefined, onReplayDegrade, profile.maxToolResultChars, {
          compactionPointer,
          spillStore,
          promptCacheStablePrefix,
          collapseSupersededResults: profile.collapseSupersededResults,
        })
        : await toPiContext({ ...options, signal: watchdog.signal }, {
          attachments,
          resolveImageAccess: ref => this.config.resolveImageAccess?.(attachments, ref),
          maxRequestImageBytes: profile.maxRequestImageBytes,
          requestImagePolicy: {
            maxPixels: profile.requestImagePixelBudget,
            maxBytes: profile.requestImageMaxBytes,
          },
          maxToolResultChars: profile.maxToolResultChars,
          compactionPointer,
          spillStore,
          promptCacheStablePrefix,
          collapseSupersededResults: profile.collapseSupersededResults,
        }, onReplayDegrade)
      // Agent-Lab promptCacheStablePrefix: a tool block whose ORDER drifts
      // between turns (plugin load order, config merges) silently invalidates
      // provider prefix caches; sorting by name and canonicalizing schemas makes
      // the head of the request a pure function of the tool SET.
      if (promptCacheStablePrefix) {
        if (context.tools !== undefined && context.tools.length > 0) {
          context = { ...context, tools: stableToolOrder(context.tools, true) }
        }
        if (context.systemPrompt !== undefined) {
          const normalized = normalizeSystemPrompt(context.systemPrompt)
          if (normalized !== undefined) {
            context = { ...context, systemPrompt: normalized }
          }
        }
      }
      turnPrefixHash = prefixFingerprint(context)
      const events = snapshot.models.streamSimple(model, context, {
        ...profileOptions(profile, reasoning, apiKey),
        ...options.temperature === undefined ? {} : { temperature: options.temperature },
        ...options.maxTokens === undefined ? {} : { maxTokens: options.maxTokens },
        ...options.sessionId === undefined ? {} : { sessionId: String(options.sessionId) },
        signal: watchdog.signal,
        // Profile headers are deployment-owned; attribution names are
        // Harness-owned and therefore win collisions.
        headers: requestHeaders(profile.headers),
      })
      const iterator = toStreamChunks(events, model.contextWindow, options.signal)[Symbol.asyncIterator]()
      let exhausted = false
      let lastFinishKind: string | undefined
      try {
        while (true) {
          const result = await watchdog.next(iterator)
          const timeout = timeoutOf(watchdog.signal, 'LLM_STREAM_IDLE_TIMEOUT')
          if (timeout !== undefined) throw timeout
          if (result.done) {
            exhausted = true
            emitTurn(lastFinishKind === 'error' || lastFinishKind === 'aborted' ? lastFinishKind : (lastFinishKind ?? 'empty'))
            return
          }
          const value = result.value
          if (value.type === 'usage') {
            lastUsage = {
              inputTokens: value.usage.inputTokens,
              outputTokens: value.usage.outputTokens,
              ...(value.usage.cacheReadTokens !== undefined
                ? { cacheReadTokens: value.usage.cacheReadTokens }
                : {}),
            }
          }
          if (value.type === 'finish') lastFinishKind = value.reason.kind
          // An in-stream error before any token reached the consumer is the
          // canonical cascade trigger: reroute once, eligible codes only.
          if (value.type === 'finish' && value.reason.kind === 'error' && !hasYieldedTokens) {
            const next = tryFallback(value.reason.failure.code, value.reason.failure.message)
            if (next !== undefined) {
              emitTurn('fallback')
              yield* next
              return
            }
            emitTurn('error')
          }
          if (
            value.type === 'text-delta'
            || value.type === 'reasoning-delta'
            || value.type === 'tool-call-delta'
            || value.type === 'block-start'
            || value.type === 'block-end'
          ) {
            hasYieldedTokens = true
          }
          yield value
        }
      } catch (streamError) {
        // Tokens already streamed must never be followed by a restarted answer:
        // a duplicate would corrupt the turn even when the retry succeeds.
        if (!hasYieldedTokens) {
          const next = tryFallback(thrownFailureCode(streamError), streamErrorMessage(streamError))
          if (next !== undefined) {
            emitTurn('fallback')
            yield* next
            return
          }
        }
        emitTurn('error')
        throw streamError
      } finally {
        if (!exhausted) {
          consumer.abort('pi-ai stream consumer stopped')
          try {
            await iterator.return(undefined)
          } catch (_abortedSdkTeardown) {
            // The stable signal already owns SDK termination; return-time abort cannot add an outcome.
          }
        }
      }
    } catch (error: unknown) {
      if (!hasYieldedTokens) {
        const next = tryFallback(thrownFailureCode(error), streamErrorMessage(error))
        if (next !== undefined) {
          emitTurn('fallback')
          yield* next
          return
        }
      }
      emitTurn('error')
      if (timeoutOf(watchdog.signal, 'LLM_STREAM_IDLE_TIMEOUT') !== undefined) {
        throw new LlmError(`pi-ai stream idle timeout after ${streamIdleTimeoutMs}ms`, 'TIMEOUT', { cause: error })
      }
      if (options.signal?.aborted) {
        throw new LlmError('pi-ai request aborted by caller', 'ABORTED', { cause: error })
      }
      throw error
    } finally {
      consumer.abort('pi-ai stream consumer stopped')
    }
  }
}
