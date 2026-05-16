# Changelog

Todos los cambios notables del proyecto se documentan aquí.

Sigue el formato de [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el versionado de [Semantic Versioning](https://semver.org/lang/es/).

---

## [v0.7] - 2026-05-16

### Añadido
- Licencia AGPL-3.0 explícita
- MANIFIESTO.md con la filosofía del proyecto
- CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md
- Plantillas de issue (bug, feature, accesibilidad)
- Workflow de GitHub Actions para deploy automático a Hostinger
- Vocabulario personalizado: palabras importantes que Pauma reconoce mejor (Deepgram `keywords`)
- Aviso visible de transcripción al iniciar (consentimiento para terceros)

### Cambiado
- Microcopy invariable de género en toda la app ("Te damos la bienvenida" en vez de "Bienvenida")
- Marco "comunicar" en vez de "oír" en toda la interfaz
- Frase SOS: "Soy persona sorda" (preferida por la comunidad española)

---

## [v0.6] - 2026-05-16

### Añadido
- Detección de nombre propio configurable (vibración + estrella al ser llamada)
- Tap en burbuja → copiar texto al portapapeles
- Backup / restore completo de datos en JSON
- Modal de confirmación propio (reemplaza `confirm()` nativos)
- Scroll-top FAB cuando hay mucho scroll

### Corregido
- Bucle de retroalimentación con TTS: el micrófono no envía audio mientras suena la voz sintetizada

---

## [v0.5] - 2026-05-16

### Añadido
- Visualizador de audio en vivo (15 barras AnalyserNode)
- Modo "Cara a Cara": pantalla dividida con mitad inferior rotada 180º
- Quick actions flotantes durante la escucha (marcar, ¿puedes repetir?, más despacio)
- Indicador de calidad de transcripción (verde/ámbar/rojo)
- Atajos de teclado: Espacio (mic), S (SOS), / (buscar), Esc (cerrar)
- Header con sombra al hacer scroll
- Tip pulsante la primera vez sobre el FAB del micrófono
- Toasts de feedback globales
- Loading state con spinner en TTS
- Status line colapsable
- Cursor pulsante en transcripción provisional

### Mejorado
- Responsive para móviles <360px (Galaxy A, iPhone SE)
- Landscape orientación: tabbar 64px, SOS en columnas

---

## [v0.4] - 2026-05-16

### Añadido
- Toggle switches propios (no checkboxes nativos)
- PWA install prompt nativo con banner propio
- Welcome screen con icono mic y ondas concéntricas CSS
- Iconos de sección en ajustes
- Search bar con clear button

### Mejorado
- Sistema de diseño con escala 4px y tokens de easing
- FAB del mic sobresaliendo del tabbar con anillo pulsante
- Mobile: header 52px, tabbar 76px, padding lateral optimizado
- Backdrop-filter en headers (glass effect)
- Hairline borders sutiles

---

## [v0.3] - 2026-05-15

### Añadido
- Modo SOS para situaciones de urgencia o desconocidos
- Frases rápidas organizadas en 6 categorías (24 frases precargadas)
- Buscador en historial con resaltado de coincidencias
- Renombrar sesiones del historial
- Exportar sesiones a TXT
- Compartir sesiones (Share API)
- Push-to-talk opcional
- Estadísticas privadas locales (últimos 7 días)
- Auto-update PWA con toast "Actualizar"
- Service worker con share_target para audios
- 404.html personalizada
- `.htaccess` con HTTPS forzado, HSTS, cabeceras de seguridad
- Esquema MySQL preparado para v0.4+ (cuentas, llamadas, feedback)
- `/api/health.php` endpoint

### Seguridad
- Deepgram temp keys (TTL 5 min) en vez de exponer la API key root
- `/api/revoke.php` para revocar al cerrar sesión

---

## [v0.2] - 2026-05-15

### Añadido
- Transcripción con Deepgram Nova-2 streaming + diarización
- Fallback automático a Web Speech API
- Modo "Yo hablo" con ElevenLabs TTS
- Historial en IndexedDB (local)
- Detección ligera de tono emocional
- Onboarding de 3 pantallas

---

## [v0.1] - 2026-05-15

### Añadido
- Versión inicial: PWA con Web Speech API
- Landing pública con SEO completo
- Política de privacidad
- Deploy script a Hostinger
- Service worker básico
- Manifest PWA instalable
