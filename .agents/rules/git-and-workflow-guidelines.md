# Lineamientos de Git, Ramas y Flujo de Trabajo — WaveAI

Este documento establece las políticas obligatorias de control de versiones y entregables para el proyecto **WaveAI**.

---

## 1. Commits Continuos y Obligatorios
1. **Commit al Finalizar Cada Tarea**:
   - Cada vez que se culmine una tarea, corrección de bug, mejora de interfaz o solicitud del usuario, el asistente DEBE realizar inmediatamente el commit respectivo en git.
   - **Prohibido terminar un turno o respuesta dejando cambios locales sueltos o sin commitear**.
2. **Mensajes Convencionales Claros**:
   - Utilizar el estándar de Conventional Commits:
     - `feat(...)`: Nuevas funcionalidades o integraciones.
     - `fix(...)`: Corrección de errores y bugs.
     - `style(...)`: Ajustes puramente visuales, CSS o diseño.
     - `refactor(...)`: Reestructuración de código sin cambio de comportamiento.
     - `docs(...)`: Documentación y reportes de fases.

---

## 2. Estrategia de Ramas
1. **Ramas de Fase**:
   - Cada fase se trabaja en una rama dedicada basada en `dev`:
     - Ejemplo: `feat/fase-5-historial-drafts-masters`
2. **Protección de Ramas Principales**:
   - **`main` nunca se toca directamente**.
   - Prohibido hacer push directo a `dev` o `main`; toda integración definitiva se realiza mediante Pull Requests (PRs).

---

## 3. Reportes de Fases y Documentación
1. **Entrega de Reportes por Fase**:
   - Al finalizar cada fase del roadmap, se debe redactar el reporte detallado correspondiente en `docs/reports/report-fase-X.md`.
   - El informe debe incluir: Resumen ejecutivo, esquema de base de datos/Supabase, componentes desarrollados, validación de compilación y próximos pasos.
