# pi-en-trainer

A [pi](https://github.com/badlogic/pi-mono) extension that helps you learn to write prompts in English.

After each Chinese prompt, an English translation is shown inline in the conversation — without modifying the original prompt or injecting anything into the LLM context.

## What it does

```
You: 帮我重构这个函数，提取公共逻辑
🇬🇧 EN  Help me refactor this function and extract common logic
Assistant: I'll help you refactor...
```

- ✅ Original prompt sent to agent **unchanged**
- ✅ Translation **never** reaches the LLM context
- ✅ Uses a configurable **cheap/fast model** for translation (default: `claude-haiku-4.5`)
- ✅ Detects Chinese automatically (threshold: 20% CJK chars), ignores English-only input

## Install

```bash
pi install git:github.com/justcyl/pi-en-trainer
```

> **Load order**: If you use `@juanibiapina/pi-extension-settings`, make sure it appears **before** `pi-en-trainer` in your `packages` array so the settings UI registers correctly.

## Configuration

Use `/extension-settings` (requires `@juanibiapina/pi-extension-settings`) to configure:

| Setting | Default | Description |
|---------|---------|-------------|
| `enabled` | `on` | Enable/disable the extension |
| `translation-model` | `github-copilot/claude-haiku-4.5` | Model for translation (`provider/model-id`) |

Pick any cheap, fast model you have configured. Examples:
- `github-copilot/claude-haiku-4.5`
- `axonhub/gemini-3-flash-preview`

## Commands

| Command | Description |
|---------|-------------|
| `/en-trainer` | Toggle on/off |

## License

MIT
