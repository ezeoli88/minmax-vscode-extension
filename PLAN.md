# Plan: Sub-Agentes Exploratorios en Modo PLAN

## Concepto
Cuando el agente principal (en modo PLAN) necesita investigar múltiples aspectos del codebase, puede spawner sub-agentes exploratorios que corren tools read-only en paralelo. La UI muestra indicadores sutiles de progreso (similar a Claude Code). Los resultados se inyectan de vuelta al contexto del agente principal.

## Arquitectura

```
┌──────────────────────────────────────────┐
│  Parent Agent (PLAN mode)                │
│                                          │
│  "Necesito investigar 3 cosas..."        │
│        │                                 │
│        ▼                                 │
│  Llama tool: spawn_explorers             │
│        │                                 │
│  ┌─────┼──────────────┐                  │
│  ▼     ▼              ▼                  │
│ Sub1  Sub2           Sub3                │
│ "grep  "read         "glob              │
│  auth   config"       tests"            │
│  ..."                                    │
│  │     │              │                  │
│  ▼     ▼              ▼                  │
│  Resultados recolectados                 │
│        │                                 │
│        ▼                                 │
│  Inyectados como tool_result             │
│  al parent agent                         │
└──────────────────────────────────────────┘
```

## Archivos a Crear/Modificar

### 1. NUEVO: `src/agent/SubAgentManager.ts`
Clase que gestiona el ciclo de vida de sub-agentes exploratorios.

```typescript
interface ExplorerTask {
  id: string;
  description: string;   // Breve: "Investigar autenticación"
  instruction: string;    // Detallado: "Busca archivos relacionados con auth..."
}

interface ExplorerResult {
  taskId: string;
  description: string;
  summary: string;        // Resumen generado por el sub-agente
  toolsUsed: string[];    // Qué tools usó
  status: "completed" | "error" | "timeout";
}

class SubAgentManager extends EventEmitter {
  constructor(client: OpenAI, model: string, cwd: string)

  async runExplorers(tasks: ExplorerTask[]): Promise<ExplorerResult[]>
  // - Crea un AgentRunner por task (PLAN mode, read-only)
  // - Los ejecuta en paralelo con Promise.allSettled
  // - Cada sub-agente tiene:
  //   - Max 3 turns (para limitar consumo)
  //   - Max 30s timeout
  //   - System prompt especial: "Eres un explorador. Investiga X y resume"
  //   - Solo tools read-only
  // - Emite eventos de progreso
  // - Recolecta y retorna resultados

  // Eventos:
  // "explorer:start" (taskId, description)
  // "explorer:tool" (taskId, toolName)  -- para mostrar actividad
  // "explorer:done" (taskId, summary)
  // "explorer:error" (taskId, error)
}
```

### 2. NUEVO: `src/tools/spawnExplorers.ts`
Tool que el agente principal puede llamar para spawner exploradores.

```typescript
// Definición de tool para la API
{
  type: "function",
  function: {
    name: "spawn_explorers",
    description: "Launch parallel exploratory sub-agents to research multiple aspects of the codebase simultaneously. Each explorer can use read-only tools (read_file, glob, grep, list_directory). Use this when you need to investigate multiple things at once.",
    parameters: {
      type: "object",
      required: ["tasks"],
      properties: {
        tasks: {
          type: "array",
          description: "List of exploration tasks to run in parallel",
          items: {
            type: "object",
            required: ["id", "description", "instruction"],
            properties: {
              id: { type: "string" },
              description: { type: "string", description: "Short label shown in UI" },
              instruction: { type: "string", description: "Detailed instruction for the explorer" }
            }
          }
        }
      }
    }
  }
}
```

### 3. MODIFICAR: `src/core/tools.ts`
- Agregar `spawn_explorers` al registry
- Solo disponible en PLAN mode (agregar a `getReadOnlyToolDefinitions` o crear `getPlanToolDefinitions`)
- La ejecución requiere acceso al client/model, por lo que `executeTool` necesita un contexto opcional

### 4. MODIFICAR: `src/agent/AgentRunner.ts`
- Importar SubAgentManager
- En el sistema de ejecución de tools, manejar `spawn_explorers` especialmente:
  - Crear SubAgentManager con el client/model actual
  - Wiring de eventos del SubAgentManager al AgentRunner
  - Pasar resultados como tool_result formateado
- Actualizar system prompt de PLAN mode para mencionar la capacidad de sub-agentes

### 5. MODIFICAR: `src/shared/protocol.ts`
Agregar nuevos tipos de mensajes:

```typescript
// Extension → Webview
| { type: "subAgentStart"; taskId: string; description: string }
| { type: "subAgentProgress"; taskId: string; toolName: string }
| { type: "subAgentDone"; taskId: string; summary: string }
| { type: "subAgentError"; taskId: string; error: string }
```

### 6. MODIFICAR: `src/extension/ChatViewProvider.ts`
- Wire eventos del SubAgentManager → webview messages
- Forwarding de los nuevos eventos

### 7. NUEVO: `src/webview/components/SubAgentIndicator.tsx`
Componente React minimalista que muestra el progreso de sub-agentes:

```
┌─────────────────────────────────────┐
│ 🔍 Exploring...                     │
│                                     │
│  ● Investigating auth flow    ✓     │
│  ● Searching test patterns    grep  │
│  ● Analyzing config files     ...   │
└─────────────────────────────────────┘
```

- Se muestra inline en el chat, como un tool result expandido
- Cada línea muestra: descripción + estado (spinner/tool actual/✓/✗)
- Se colapsa cuando todos terminan, mostrando resumen

### 8. MODIFICAR: `src/webview/App.tsx`
- Agregar handlers para los nuevos message types
- Agregar state para sub-agents activos
- Agregar reducer actions: SUB_AGENT_START, SUB_AGENT_PROGRESS, SUB_AGENT_DONE

### 9. MODIFICAR: `src/webview/components/Message.tsx`
- Renderizar SubAgentIndicator cuando el tool es `spawn_explorers`

### 10. MODIFICAR: `src/webview/styles/` (CSS)
- Estilos para el componente SubAgentIndicator
- Animación de spinner/pulso para indicar actividad

## Flujo Detallado

1. Usuario pregunta algo complejo en modo PLAN
2. Agente principal decide que necesita investigar múltiples cosas
3. Agente llama `spawn_explorers` con array de tasks
4. `AgentRunner` intercepta esta tool call:
   a. Crea `SubAgentManager`
   b. Emite `subagent:start` por cada task → webview muestra indicadores
   c. Ejecuta sub-agentes en paralelo
   d. Cada sub-agente:
      - Recibe system prompt: "Eres un explorador de código. Tu tarea: {instruction}. Investiga usando las tools disponibles y al final genera un resumen conciso."
      - Tiene max 3 turns del agentic loop
      - Tiene 30s timeout
      - Solo usa tools read-only
   e. Emite `subagent:progress` cuando un sub-agente usa un tool
   f. Emite `subagent:done` cuando un sub-agente termina
5. Resultados se formatean como tool_result:
   ```
   ## Explorer Results

   ### Task: Investigating auth flow
   [Resumen del sub-agente 1]

   ### Task: Searching test patterns
   [Resumen del sub-agente 2]
   ```
6. Agente principal recibe estos resultados y sintetiza respuesta final

## Restricciones de Seguridad

- Sub-agentes SOLO pueden usar tools read-only
- Max 3 sub-agentes simultáneos (para no agotar quota)
- Max 3 turns por sub-agente
- Timeout de 30 segundos por sub-agente
- Token budget: max 50K tokens por sub-agente
- Solo disponible en modo PLAN (no en BUILDER)
- Si la quota del API está baja (<20% remaining), deshabilitar sub-agentes

## Orden de Implementación

1. `SubAgentManager.ts` - Core logic
2. `spawnExplorers.ts` - Tool definition
3. Modificar `tools.ts` - Registry
4. Modificar `AgentRunner.ts` - Wiring
5. Modificar `protocol.ts` - Message types
6. Modificar `ChatViewProvider.ts` - Event forwarding
7. `SubAgentIndicator.tsx` + CSS - UI
8. Modificar `App.tsx` + `Message.tsx` - State & rendering
9. Testing manual
