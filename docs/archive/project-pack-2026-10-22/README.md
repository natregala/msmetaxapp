# Original project pack — 22 October 2026

These files preserve the original planning material. They describe intent at that date, before the current implementation, and have been moved without rewriting their contents.

| File | Historical purpose |
| --- | --- |
| [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) | Initial product and technology baseline |
| [PROJECT_GUIDE.md](PROJECT_GUIDE.md) | Instruction-pack reading and installation guide |
| [VISUAL_RESEARCH_HANDOFF.md](VISUAL_RESEARCH_HANDOFF.md) | Original copy of the research handoff |
| [MSME_PROJECT_PACK.md](MSME_PROJECT_PACK.md) | Checksum-protected export of 25 instruction/reference files |
| [install_project_pack.py](install_project_pack.py) | Standard-library bundle validator/extractor |

Use the [current docs index](../../README.md) for implemented behavior, the [current design guide](../../design/README.md) for visuals, and [.agents foundation references](../../../.agents/skills/msme-project-foundation/SKILL.md) for canonical project context and decisions. The archived context and bundle are not a second source of current implementation status.

To validate the original bundle without extracting or overwriting files, run this from the project root with Python 3:

```powershell
python docs/archive/project-pack-2026-10-22/install_project_pack.py docs/archive/project-pack-2026-10-22/MSME_PROJECT_PACK.md --destination .test-data/project-pack-check --check
```

If extraction is needed, use a fresh destination and merge deliberately. The export contains original `AGENTS.md` and `.agents/skills/` paths; installing it over the active project would conflict with later instructions and decisions.
