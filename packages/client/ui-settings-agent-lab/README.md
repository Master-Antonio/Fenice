---
description: "Fenice-only settings section that surfaces the agent-lab experiment flags and their external JSONL telemetry."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-agent-lab

## Summary

`ui-settings-agent-lab` renders the Agent Lab settings section: one place to read and toggle the deployment's experiment flags (Fenice additions such as the tier router, the self-healing loop, compaction spill, and the session truncate RPC) plus the path of the external JSONL telemetry file. It is a Fenice fork addition, not an upstream harness package. The section writes through the ordinary settings document, so every flag it flips is validated by the owning feature's config schema and takes effect through that feature's own resolution path. No runtime invariant companion is published because the section owns no runtime relation — it only edits a settings document whose consistency the settings capability and each flag's owner already enforce.

## Model Experience

This package is model-agnostic: it renders settings copy and switches only. Enabling or disabling a flag changes which fork features are active, never what the model sees for a given turn beyond those features' own documented behavior.
