# Pauma

Asistente IA para personas sordas. Transcripcion en vivo con identificacion de hablantes, modo "yo hablo" con voz natural, historial local cifrado y deteccion de tono.

## Datos del proyecto

- Producto: **Pauma**
- Dominio: **https://maluap.es** (palindromo de pauma)
- Stack: PWA (HTML/CSS/JS vanilla) + PHP 8.1 (proxies de API)
- Hosting: Hostinger shared
- Ruta remota: `/home/u862342697/domains/maluap.es/public_html/`
- Repo: `ilernetworklleida/pauma`
- Rama: `main`

## Estructura

```
.
├── index.html              landing publica (SEO, JSON-LD)
├── privacidad.html         politica de privacidad
├── app/index.html          app principal (single-page con 4 vistas)
├── api/
│   ├── token.php           proxy a Deepgram (token + config)
│   └── tts.php             proxy a ElevenLabs (texto a voz)
├── src/
│   ├── bootstrap.php       autoloader manual
│   └── Pauma/
│       ├── Config.php      lee .env
│       └── RateLimiter.php proteccion abuso por IP
├── assets/
│   ├── css/style.css       dark theme, custom properties
│   ├── js/app.js           todo el motor: STT, TTS, IndexedDB, UI
│   └── icons/icon.svg      icono fuente (generar PNGs desde aqui)
├── manifest.json           PWA instalable, shortcuts
├── sw.js                   service worker (app-shell cache)
├── robots.txt              indexable + sitemap
├── sitemap.xml             paginas publicas
├── composer.json           PSR-4 Pauma\
├── deploy.sh               rsync a Hostinger
├── .env.example            plantilla de variables
├── .gitignore
└── README.md
```

## Configuracion

1. Copia `.env.example` a `.env` y rellena:
   ```
   DEEPGRAM_API_KEY=...      # https://console.deepgram.com (signup gratis ~$200 de credito)
   ELEVENLABS_API_KEY=...    # https://elevenlabs.io (signup gratis ~10.000 chars/mes)
   ELEVENLABS_VOICE_ID=...   # voz por defecto (Rachel: 21m00Tcm4TlvDq8ikWAM)
   ```

2. `.env` debe quedar fuera del web root cuando se despliegue, o protegido por `.htaccess`.
   En Hostinger el deploy.sh excluye `.env`. Subelo MANUALMENTE por SFTP al directorio
   raiz del proyecto (un nivel por encima de public_html si la estructura lo permite),
   o ajusta la lectura en src/Pauma/Config.php.

## Roadmap

| Version | Funcionalidad | Estado |
|---|---|---|
| v0.1 | Subtitulador con Web Speech API + PWA + privacidad | hecho |
| **v0.2** | **Deepgram diarizacion + modo "yo hablo" + historial + tono + onboarding** | **hecho** |
| v0.3 | Proxy WebSocket (no exponer key cliente) + analytics anonimo | pendiente |
| v0.4 | Asistente telefonico (Twilio + Deepgram + ElevenLabs) | pendiente |
| v0.5 | Resumen de notas de voz WhatsApp (Share Target API) | pendiente |
| v0.6 | Deteccion de sonidos del hogar (alarma, timbre, nombre) | pendiente |

## Deploy

```bash
bash deploy.sh
```

## Iconos PNG

`assets/icons/icon.svg` es la fuente. Generar los PNG manualmente:

- `icon-192.png` (192x192)
- `icon-512.png` (512x512)
- `icon-maskable-512.png` (512x512, padding 12%)
- `og.png` (1200x630, para OpenGraph)

Con ImageMagick:
```bash
magick assets/icons/icon.svg -resize 192x192 assets/icons/icon-192.png
magick assets/icons/icon.svg -resize 512x512 assets/icons/icon-512.png
```

O con realfavicongenerator.net subiendo el SVG.

## Costes operativos estimados

- Deepgram Nova-2 streaming: ~$0.0043/min = ~$0.26/h. Con 2h/dia = ~16 USD/mes.
  Plan gratuito: $200 de credito inicial (suficiente para meses).
- ElevenLabs: plan gratis 10.000 chars/mes (~uso normal). Plan starter $5/mes para 30.000 chars.
- Hostinger: ya pagado.

**Realista: 15-25 EUR/mes una vez en uso intensivo. 0 EUR mientras este en pruebas.**

## Privacidad

Lee `/privacidad.html`. Resumen:
- Audio se envia a Deepgram (cifrado TLS) y no se almacena.
- Transcripcion se guarda solo en el navegador del usuario (IndexedDB), opcional.
- Texto del modo "yo hablo" se envia a ElevenLabs, no se almacena.
- 0 cookies de seguimiento, 0 analytics de terceros.

## Filosofia

Pauma es gratis para uso personal y siempre lo sera. La accesibilidad no se vende. Si los costes de API escalan, se cubriran con donaciones, subvenciones o un tier premium para empresas que quieran ofrecerla a sus empleados sordos, pero el nucleo accesible nunca tendra paywall.
