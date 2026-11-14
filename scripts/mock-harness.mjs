#!/usr/bin/env node
/**
 * Deterministic local harness used by the README demo.
 *
 * It follows Shelclaw's prompt delegation protocol:
 *   - root call: emits a spawn_agents block with two tasks
 *   - Researcher child: delegates one more task
 *   - any child with tool results: synthesizes
 *
 * Add it in Shelclaw as a "Custom local harness":
 *   command: /absolute/path/to/scripts/mock-harness.mjs
 *   arguments: (none)
 *   prompt transport: As the final argument
 */
const prompt = process.argv.slice(2).join(' ')
const squash = (value) => value.replace(/\s+/g, ' ').slice(0, 120)

if (prompt.includes('--version')) {
  console.log('shelclaw-mock-harness 1.0')
  process.exit(0)
}

if (prompt.includes('### TOOL')) {
  console.log('Synthesis complete. I combined the delegated findings into one recommendation.')
  process.exit(0)
}

if (prompt.includes('delegation depth 1')) {
  if (prompt.includes('Researcher') && !prompt.includes('Deep-dive')) {
    console.log(`<shelclaw_tool>
{"name":"spawn_agents","arguments":{"tasks":[{"title":"Deep-dive the constraints","instructions":"List the key constraints and risks for this brief, then return a short deliverable.","agent":"Engineer"}]}}
</shelclaw_tool>`)
    process.exit(0)
  }
  console.log(`Child deliverable: completed the brief "${squash(prompt)}".`)
  process.exit(0)
}

if (prompt.includes('delegation depth 2')) {
  console.log('Nested child deliverable: constraints and risks are documented.')
  process.exit(0)
}

console.log(`<shelclaw_tool>
{"name":"spawn_agents","arguments":{"tasks":[{"title":"Research the options","instructions":"Compare three approaches and return the trade-offs and a recommendation.","agent":"Researcher"},{"title":"Draft the implementation","instructions":"Outline an implementation plan with concrete steps.","agent":"Engineer"}]}}
</shelclaw_tool>`)
