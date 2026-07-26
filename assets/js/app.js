/* =============================================================================
   Lucho RK — web oficial
   JS vanilla, sin dependencias. Todo lo configurable está en CONFIG.
   ============================================================================= */
(function () {
  'use strict';

  /* ===========================================================================
     CONFIGURACIÓN — edita solo este bloque
     =========================================================================== */
  var CONFIG = {

    /* -----------------------------------------------------------------------
       PREVIEW DE AUDIO
       Deja `src` vacío ('') y el reproductor no aparecerá: el botón "Escuchar"
       del hero seguirá funcionando como enlace al reproductor de Spotify.

       Para activarlo, sube un MP3 a Cloudflare R2 (ver README) y pega la URL.
       Usa SOLO música sobre la que el artista tenga derechos.
       IMPORTANTE: el bucket de R2 necesita CORS con Access-Control-Allow-Origin
       apuntando a tu dominio, o el navegador bloqueará la reproducción.
       ----------------------------------------------------------------------- */
    audio: {
      src: '',                                   // p.ej. 'https://pub-xxxxx.r2.dev/preview.mp3'
      title: 'Preview',                          // título que se muestra en la barra
      artist: 'Lucho RK',
      album: '',
      artwork: '/assets/img/cover.jpg',
      fadeInMs: 1500                             // fundido de entrada de volumen
    },

    /* -----------------------------------------------------------------------
       ALTA DE CORREO
       mode: 'fetch'  -> envío por AJAX (Formspree, Beehiiv API, Worker propio)
             'native' -> envío clásico del formulario (Mailchimp)
             ''       -> sin configurar: muestra un aviso en pantalla
       ----------------------------------------------------------------------- */
    newsletter: {
      mode: '',
      endpoint: ''                               // p.ej. 'https://formspree.io/f/xxxxxxx'
    },

    /* -----------------------------------------------------------------------
       EVENTOS DE ANALÍTICA
       Cloudflare Web Analytics mide páginas vistas, no eventos personalizados.
       Para eventos, apunta `endpoint` a un Worker propio, o usa Plausible/Umami
       (se detectan solos si su script está en la página).
       ----------------------------------------------------------------------- */
    analytics: {
      endpoint: '',                              // p.ej. 'https://eventos.tudominio.com/e'
      debug: false                               // true -> imprime los eventos en consola
    }
  };

  /* ===========================================================================
     UTILIDADES
     =========================================================================== */
  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function absUrl(path) {
    try { return new URL(path, location.href).href; } catch (e) { return path; }
  }

  function fmtTime(secs) {
    if (!isFinite(secs) || secs < 0) secs = 0;
    var m = Math.floor(secs / 60);
    var s = Math.floor(secs % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  /* ===========================================================================
     ANALÍTICA — un solo punto de entrada, varios destinos posibles
     =========================================================================== */
  function track(name, props) {
    props = props || {};
    if (CONFIG.analytics.debug) console.log('[evento]', name, props);

    if (typeof window.plausible === 'function') {
      window.plausible(name, { props: props });
    }
    if (window.umami && typeof window.umami.track === 'function') {
      window.umami.track(name, props);
    }
    if (typeof window.gtag === 'function') {
      window.gtag('event', name, props);
    }
    if (CONFIG.analytics.endpoint && navigator.sendBeacon) {
      try {
        var body = JSON.stringify({ event: name, props: props, path: location.pathname, ts: Date.now() });
        navigator.sendBeacon(CONFIG.analytics.endpoint, new Blob([body], { type: 'application/json' }));
      } catch (e) { /* la analítica nunca debe romper la página */ }
    }
  }

  // Eventos declarativos: cualquier elemento con data-track se mide solo
  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-track]');
    if (!el) return;
    track(el.getAttribute('data-track'), {
      red: el.getAttribute('data-net') || '',
      etiqueta: (el.getAttribute('data-title') || el.textContent || '').trim().slice(0, 60)
    });
  }, { passive: true });

  /* ===========================================================================
     DESBLOQUEO DE AUDIO
     Los navegadores exigen un gesto del usuario. Al primer toque en cualquier
     parte de la página creamos y reanudamos el AudioContext, para que la
     reproducción posterior no se quede bloqueada (sobre todo en iOS).
     =========================================================================== */
  var audioCtx = null;

  function unlockAudio() {
    if (audioCtx) return;
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    try {
      audioCtx = new Ctx();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { audioCtx = null; }
  }

  ['pointerdown', 'keydown', 'touchstart'].forEach(function (evt) {
    document.addEventListener(evt, unlockAudio, { once: true, passive: true });
  });

  /* ===========================================================================
     REPRODUCTOR
     Nunca reproduce solo. Solo suena tras un gesto explícito del usuario.
     El botón de pausa está siempre visible y operativo (WCAG 1.4.2, nivel A).
     =========================================================================== */
  var audio    = $('#audio');
  var player   = $('#player');
  var toggle   = $('#toggle');
  var seek     = $('#seek');
  var timeEl   = $('#player-time');
  var titleEl  = $('#player-title');
  var artEl    = $('#player-art');
  var icoPlay  = $('#ico-play');
  var icoPause = $('#ico-pause');
  var heroPlay = $('#hero-play');
  var heroLbl  = $('#hero-play-label');

  var hasAudio = !!(CONFIG.audio.src && CONFIG.audio.src.trim());
  var seeking  = false;
  var fadeRaf  = null;

  function setPlayingUI(playing) {
    icoPlay.hidden  = playing;
    icoPause.hidden = !playing;
    toggle.setAttribute('aria-label', playing ? 'Pausar' : 'Reproducir');
    if (heroLbl) heroLbl.textContent = playing ? 'Pausar' : 'Escuchar';
  }

  // Fundido con requestAnimationFrame sobre audio.volume.
  // (Nota: iOS ignora audio.volume; allí simplemente arranca a volumen normal.)
  function fadeTo(target, ms) {
    if (fadeRaf) cancelAnimationFrame(fadeRaf);
    if (!ms) { audio.volume = target; return; }
    var from = audio.volume;
    var t0 = performance.now();
    (function step(now) {
      var p = Math.min(1, (now - t0) / ms);
      audio.volume = from + (target - from) * p;
      if (p < 1) fadeRaf = requestAnimationFrame(step);
    })(t0);
  }

  function play() {
    unlockAudio();
    audio.volume = 0;
    var p = audio.play();
    if (p && p.catch) {
      p.then(function () {
        fadeTo(1, CONFIG.audio.fadeInMs);
        track('audio_play', { pista: CONFIG.audio.title });
      }).catch(function () {
        // El navegador rechazó la reproducción: dejamos la UI en pausa.
        setPlayingUI(false);
      });
    }
  }

  function pause() {
    // Pausa inmediata, sin fundido: el control debe responder al instante.
    if (fadeRaf) cancelAnimationFrame(fadeRaf);
    audio.pause();
    audio.volume = 1;
  }

  function setupMediaSession() {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: CONFIG.audio.title,
      artist: CONFIG.audio.artist,
      album: CONFIG.audio.album || CONFIG.audio.artist,
      artwork: [
        { src: absUrl(CONFIG.audio.artwork), sizes: '320x320', type: 'image/jpeg' },
        { src: absUrl('/assets/img/icon-512.png'), sizes: '512x512', type: 'image/png' }
      ]
    });
    navigator.mediaSession.setActionHandler('play', play);
    navigator.mediaSession.setActionHandler('pause', pause);
    navigator.mediaSession.setActionHandler('seekto', function (d) {
      if (d.fastSeek && audio.fastSeek) { audio.fastSeek(d.seekTime); return; }
      audio.currentTime = d.seekTime;
    });
    try {
      navigator.mediaSession.setActionHandler('seekbackward', function () {
        audio.currentTime = Math.max(0, audio.currentTime - 10);
      });
      navigator.mediaSession.setActionHandler('seekforward', function () {
        audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 10);
      });
    } catch (e) { /* acciones no soportadas en este navegador */ }
  }

  if (hasAudio) {
    audio.src = CONFIG.audio.src;
    audio.preload = 'metadata';
    titleEl.textContent = CONFIG.audio.title;
    artEl.src = CONFIG.audio.artwork;
    artEl.alt = 'Carátula de ' + CONFIG.audio.title;
    player.hidden = false;
    document.body.style.setProperty('--player-h', '76px');

    toggle.addEventListener('click', function () {
      audio.paused ? play() : pause();
    });

    // El botón del hero deja de ser un ancla y pasa a controlar el reproductor
    if (heroPlay) {
      heroPlay.addEventListener('click', function (ev) {
        ev.preventDefault();
        audio.paused ? play() : pause();
      });
    }

    audio.addEventListener('play', function () {
      setPlayingUI(true);
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    });
    audio.addEventListener('pause', function () {
      setPlayingUI(false);
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    });
    audio.addEventListener('ended', function () {
      setPlayingUI(false);
      audio.currentTime = 0;
      seek.value = 0;
    });

    audio.addEventListener('loadedmetadata', function () {
      seek.disabled = false;
      timeEl.textContent = fmtTime(audio.duration);
      setupMediaSession();
    });

    audio.addEventListener('timeupdate', function () {
      if (seeking || !audio.duration) return;
      seek.value = Math.round((audio.currentTime / audio.duration) * 1000);
      timeEl.textContent = fmtTime(audio.duration - audio.currentTime);
      if ('mediaSession' in navigator && navigator.mediaSession.setPositionState) {
        try {
          navigator.mediaSession.setPositionState({
            duration: audio.duration,
            position: audio.currentTime,
            playbackRate: audio.playbackRate
          });
        } catch (e) { /* algunos navegadores lo rechazan durante la carga */ }
      }
    });

    audio.addEventListener('error', function () {
      titleEl.textContent = 'No se pudo cargar el audio';
      toggle.disabled = true;
      seek.disabled = true;
    });

    seek.addEventListener('input', function () { seeking = true; });
    seek.addEventListener('change', function () {
      if (audio.duration) audio.currentTime = (seek.value / 1000) * audio.duration;
      seeking = false;
    });

    setPlayingUI(false);
  } else {
    // Sin preview: la barra no se muestra y el body no reserva espacio.
    document.body.style.paddingBottom = '0';
  }

  /* ===========================================================================
     FACHADA DE YOUTUBE — el iframe solo se crea al pulsar
     =========================================================================== */
  $$('.video').forEach(function (card) {
    card.addEventListener('click', function (ev) {
      var id = card.getAttribute('data-yt');
      if (!id) return;                       // sin id, el enlace hace su trabajo
      ev.preventDefault();

      var frame = document.createElement('iframe');
      frame.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0';
      frame.title = card.getAttribute('data-title') || 'Vídeo de Lucho RK';
      frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
      frame.allowFullscreen = true;
      frame.setAttribute('loading', 'eager');

      card.innerHTML = '';
      card.appendChild(frame);
      card.classList.add('is-live');

      // Si sonaba el preview, lo paramos: nunca dos audios a la vez.
      if (hasAudio && !audio.paused) pause();
    });
  });

  /* ===========================================================================
     CONCIERTOS AUTOMÁTICOS
     Pide las fechas a /api/conciertos (Cloudflare Pages Function), que consulta
     Bandsintown o Ticketmaster. Spotify no ofrece API pública de conciertos:
     las fechas que muestra vienen de estos mismos proveedores.

     Mejora progresiva: si no hay API, falla la red o no hay fechas, se queda el
     estado vacío que ya viene en el HTML. Nunca deja la sección rota.
     =========================================================================== */
  var listaConciertos = $('#lista-conciertos');

  var MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
               'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  var MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                      'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  // Los proveedores devuelven el país en inglés. En una fecha española sobra
  // (y hace que la fila salte a dos líneas); en las de fuera, sí interesa.
  var PAISES = {
    'Spain': '', 'España': '',
    'France': 'Francia', 'Germany': 'Alemania', 'Italy': 'Italia',
    'Portugal': 'Portugal', 'United Kingdom': 'Reino Unido',
    'Netherlands': 'Países Bajos', 'Belgium': 'Bélgica', 'Switzerland': 'Suiza',
    'Mexico': 'México', 'Argentina': 'Argentina', 'Chile': 'Chile',
    'Colombia': 'Colombia', 'United States': 'Estados Unidos'
  };

  function pais(nombre) {
    if (!nombre) return '';
    return PAISES.hasOwnProperty(nombre) ? PAISES[nombre] : nombre;
  }

  function el(tag, cls, texto) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (texto != null) n.textContent = texto;   // textContent, nunca innerHTML:
    return n;                                   // el contenido viene de una API externa
  }

  function filaConcierto(ev) {
    var d = new Date(ev.fecha);
    if (isNaN(d)) return null;

    var li = el('li', 'show');

    var time = el('time', 'show-date');
    time.dateTime = d.toISOString().slice(0, 10);
    time.appendChild(el('span', 'd', String(d.getDate())));
    time.appendChild(el('span', 'm', MESES[d.getMonth()]));
    li.appendChild(time);

    var info = el('div', 'show-info');
    info.appendChild(el('div', 'show-city', ev.ciudad || ev.titulo || 'Por confirmar'));
    var sitio = [ev.recinto, pais(ev.pais)].filter(Boolean).join(' · ');
    if (sitio) info.appendChild(el('div', 'show-venue', sitio));
    li.appendChild(info);

    if (ev.url) {
      var a = el('a', 'btn btn-ghost', 'Entradas');
      a.href = ev.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.setAttribute('data-track', 'tickets_click');
      // Contexto solo para lectores de pantalla: "Entradas" a secas se repite
      // en cada fila y no dice a qué concierto pertenece.
      var oculto = el('span', 'visually-hidden',
        ' para ' + (ev.ciudad || 'este concierto') + ', ' + d.getDate() + ' de ' + MESES_LARGOS[d.getMonth()]);
      a.appendChild(oculto);
      li.appendChild(a);
    }
    return li;
  }

  if (listaConciertos && listaConciertos.hasAttribute('data-auto')) {
    fetch('/api/conciertos', { headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (datos) {
        if (!datos || !datos.eventos || !datos.eventos.length) return;

        var ul = el('ul', 'shows');
        datos.eventos.forEach(function (ev) {
          var fila = filaConcierto(ev);
          if (fila) ul.appendChild(fila);
        });
        if (!ul.children.length) return;      // ninguna fecha era válida: no tocamos nada

        listaConciertos.innerHTML = '';
        listaConciertos.appendChild(ul);
        track('conciertos_cargados', { fuente: datos.fuente, total: ul.children.length });
      })
      .catch(function () { /* sin conexión o sin función: se queda el estado vacío */ });
  }

  /* ===========================================================================
     FORMULARIO DE CORREO
     =========================================================================== */
  var form = $('#newsletter-form');
  var status = $('#form-status');

  function say(msg, state) {
    status.textContent = msg;
    status.setAttribute('data-state', state);
  }

  if (form) {
    if (CONFIG.newsletter.mode === 'native' && CONFIG.newsletter.endpoint) {
      // Envío clásico (Mailchimp): el navegador se encarga, sin interceptar.
      form.action = CONFIG.newsletter.endpoint;
      form.addEventListener('submit', function () { track('email_signup', { via: 'native' }); });
    } else {
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();

        var email = $('#email').value.trim();
        var honeypot = $('#website').value;

        if (honeypot) return;                       // bot: fingimos éxito y no enviamos
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          say('Revisa el correo, parece que falta algo.', 'err');
          $('#email').focus();
          return;
        }

        if (!CONFIG.newsletter.endpoint) {
          say('El alta todavía no está conectada. Configura CONFIG.newsletter en app.js.', 'err');
          return;
        }

        var btn = $('button[type="submit"]', form);
        btn.disabled = true;
        say('Enviando…', '');

        fetch(CONFIG.newsletter.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ email: email })
        })
          .then(function (res) {
            if (!res.ok) throw new Error(res.status);
            form.reset();
            say('¡Hecho! Ya estás dentro. Nos vemos en tu bandeja de entrada.', 'ok');
            track('email_signup', { via: 'fetch' });
          })
          .catch(function () {
            say('No hemos podido apuntarte. Inténtalo de nuevo en un momento.', 'err');
          })
          .then(function () { btn.disabled = false; });
      });
    }
  }

  /* ===========================================================================
     APARICIÓN AL HACER SCROLL — se desactiva con prefers-reduced-motion
     =========================================================================== */
  var reveals = $$('.reveal');
  if (reducedMotion || !('IntersectionObserver' in window)) {
    reveals.forEach(function (el) { el.classList.add('is-visible'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.05 });
    reveals.forEach(function (el) { io.observe(el); });
  }

  /* ===========================================================================
     DETALLES
     =========================================================================== */
  var year = $('#year');
  if (year) year.textContent = new Date().getFullYear();
})();
