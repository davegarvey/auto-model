// Routing configuration: the tier menu plus router, policy, state and log settings.
// Validation is hand-written so the core has no runtime dependencies.
import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

export type RouterName = "systemone" | "jev" | "embedding" | "llm"

export interface Tier {
  id: string
  /** What the tier is for. The only thing a router sees. */
  description: string
  /** OpenCode model reference, "providerID/modelID". */
  model: string
  /** Model variant carrying the thinking setting, e.g. "none" or "high". */
  variant?: string
}

export interface Config {
  enabled: boolean
  tiers: Tier[]
  defaultTier: string
  router: RouterName
  systemOne: { baseURL: string; model: string; timeoutMs: number; pricePerMTok: number }
  /** Hosted Jev. The key is read from the environment variable named by apiKeyEnv, never from this file. */
  jev: { baseURL: string; path: string; model: string; apiKeyEnv: string; timeoutMs: number; pricePerMTok: number }
  /** input: "state" embeds the whole routing state; "latest" embeds only the latest message. */
  embedding: { baseURL: string; model: string; examples: string; k: number; timeoutMs: number; input: "state" | "latest" }
  llm: { baseURL: string; model: string; timeoutMs: number }
  policy: { threshold: number; margin: number }
  state: { budgetTokens: number }
  log: { path: string; captureState: boolean }
}

export class ConfigError extends Error {
  readonly rule: string
  constructor(rule: string, message: string) {
    super(`${rule}: ${message}`)
    this.name = "ConfigError"
    this.rule = rule
  }
}

const ROUTERS: readonly RouterName[] = ["systemone", "jev", "embedding", "llm"]

const DEFAULTS = {
  enabled: true,
  router: "systemone" as RouterName,
  systemOne: { baseURL: "http://localhost:8009", model: "kev-latest", timeoutMs: 30000, pricePerMTok: 0 },
  jev: {
    baseURL: "https://api.defapi.org",
    path: "/api/v1/decisions",
    model: "typesafe/jev-1.13",
    apiKeyEnv: "DEFAPI_API_KEY",
    timeoutMs: 30000,
    pricePerMTok: 0.084,
  },
  embedding: {
    baseURL: "http://localhost:11434",
    model: "embeddinggemma",
    examples: "data/router-examples.jsonl",
    k: 5,
    timeoutMs: 30000,
    input: "state" as "state" | "latest",
  },
  llm: { baseURL: "http://localhost:11434", model: "gemma4:e2b-mlx", timeoutMs: 30000 },
  policy: { threshold: 0.4, margin: 0.15 },
  state: { budgetTokens: 8192 },
  log: { path: "~/.local/state/auto-model/decisions.jsonl", captureState: false },
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

function section<T extends Record<string, unknown>>(input: unknown, name: string, defaults: T): T {
  if (input === undefined) return { ...defaults }
  if (!isRecord(input)) throw new ConfigError("invalid-section", `"${name}" must be an object`)
  const out: Record<string, unknown> = { ...defaults }
  for (const [key, fallback] of Object.entries(defaults)) {
    const value = input[key]
    if (value === undefined) continue
    if (typeof value !== typeof fallback)
      throw new ConfigError("invalid-field", `"${name}.${key}" must be a ${typeof fallback}`)
    out[key] = value
  }
  return out as T
}

function inRange(value: number, min: number, max: number, field: string) {
  if (!Number.isFinite(value) || value < min || value > max)
    throw new ConfigError("out-of-range", `"${field}" must be between ${min} and ${max}`)
}

/** Validates a parsed configuration object and fills defaults. Throws ConfigError naming the broken rule. */
export function parseConfig(input: unknown, baseDir = process.cwd()): Config {
  if (!isRecord(input)) throw new ConfigError("invalid-config", "configuration must be a JSON object")

  if (!Array.isArray(input.tiers)) throw new ConfigError("missing-tiers", `"tiers" must be an array`)
  const tiers: Tier[] = input.tiers.map((raw, i) => {
    if (!isRecord(raw)) throw new ConfigError("invalid-tier", `tier ${i} must be an object`)
    const { id, description, model, variant } = raw
    if (typeof id !== "string" || !/^[a-z][a-z0-9-]*$/.test(id))
      throw new ConfigError("invalid-tier", `tier ${i} needs an "id" of lowercase letters, digits or hyphens`)
    if (typeof description !== "string" || description.trim() === "")
      throw new ConfigError("invalid-tier", `tier "${id}" needs a non-empty "description"`)
    if (typeof model !== "string" || !/^[^/]+\/.+$/.test(model))
      throw new ConfigError("invalid-tier", `tier "${id}" needs a "model" of the form "providerID/modelID"`)
    if (variant !== undefined && (typeof variant !== "string" || variant === ""))
      throw new ConfigError("invalid-tier", `tier "${id}" has an empty "variant"`)
    return { id, description: description.trim(), model, ...(variant === undefined ? {} : { variant }) }
  })
  if (tiers.length < 2) throw new ConfigError("too-few-tiers", "the menu needs at least two tiers")
  const seen = new Set<string>()
  for (const tier of tiers) {
    if (seen.has(tier.id)) throw new ConfigError("duplicate-tier", `tier "${tier.id}" is defined more than once`)
    seen.add(tier.id)
  }

  if (typeof input.defaultTier !== "string") throw new ConfigError("missing-default", `"defaultTier" is required`)
  if (!seen.has(input.defaultTier))
    throw new ConfigError("missing-default", `"defaultTier" "${input.defaultTier}" is not one of the tiers`)

  const router = input.router ?? DEFAULTS.router
  if (typeof router !== "string" || !ROUTERS.includes(router as RouterName))
    throw new ConfigError("invalid-router", `"router" must be one of ${ROUTERS.join(", ")}`)

  if (input.enabled !== undefined && typeof input.enabled !== "boolean")
    throw new ConfigError("invalid-field", `"enabled" must be a boolean`)

  const config: Config = {
    enabled: input.enabled ?? DEFAULTS.enabled,
    tiers,
    defaultTier: input.defaultTier,
    router: router as RouterName,
    systemOne: section(input.systemOne, "systemOne", DEFAULTS.systemOne),
    jev: section(input.jev, "jev", DEFAULTS.jev),
    embedding: section(input.embedding, "embedding", DEFAULTS.embedding),
    llm: section(input.llm, "llm", DEFAULTS.llm),
    policy: section(input.policy, "policy", DEFAULTS.policy),
    state: section(input.state, "state", DEFAULTS.state),
    log: section(input.log, "log", DEFAULTS.log),
  }

  inRange(config.policy.threshold, 0, 1, "policy.threshold")
  inRange(config.policy.margin, 0, 1, "policy.margin")
  inRange(config.state.budgetTokens, 256, 262144, "state.budgetTokens")
  inRange(config.systemOne.timeoutMs, 1, 600000, "systemOne.timeoutMs")
  inRange(config.embedding.timeoutMs, 1, 600000, "embedding.timeoutMs")
  inRange(config.llm.timeoutMs, 1, 600000, "llm.timeoutMs")
  inRange(config.embedding.k, 1, 100, "embedding.k")
  if (config.embedding.input !== "state" && config.embedding.input !== "latest")
    throw new ConfigError("invalid-field", `"embedding.input" must be "state" or "latest"`)
  inRange(config.systemOne.pricePerMTok, 0, 1000, "systemOne.pricePerMTok")
  inRange(config.jev.timeoutMs, 1, 600000, "jev.timeoutMs")
  inRange(config.jev.pricePerMTok, 0, 1000, "jev.pricePerMTok")

  config.log.path = resolvePath(config.log.path, baseDir)
  config.embedding.examples = resolvePath(config.embedding.examples, baseDir)
  return config
}

function resolvePath(p: string, baseDir: string) {
  if (p === "~" || p.startsWith("~/")) return path.join(homedir(), p.slice(1))
  return path.resolve(baseDir, p)
}

/** Reads and validates a configuration file. Relative paths inside it resolve against the file's directory. */
export function loadConfig(file: string): Config {
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(file, "utf8"))
  } catch (error) {
    throw new ConfigError("unreadable-config", `cannot read ${file}: ${(error as Error).message}`)
  }
  return parseConfig(raw, path.dirname(path.resolve(file)))
}

export function tierById(config: Config, id: string): Tier {
  const tier = config.tiers.find((t) => t.id === id)
  if (!tier) throw new ConfigError("unknown-tier", `no tier "${id}"`)
  return tier
}
