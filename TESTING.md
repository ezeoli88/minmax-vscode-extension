# Guía de Pruebas Manuales

## Pre-requisitos
1. `npm run build` debe completar sin errores
2. Abrir VS Code con la extensión cargada (F5 para debug)
3. Tener un proyecto/workspace abierto con archivos

---

## 1. CHECKPOINTS

### 1.1 Creación automática de checkpoints
- [ ] Abrir el chat en modo **BUILDER**
- [ ] Enviar un mensaje que haga al agente modificar un archivo (ej: "Agrega un comentario al inicio de package.json")
- [ ] Verificar que aparece un **checkpoint divider** (línea punteada) arriba del mensaje del usuario
- [ ] El divider debe mostrar: `Before: "Agrega un comentario al inicio de..."`
- [ ] Enviar 2-3 mensajes más que modifiquen archivos
- [ ] Verificar que aparece un checkpoint divider antes de cada mensaje de usuario

### 1.2 UI del checkpoint divider
- [ ] El divider es una línea punteada horizontal con un label de texto
- [ ] Al hacer **hover** sobre el divider, aparece un botón "Restore"
- [ ] El botón "Restore" desaparece al quitar el hover
- [ ] **Durante streaming** (mientras el agente responde), el botón "Restore" debe estar deshabilitado/invisible

### 1.3 Restaurar un checkpoint
- [ ] Enviar 3+ mensajes donde el agente modifique archivos distintos
- [ ] Verificar los archivos modificados en disco (que realmente cambiaron)
- [ ] Hacer click en "Restore" en el **segundo** checkpoint divider
- [ ] Debe aparecer un confirm dialog nativo del navegador
- [ ] Al confirmar:
  - [ ] Los archivos vuelven al estado de ese punto (verificar en disco)
  - [ ] Los mensajes de conversación se truncan (solo quedan los anteriores al checkpoint)
  - [ ] Los checkpoints posteriores desaparecen
  - [ ] Se puede seguir conversando normalmente desde ese punto

### 1.4 Restaurar al primer checkpoint
- [ ] Restaurar al primer checkpoint (el más antiguo)
- [ ] Verificar que TODOS los archivos vuelven a su estado original
- [ ] La conversación queda vacía o solo con el primer mensaje

### 1.5 Archivos nuevos en checkpoint restore
- [ ] Pedir al agente que cree un archivo nuevo (ej: "Crea un archivo test-file.txt con contenido hello")
- [ ] Verificar que el archivo existe en disco
- [ ] Restaurar al checkpoint anterior
- [ ] Verificar que el archivo nuevo fue **eliminado** del disco

### 1.6 Limpieza de checkpoints
- [ ] Verificar que al hacer click en "New Session" los checkpoints desaparecen
- [ ] Verificar que al hacer "Clear Chat" los checkpoints desaparecen
- [ ] Verificar que al cargar una sesión guardada, no hay checkpoints (no se persisten)

---

## 2. SUB-AGENTES EXPLORATORIOS

### 2.1 Disponibilidad del tool
- [ ] En modo **PLAN**: el agente debe tener acceso a `spawn_explorers` (verificar preguntándole "¿Qué tools tienes disponibles?")
- [ ] En modo **BUILDER**: `spawn_explorers` NO debe estar disponible

### 2.2 Activación de sub-agentes
- [ ] Cambiar a modo **PLAN** (Tab o click en el badge)
- [ ] Hacer una pregunta compleja que requiera investigar múltiples cosas, por ejemplo:
  - "Explícame la arquitectura completa de esta extensión: cómo funciona el sistema de herramientas, cómo se comunica el webview con el extension host, y cómo se maneja el streaming"
  - "Analiza este proyecto: busca todos los componentes React, investiga cómo funciona el sistema de sesiones, y revisa la configuración de MCP"
- [ ] El agente debería decidir llamar `spawn_explorers` con múltiples tasks

### 2.3 UI del indicador de sub-agentes
Cuando el agente llama `spawn_explorers`:
- [ ] Aparece un bloque "Sub-Agents" en el chat (en lugar de "Tool")
- [ ] Se muestra el componente **SubAgentIndicator** con:
  - [ ] Header: "EXPLORING..." mientras trabajan
  - [ ] Una línea por cada sub-agente con:
    - [ ] Un **spinner animado** (circulito girando) mientras está activo
    - [ ] La **descripción** del task
    - [ ] El **nombre del tool** que está usando actualmente (ej: "grep", "read_file") a la derecha
  - [ ] Cuando un sub-agente termina: el spinner cambia a **✓** (checkmark verde)
  - [ ] Si un sub-agente falla: cambia a **✗** (rojo)
  - [ ] Cuando todos terminan: el header cambia a "EXPLORATION COMPLETE"

### 2.4 Resultados de sub-agentes
- [ ] Después de que todos los sub-agentes terminan, el resultado se inyecta en el chat
- [ ] El resultado debe mostrarse formateado con Markdown (headers, separadores)
- [ ] El agente principal debe usar los resultados para generar una respuesta sintetizada

### 2.5 Límites
- [ ] Verificar que no se lanzan más de **3 sub-agentes** a la vez (el modelo podría pedir más, pero se truncan)
- [ ] Los sub-agentes solo usan tools read-only (read_file, glob, grep, list_directory)
- [ ] Los sub-agentes no deberían tardar más de ~30 segundos cada uno

### 2.6 Cancelación
- [ ] Mientras los sub-agentes están corriendo, presionar el botón de cancelar (■)
- [ ] Verificar que el streaming se detiene

### 2.7 Limpieza de estado
- [ ] Después de que el agente termina (evento DONE), el estado de sub-agents se limpia
- [ ] Si se envía otro mensaje, no quedan sub-agents residuales del mensaje anterior
- [ ] Al hacer Clear Chat, el estado de sub-agents se resetea

---

## 3. INTEGRACIÓN CHECKPOINTS + SUB-AGENTES

### 3.1 Checkpoint con sub-agentes
- [ ] En modo PLAN, hacer una pregunta que active sub-agentes
- [ ] Verificar que se crea un checkpoint antes del mensaje
- [ ] Enviar otro mensaje después
- [ ] Restaurar al checkpoint anterior
- [ ] Verificar que la conversación se restaura correctamente (sin residuos de sub-agentes)

### 3.2 Cambio de modo
- [ ] Iniciar en PLAN mode, usar sub-agentes
- [ ] Cambiar a BUILDER mode (Tab)
- [ ] Verificar que `spawn_explorers` ya no está disponible
- [ ] Cambiar de vuelta a PLAN mode
- [ ] Verificar que `spawn_explorers` vuelve a estar disponible

---

## 4. BUILD & ESTABILIDAD

- [ ] `npm run build` completa sin errores
- [ ] La extensión carga correctamente en VS Code (no hay errores en Developer Tools > Console)
- [ ] Múltiples sesiones de ida y vuelta sin crashes
- [ ] El context bar (barra de tokens) se actualiza correctamente durante sub-agentes
