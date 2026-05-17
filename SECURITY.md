# Política de seguridad

## Versiones soportadas

Mantenemos la última versión `main` del repositorio. Las versiones anteriores no reciben parches de seguridad.

## Reportar una vulnerabilidad

**Si descubres una vulnerabilidad, NO la abras como issue público.**

Envía un correo a: **hola@maluap.es** con el asunto `[security] descripción breve`.

Incluye:
- Descripción clara del problema
- Pasos para reproducirlo
- Versión afectada (commit hash si es posible)
- Impacto potencial (qué podría hacer alguien que lo explote)
- Posibles mitigaciones que se te ocurran

## Lo que puedes esperar

- Confirmación de recepción en menos de 72h
- Evaluación inicial en menos de 7 días
- Plan de mitigación comunicado contigo
- Crédito público una vez parcheado (si lo deseas)

## Vulnerabilidades especialmente graves para Maluap

Por la naturaleza del proyecto, tomamos extra seriamente:

- **Filtración de audio o transcripciones** de usuarios
- **Exposición de API keys** (Deepgram, ElevenLabs, DB) al cliente
- **CORS / orígenes** mal configurados que permitan abusar del proxy
- **XSS** que permita leer historial de IndexedDB ajeno
- **Inyección SQL** en futuras versiones con DB
- **Bypass de rate limit** que pueda agotar créditos de API
- **Tracking o telemetría** no consentidos que se cuelen en una contribución

## Disclosure responsable

Pedimos un periodo razonable (90 días por defecto) entre el reporte y la divulgación pública para poder parchear. Si el problema afecta a usuarios reales y tiene mitigación fácil, podemos ir más rápido.

## Reconocimientos

Personas que han reportado vulnerabilidades responsablemente serán listadas en `SECURITY-HALL-OF-FAME.md` si lo desean.
