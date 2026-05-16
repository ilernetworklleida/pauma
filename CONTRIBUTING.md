# Contribuir a Pauma

Gracias por considerar contribuir. Pauma es una herramienta de accesibilidad construida por y para la comunidad sorda.

## Antes de contribuir

Lee:
- [`MANIFIESTO.md`](./MANIFIESTO.md) - filosofía del proyecto
- [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md) - cómo nos tratamos
- [`SECURITY.md`](./SECURITY.md) - cómo reportar vulnerabilidades

## Tipos de contribución que necesitamos

### Si eres persona sorda
**Lo que más valoramos.** Tu experiencia usando Pauma vale más que mil pull requests. Abre un issue con la etiqueta `feedback-sordo` describiendo:
- Una situación donde Pauma falló o no estaba a la altura
- Algo que esperabas que hiciera y no hace
- Una expresión, microcopy o framing que te resultó incómodo

### Si eres desarrollador/a
- Revisa los issues etiquetados `good-first-issue` o `help-wanted`
- Sigue el flujo: fork → rama → cambios pequeños → PR
- Tests donde sea posible
- Microcopy revisado con la comunidad antes de mergear

### Si eres traductor/a
Pauma necesita traducciones a tantas lenguas como sea posible. Archivos en `/i18n/`. Sigue el patrón de `es.json` y abre un PR con tu nueva lengua.

### Si eres diseñador/a
Accesibilidad WCAG AAA, contraste, motion, iconografía. Issues con `design`.

### Si eres investigador/a en accesibilidad
Estudios sobre uso real, métricas de impacto, comparación con otras soluciones. Abre un issue para coordinar.

## Cómo hacer un Pull Request

1. Forkea el repo
2. Crea una rama: `git checkout -b feat/mi-cambio`
3. Haz tus cambios. Commits pequeños y descriptivos en español o inglés.
4. Si tocas microcopy en español, considera si afecta a la versión `ca` e `en`.
5. Tests si aplican.
6. Push y abre PR contra `main`.
7. Describe **qué cambia** y **por qué**. Cita issue si lo hay.

## Estándares de código

- HTML semántico, sin divitis
- CSS con custom properties, mobile-first, BEM ligero
- JS vanilla ES2020+. Sin frameworks por ahora.
- PHP 8.1+, PSR-12, sin dependencias innecesarias
- Sin librerías de terceros que requieran build pesado
- Performance: la app debe seguir Lighthouse ≥95

## Estándares de microcopy

- Lenguaje en primera persona del usuario ("Yo hablo", "Lo que te digo")
- **Invariable de género** por defecto ("Te damos la bienvenida", no "Bienvenida")
- Nunca palabras como "discapacidad", "sordomudo", "limitación", "te ayudo a oír"
- Centrarse en **comunicar**, no en "oír"
- Texto claro, sin jerga técnica visible al usuario

## Estándares de accesibilidad

- Contraste AA mínimo, AAA cuando posible
- Tap targets ≥44px
- `aria-label` en todos los controles
- `prefers-reduced-motion` respetado
- Navegable por teclado
- Test con lector de pantalla (NVDA, VoiceOver) antes de mergear cambios grandes

## Qué NO mergeamos

- Cambios que añadan tracking, analytics o cookies sin consentimiento
- Anuncios o monetización del usuario individual
- Dependencias propietarias o de licencia cerrada
- Cualquier cosa que rompa AGPL-3.0
- Cambios que infantilicen a personas sordas
- Cambios que añadan complejidad sin uso claro para la persona sorda real

## Si tienes dudas

Abre un issue antes de empezar a trabajar para asegurarte de que tu contribución encaja con la dirección del proyecto.

¡Gracias por hacer Pauma mejor!
