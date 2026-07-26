# Lucho RK — web oficial

Landing / link-in-bio estática para el artista **Lucho RK** (Emilio Roca Cáceres).
HTML + CSS + JS vanilla, sin frameworks ni dependencias. Pensada para Cloudflare Pages.

---

## ⚠️ Antes de publicar: qué hay que sustituir

La web funciona tal cual, pero lleva datos de ejemplo. Repasa esta lista:

| Dónde | Qué cambiar |
|---|---|
| `index.html` (todo el `<head>`) | `https://luchork.pages.dev` → tu dominio real. Sale 5 veces: `canonical`, `og:url`, `og:image`, `twitter:image` y el JSON-LD. **La `og:image` tiene que ser una URL absoluta o WhatsApp no mostrará la imagen.** |
| `robots.txt`, `sitemap.xml` | El mismo dominio |
| `assets/img/hero.*` | El retrato de verdad (ahora hay un marcador que pone «SUSTITUIR POR RETRATO»). Ver *Imágenes* abajo. |
| `assets/img/og.jpg` | Imagen para compartir, 1200×630 |
| `index.html` → sección `#conciertos` | Las fechas reales (ver *Conciertos*) |
| `index.html` → `<footer>` | `booking@ejemplo.com` y `prensa@ejemplo.com` por los correos reales, y el enlace del EPK |
| `index.html` → final del `<body>` | `"token": "TU_TOKEN"` por el token de Cloudflare Web Analytics |
| `assets/js/app.js` → `CONFIG` | Preview de audio, alta de correo y eventos (ver abajo) |

Los enlaces a Spotify, YouTube, Instagram y TikTok ya apuntan a los perfiles
encontrados públicamente. **Verifícalos** antes de publicar, sobre todo los IDs
de los vídeos de YouTube.

---

## Desplegar desde el móvil

Todo desde el navegador, sin ordenador:

1. Entra en [dash.cloudflare.com](https://dash.cloudflare.com) y crea una cuenta si no la tienes.
2. Menú lateral → **Workers y Pages** → **Crear** → pestaña **Pages** → **Conectar a Git**.
3. Autoriza GitHub y elige el repositorio `javox08/Redes-lucho-rk`.
4. En la configuración de compilación:
   - **Preajuste del framework**: `None` / Ninguno
   - **Comando de compilación**: *déjalo vacío*
   - **Directorio de salida**: `/`  (una barra; el sitio está en la raíz)
5. **Guardar e implementar**. En un minuto tendrás una URL `*.pages.dev`.

A partir de ahí, **cada push a la rama principal se publica solo**. Para editar
desde el móvil: abre el fichero en GitHub, pulsa el lápiz, guarda, y Cloudflare
reconstruye en segundos.

### Dominio propio

En el proyecto de Pages → **Dominios personalizados** → **Configurar dominio**.
Si el dominio ya está en Cloudflare, el DNS se configura solo. Después acuérdate
de cambiar las URLs del `<head>`, `robots.txt` y `sitemap.xml`.

---

## Preview de audio

El reproductor está desactivado de fábrica: `CONFIG.audio.src` va vacío y la
barra flotante no aparece. El botón «Escuchar» del hero funciona igual, llevando
al reproductor de Spotify.

Para activarlo:

1. Sube el MP3 a **Cloudflare R2** (Dashboard → R2 → crear bucket → subir).
2. Activa el acceso público del bucket y copia la URL del fichero.
3. Configura CORS en el bucket para que el navegador no bloquee la reproducción:

   ```json
   [{ "AllowedOrigins": ["https://tudominio.com"],
      "AllowedMethods": ["GET", "HEAD"],
      "AllowedHeaders": ["*"] }]
   ```

4. Pega la URL en `assets/js/app.js`:

   ```js
   audio: {
     src: 'https://pub-xxxxx.r2.dev/preview.mp3',
     title: 'GUAYA',
     artist: 'Lucho RK',
     artwork: '/assets/img/cover.jpg',
     fadeInMs: 1500
   }
   ```

Usa solo música sobre la que el artista tenga los derechos. Si no los tienes,
deja `src` vacío y que la reproducción vaya por el embed de Spotify.

**El servidor del audio debe aceptar peticiones `Range`** o la barra de progreso
no podrá saltar de posición. R2 y Cloudflare Pages las soportan de serie.

### Cómo se comporta el reproductor

- **Nunca suena solo.** Solo arranca tras un clic o pulsación del usuario.
- Al primer toque en cualquier parte de la página se desbloquea el `AudioContext`
  (necesario en iOS).
- El volumen entra con un fundido de 0 a 1 en 1,5 s. La pausa, en cambio, es
  instantánea y sin fundido: el control tiene que responder al momento
  (WCAG 1.4.2 «Control del audio», nivel A).
- Integra la **Media Session API**, así que salen carátula, título y controles
  en la pantalla de bloqueo del móvil.
- iOS ignora `audio.volume` por diseño del sistema: allí el fundido no se aplica
  y el audio arranca directamente al volumen del dispositivo.

---

## Alta de correo

En `assets/js/app.js`, bloque `CONFIG.newsletter`:

**Formspree, Beehiiv o un Worker propio** (envío por AJAX, sin recargar):

```js
newsletter: { mode: 'fetch', endpoint: 'https://formspree.io/f/xxxxxxx' }
```

**Mailchimp** (necesita envío clásico del formulario):

```js
newsletter: { mode: 'native', endpoint: 'https://TU-CUENTA.us1.list-manage.com/subscribe/post?u=...&id=...' }
```

El formulario ya trae validación de correo y una trampa antispam invisible.

---

## Analítica

El snippet de **Cloudflare Web Analytics** está al final de `index.html`; solo
falta el token (Dashboard → Web Analytics → añadir sitio).

Cloudflare Web Analytics mide páginas vistas, **no eventos personalizados**. La
web ya dispara eventos (`platform_click`, `video_play`, `email_signup`,
`audio_play`, `tickets_click`, `epk_click`, `save_click`) a través de la función
`track()` de `app.js`, que los envía a lo que tengas disponible:

- Plausible o Umami, si añades su script (se detectan solos).
- Un endpoint propio: `CONFIG.analytics.endpoint = 'https://.../evento'`.
- Para verlos por consola mientras pruebas: `CONFIG.analytics.debug = true`.

Cualquier elemento con `data-track="nombre_evento"` se mide solo, sin tocar JS.

---

## Conciertos

Por defecto la sección muestra «Nuevas fechas muy pronto», para no anunciar
conciertos que no existen. Dentro de `index.html`, en `#conciertos`, hay un
bloque comentado con el formato listo:

```html
<li class="show">
  <time class="show-date" datetime="2026-09-12">
    <span class="d">12</span><span class="m">Sep</span>
  </time>
  <div class="show-info">
    <div class="show-city">Madrid</div>
    <div class="show-venue">Sala La Riviera</div>
  </div>
  <a class="btn btn-ghost" data-track="tickets_click" href="..." target="_blank" rel="noopener">
    Entradas<span class="visually-hidden"> para Madrid, 12 de septiembre</span>
  </a>
</li>
```

Borra el `.empty-state`, descomenta el `<ul class="shows">` y duplica el `<li>`
por cada fecha. El `datetime` es el que leen los lectores de pantalla.

---

## Imágenes

Los ficheros de `assets/img/` son **marcadores generados**, no fotos reales.
Sustitúyelos manteniendo nombres y proporciones:

| Fichero | Tamaño | Para qué |
|---|---|---|
| `hero.avif` / `.webp` / `.jpg` | 1080×1440 (3:4) | Retrato del hero |
| `hero-540.avif` / `.webp` | 540×720 | Versión para móvil |
| `og.jpg` | 1200×630 | Compartir en WhatsApp, Instagram, X |
| `cover.jpg` / `.webp` | 320×320 | Carátula del reproductor |
| `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` | cuadrados | Icono de app |

Para convertir a AVIF/WebP desde el móvil sirve [squoosh.app](https://squoosh.app).
Si cambias las proporciones, ajusta también `width` y `height` en el `<img>`
correspondiente, o aparecerá salto de diseño (CLS).

---

## Estructura

```
index.html          Todo el marcado + el CSS incrustado en el <head>
assets/js/app.js    Reproductor, fachada de YouTube, formulario, eventos
assets/fonts/       Inter (variable) y Space Grotesk, recortadas al alfabeto usado
assets/img/         Imágenes (marcadores, sustituir)
_headers            Cabeceras de Cloudflare Pages: caché, seguridad, CSP
favicon.svg  site.webmanifest  robots.txt  sitemap.xml
```

### Por qué el CSS va incrustado

Son ~13 KB que viajan con el HTML en la primera respuesta. Como fichero aparte
sería una petición de bloqueo de render extra, y con un CSS tan pequeño sale
más caro el viaje que los bytes. Por el mismo motivo las fuentes están
auto-alojadas y recortadas al alfabeto latino con acentos españoles: cero
peticiones a dominios externos.

Ese CSS incrustado es también la razón de que la CSP de `_headers` lleve
`'unsafe-inline'` **solo** en `style-src`. Los scripts siguen en modo estricto.

---

## Decisiones de accesibilidad

- Contraste AA verificado en todos los pares texto/fondo. Los ratios están
  anotados junto a cada variable de color en el `:root` del CSS.
- Todo navegable por teclado, con `:focus-visible` dorado bien visible y enlace
  de «Saltar al contenido».
- La barra de progreso es un `<input type="range">` real: se maneja con las
  flechas del teclado y lo anuncian los lectores de pantalla.
- Los botones de icono llevan `aria-label`, que cambia entre «Reproducir» y
  «Pausar» según el estado.
- Objetivos táctiles de 44×44 px mínimo (comprobado).
- `prefers-reduced-motion` desactiva las apariciones al hacer scroll y las
  transiciones; el contenido se muestra directamente, sin depender del scroll.

## Funciona sin JavaScript

Todo el contenido esencial es HTML plano. Sin JS:

- Los enlaces a plataformas y redes funcionan.
- Los vídeos son enlaces normales que abren YouTube.
- El botón «Escuchar» lleva al reproductor de Spotify.
- La barra del reproductor no aparece (no haría nada).
- El formulario envía de forma clásica si configuras `mode: 'native'`.

---

## Desarrollo local

```bash
python3 -m http.server 8000
# http://localhost:8000
```

Para probar el reproductor en local necesitas un servidor con soporte de
`Range`; el de Python no lo tiene y la barra de progreso no podrá saltar.
En producción (Pages + R2) funciona sin más.
