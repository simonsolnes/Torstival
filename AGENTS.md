Every maintained repository workflow MUST have a justfile recipe. Run setup,
checks, native generation, builds, installs, cleanup, and commits through `just`.
Add a recipe when introducing any new repeatable operation. Do not introduce
parallel npm scripts, EAS workflows, or undocumented manual native edits.

Commit completed chunks as you go. Keep signing keys and generated artifacts
out of Git. Native projects are generated from app.json and config plugins.
Build release binaries with embedded JavaScript; do not start a development
server unless the user explicitly asks for one.

Keep README.md to one sentence and release notes to one very short sentence.
