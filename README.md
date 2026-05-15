# Pauma

Asistente IA para personas sordas. Transcripcion en vivo de conversaciones, pensado para abrir camino a llamadas asistidas, deteccion de sonidos del hogar y mas.

## Datos del proyecto

- Producto: **Pauma**
- Dominio: **https://maluap.es** (palindromo de pauma)
- Stack: PWA (HTML/CSS/JS puro) + PHP 8.1
- Hosting: Hostinger shared
- Ruta remota: `/home/u862342697/domains/maluap.es/public_html/`
- Repo: `ilernetworklleida/pauma`
- Rama: `main`

## Estructura

```
.
├── index.html              landing publica (SEO)
├── privacidad.html         politica de privacidad
├── app/index.html          la app de transcripcion en vivo
├── api/transcribe.php      placeholder para v0.2 (Whisper / AssemblyAI)
├── assets/
│   ├── css/style.css       dark theme, custom properties
│   ├── js/app.js           Web Speech API + Wake Lock
│   └── icons/              iconos PWA (generar manualmente)
├── manifest.json           PWA instalable
├── sw.js                   service worker, app-shell cache
├── robots.txt              indexable
├── sitemap.xml             paginas publicas
├── composer.json
├── deploy.sh               rsync a Hostinger
└── README.md
```

## Roadmap

| Version | Funcionalidad | Estado |
|---|---|---|
| v0.1 | Subtitulador grupal con Web Speech API | en marcha |
| v0.2 | Diarizacion + colores por hablante (AssemblyAI / pyannote) | pendiente |
| v0.3 | Deteccion de tono emocional | pendiente |
| v0.4 | Asistente telefonico (Twilio + Whisper + ElevenLabs) | pendiente |
| v0.5 | Resumen de notas de voz (WhatsApp Share Sheet) | pendiente |
| v0.6 | Deteccion de sonidos del hogar (timbre, alarmas) | pendiente |

## Deploy

```bash
bash deploy.sh
```

## Iconos pendientes

Generar y colocar en `/assets/icons/`:

- `icon-192.png` (192x192)
- `icon-512.png` (512x512)
- `icon-maskable-512.png` (512x512, con safe-area)
- `og.png` (1200x630, para OpenGraph)

Sugerencia visual: letra **P** blanca sobre fondo `#0a0a0a`, o el simbolo del palmito.

## Privacidad

Pauma no envia audio a sus propios servidores en v0.1. Todo el reconocimiento de voz lo hace el motor del navegador (Web Speech API). La transcripcion vive solo en pantalla.

Cuando integremos APIs externas (v0.2+), se actualizara `/privacidad.html` y se avisara al usuario antes de activar.

## Filosofia

Pauma es gratis para uso personal. Siempre. Cualquier funcionalidad basica (transcripcion, deteccion de sonidos, llamadas asistidas con limite mensual) sera gratis. Si en el futuro hay coste de APIs externas, se cubrira con donaciones, sponsorships institucionales (FESOCA, CNSE) o un tier premium opcional, pero el nucleo accesible siempre sera gratuito.
