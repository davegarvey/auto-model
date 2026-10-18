// OpenCode v2 plugin: routes every user prompt (including sub-agent prompts) to a tier chosen by the
// configured router. Loaded through .opencode/plugins/auto-model.ts.
import path from "node:path"
import { loadConfig } from "../core/config.ts"
import { createRouter } from "../core/route.ts"
import { buildState } from "../core/state.ts"
import { diagnose, Selector, type SessionPort } from "./selector.ts"

const CONFIG = process.env.AUTO_MODEL_CONFIG ?? path.resolve(import.meta.dirname, "../../auto-model.config.json")

export default {
  id: "auto-model",
  setup: async (ctx: any) => {
    const config = loadConfig(CONFIG)
    const router = await createRouter(config)
    const port: SessionPort = {
      get: (sessionID) => ctx.session.get({ sessionID }),
      context: (sessionID) => ctx.session.context({ sessionID }),
      switchModel: (sessionID, model) => ctx.session.switchModel({ sessionID, model }),
    }
    const selector = new Selector(config, router, port)
    diagnose(config, `setup in ${process.pid}, router ${router.name} (${router.model})`)

    // Warm the decision model so the first real turn does not pay its start-up cost. Not awaited.
    router
      .route(config.tiers, buildState({ history: [], latestMessage: "warm-up" }, { budgetTokens: 256 }))
      .catch(() => {})

    diagnose(config, "registering prompt hook")
    await ctx.session.hook("prompt", async (event: any) => {
      await selector.onPrompt(event.sessionID, event.prompt?.text ?? "")
    })

    diagnose(config, "registering command")
    await ctx.command.transform((editor: any) => {
      editor.add({
        name: "auto-model",
        description: "Automatic model routing: on, off or status",
        execute: async (input: any) => {
          const text = selector.command(input.sessionID, input.prompt?.text ?? "status")
          diagnose(config, `command ${input.sessionID} "${input.prompt?.text ?? ""}": ${text}`)
          try {
            await ctx.session.synthetic({ sessionID: input.sessionID, text, description: "auto-model", resume: false })
          } catch (error) {
            diagnose(config, `command reply failed: ${(error as Error).stack ?? error}`)
          }
        },
      })
    })
    diagnose(config, "setup complete")
  },
}
