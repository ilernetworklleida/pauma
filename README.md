# Pauma

Asistente IA para personas sordas. Transcripcion en vivo con diarizacion, modo "yo hablo" con voz natural, historial local con buscador, modo SOS para urgencias, push-to-talk y deteccion de tono.

## Datos del proyecto

- Producto: **Pauma**
- Dominio: **https://maluap.es** (palindromo de pauma)
- Stack: PWA (HTML/CSS/JS vanilla) + PHP 8.1 + MySQL (opcional, v0.4+)
- Hosting: Hostinger shared
- Ruta remota: `/home/u862342697/domains/maluap.es/public_html/`
- Repo: `ilernetworklleida/pauma`
- Rama: `main`

## Estructura

```
.
├── index.html              landing publica (SEO completo, JSON-LD)
├── privacidad.html         politica de privacidad honesta
├── 404.html                pagina no encontrada
├── .htaccess               HTTPS, CSP, cache, proteccion archivos
├── app/index.html          app principal (single-page, 5 vistas)
├── api/
│   ├── token.php           proxy a Deepgram, emite temp key 5 min
│   ├── revoke.php          revoca temp key al cerrar sesion
│   ├── tts.php             proxy a ElevenLabs
│   └── health.php          estado del sistema (sin info sensible)
├── src/
│   ├── bootstrap.php       autoloader manual + carga .env
│   └── Pauma/
│       ├── Config.php      lee .env
│       ├── RateLimiter.php proteccion abuso por IP
│       ├── Deepgram.php    cliente para crear/revocar temp keys
│       └── Database.php    wrapper PDO MySQL (futuro)
├── migrations/
│   └── 001_init.sql        esquema MySQL (cuentas, feedback, llamadas)
├── assets/
│   ├── css/style.css       dark theme con custom properties
│   ├── js/app.js           motor completo (~1300 lineas)
│   └── icons/
│       ├── icon.svg        icono fuente (la P + ondas)
│       ├── og.svg          OpenGraph 1200x630
│       └── generate.sh     genera PNGs desde SVGs
├── manifest.json           PWA + shortcuts + share_target
├── sw.js                   service worker con auto-update + share handler
├── robots.txt
├── sitemap.xml
├── composer.json
├── deploy.sh               rsync a Hostinger
├── .env.example
├── .gitignore
└── README.md
```

## Funcionalidades v0.3

| | |
|---|---|
| **Transcripcion** | Deepgram Nova-2 streaming en es-ES / ca / en con diarizacion. Fallback Web Speech API. |
| **Diarizacion** | Hasta 8 hablantes con colores, renombrables y persistentes |
| **Tono emocional** | Etiquetas (alegre / irritado / cariñoso / preocupado / pregunta) |
| **Yo hablo (TTS)** | ElevenLabs multilingual_v2 con voz natural. Frases rapidas por categorias. |
| **Categorias frases** | General / Urgencia / Medico / Compras / Transporte / Social, editables |
| **Frases recientes** | Las ultimas 8 que ha dicho, accesibles con un toque |
| **Modo SOS** | Pantalla pensada para desconocidos (urgencias, medico, taxi) |
| **Push-to-talk** | Opcional en Ajustes: mantener pulsado el mic |
| **Historial** | IndexedDB local con buscador + renombrar sesiones + exportar TXT + compartir |
| **Estadisticas** | Conversaciones, tiempo y persona mas frecuente de los ultimos 7 dias |
| **Onboarding** | 4 pantallas la primera vez |
| **PWA** | Instalable, shortcuts (Transcribir, Yo hablo, SOS), share_target (audio) |
| **Auto-update** | Avisa cuando hay nueva version y recarga |
| **Wake Lock** | Pantalla no se apaga mientras escucha |
| **Seguridad** | Temp keys Deepgram (TTL 5 min), CORS, rate limit, .htaccess, HSTS |

## Configuracion

1. Copia `.env.example` a `.env` y rellena. Las claves criticas:

   ```bash
   DEEPGRAM_API_KEY=...                # https://console.deepgram.com
   DEEPGRAM_PROJECT_ID=...              # del Project Settings
   DEEPGRAM_USE_TEMP_KEYS=1             # seguridad recomendada

   ELEVENLABS_API_KEY=...               # https://elevenlabs.io
   ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM  # Rachel por defecto

   ALLOWED_ORIGIN=https://maluap.es
   ```

2. En Hostinger: por SFTP sube `.env` al directorio del proyecto. Hostinger
   no permite carpetas fuera de public_html en shared, asi que el `.htaccess`
   bloquea el acceso por web a `.env.*`.

3. Si quieres activar la base de datos (v0.4+):

   ```bash
   DB_HOST=localhost
   DB_NAME=tu_db
   DB_USER=tu_user
   DB_PASS=tu_password
   ```

   Importa el esquema:
   ```bash
   mysql -u user -p tu_db < migrations/001_init.sql
   ```

## Roadmap

| Version | Funcionalidad | Estado |
|---|---|---|
| v0.1 | Subtitulador Web Speech + PWA + privacidad | hecho |
| v0.2 | Deepgram diarizacion + modo "yo hablo" + historial + tono + onboarding | hecho |
| **v0.3** | **SOS + categorias frases + buscador historial + temp keys + share_target + auto-update + stats** | **hecho** |
| v0.4 | Asistente telefonico (Twilio + Deepgram + ElevenLabs) | pendiente |
| v0.5 | Resumen de notas de voz WhatsApp (share_target activo) | pendiente |
| v0.6 | Deteccion de sonidos del hogar (alarma, timbre, nombre) | pendiente |
| v0.7 | Cuentas + sincronizacion entre dispositivos (DB) | pendiente |

## Deploy

```bash
bash deploy.sh
```

## Iconos PNG

```bash
cd assets/icons
bash generate.sh    # requiere ImageMagick
```

Alternativas: https://realfavicongenerator.net/svg_favicon

## Costes operativos estimados

- **Deepgram Nova-2 streaming**: ~$0.0043/min = $0.26/h. Plan free $200 USD inicial.
- **ElevenLabs**: 10k chars/mes gratis. Plan starter $5/mes para 30k chars.
- **Hostinger**: ya pagado.
- **MySQL**: incluido en Hostinger.

**Realista**: 15-25 EUR/mes en uso intensivo. 0 EUR mientras este en pruebas.

## Privacidad

Lee `/privacidad.html`. Resumen:

- Audio se envia cifrado (TLS) a Deepgram y no se almacena.
- Transcripcion se guarda solo en el dispositivo (IndexedDB), opcional.
- Texto del modo "yo hablo" se envia a ElevenLabs y no se almacena.
- Temp keys Deepgram expiran en 5 minutos. Se revocan al cerrar sesion.
- 0 cookies de seguimiento. 0 analytics de terceros. 0 anuncios.

## Filosofia

Pauma es gratis para uso personal y siempre lo sera. La accesibilidad no se vende.

Si los costes de API escalan, se cubriran con donaciones, subvenciones o un tier premium para empresas que quieran ofrecerla a sus empleados sordos, pero el nucleo accesible nunca tendra paywall.
