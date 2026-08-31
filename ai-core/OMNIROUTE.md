# OmniRoute + NexusForge

OmniRoute can sit in front of NexusForge as the **cloud provider**, not as a replacement for AI Core.

```text
Playground / Router / Agents
        ↓
NexusForge AI Core
        ↓
CloudGateway (OpenAI-compatible)
        ↓
OmniRoute  (optional)
        ↓
Gemini / Groq / OpenAI / 350 other providers
```

## Direct Gemini (what we run locally)

```powershell
$env:GEMINI_API_KEY="your-key"
$env:CLOUD_PROVIDER="gemini"
$env:AI_ROUTE_MODE="cloud"
.\scripts\run-ai-cloud.ps1
```

No Ollama needed. AI Core talks to:

`https://generativelanguage.googleapis.com/v1beta/openai`

## OmniRoute later

1. Run OmniRoute (`npx omniroute` or Docker). Default API is `http://127.0.0.1:20128/v1`.
2. Point NexusForge at it:

```powershell
$env:CLOUD_PROVIDER="omniroute"
$env:CLOUD_API_BASE="http://127.0.0.1:20128/v1"
$env:CLOUD_MODEL="auto"
$env:AI_ROUTE_MODE="cloud"
```

Put the Gemini key in OmniRoute, not in NexusForge, if you want OmniRoute to handle fallbacks.

NexusForge still owns routing, agents, memory, jobs, and the dashboard.
OmniRoute only becomes the model adapter layer.
