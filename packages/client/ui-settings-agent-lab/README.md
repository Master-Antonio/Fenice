---
description: "Fenice-only settings section that surfaces the agent-lab experiment flags and their external JSONL telemetry."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-agent-lab

## Summary

`ui-settings-agent-lab` renders the Agent Lab settings section: one place to read and toggle the deployment's experiment flags (Fenice additions such as the tier router, the self-healing loop, compaction spill, and the session truncate RPC) plus the path of the external JSONL telemetry file. It is a Fenice fork addition, not an upstream harness package. The section writes through the ordinary settings document, so every flag it flips is validated by the owning feature's config schema and takes effect through that feature's own resolution path.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The section mounts through the standard settings slot machinery with the other settings sections; no separate composition step is needed beyond loading the client plugin.

### Minimal configuration

```yaml
- name: '@deepseek-ai/dsh-client-ui-settings-agent-lab'
```

| Field | Default | Meaning |
|---|---|---|
| — | — | The section reads and writes the `agent-lab` settings namespace; it takes no plugin config. |

<a id="model-experience"></a>
## Model Experience

None, as this section renders settings copy and experiment switches and registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- The flags and the telemetry file path are experimental surfaces that may move or be retired between fork syncs.
- Per-flag provenance and live telemetry previews are not rendered yet.

<a id="dev-note"></a>
### Dev Note

No runtime invariant companion is published because the section owns no runtime relation — it only edits a settings document whose consistency the settings capability and each flag's owner already enforce.
