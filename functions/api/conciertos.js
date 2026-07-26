/* =============================================================================
   GET /api/conciertos  —  Cloudflare Pages Function
   -----------------------------------------------------------------------------
   Devuelve las próximas fechas del artista en un formato único, vengan de donde
   vengan. La clave de la API vive en las variables de entorno de Cloudflare,
   nunca en el repositorio.

   Spotify NO tiene endpoint público de conciertos: las fechas que enseña las
   recibe de estos mismos proveedores, así que la lista sale igual.

   Variables de entorno (Pages → Configuración → Variables de entorno):
     ARTISTA                nombre del artista            (por defecto "Lucho RK")
     BANDSINTOWN_APP_ID     app_id de Bandsintown         (opcional)
     TICKETMASTER_API_KEY   clave de Ticketmaster         (opcional)
     PAIS                   código ISO para Ticketmaster  (por defecto "ES")

   Con las dos claves puestas se prueba Bandsintown y, si no devuelve nada,
   Ticketmaster. Sin ninguna, responde una lista vacía y la web deja el
   mensaje de "nuevas fechas muy pronto".
   ============================================================================= */

const CACHE_SEGUNDOS = 3600;   // 1 h: las giras no cambian cada minuto
const MAX_EVENTOS = 20;
const TIMEOUT_MS = 6000;

export async function onRequestGet(context) {
  const { env, request } = context;

  // Caché de borde: evita machacar la API del proveedor en cada visita
  const cache = caches.default;
  const cacheKey = new Request(new URL(request.url).toString(), request);
  const enCache = await cache.match(cacheKey);
  if (enCache) return enCache;

  const artista = (env.ARTISTA || 'Lucho RK').trim();
  let eventos = [];
  let fuente = 'ninguna';

  try {
    if (env.BANDSINTOWN_APP_ID) {
      eventos = await deBandsintown(artista, env.BANDSINTOWN_APP_ID);
      if (eventos.length) fuente = 'bandsintown';
    }
    if (!eventos.length && env.TICKETMASTER_API_KEY) {
      eventos = await deTicketmaster(artista, env.TICKETMASTER_API_KEY, env.PAIS || 'ES');
      if (eventos.length) fuente = 'ticketmaster';
    }
  } catch (e) {
    // Si el proveedor falla, la web se queda con su estado vacío. Nunca rompe.
    eventos = [];
    fuente = 'error';
  }

  eventos = eventos
    .filter(function (e) { return e.fecha && new Date(e.fecha) >= new Date(Date.now() - 864e5); })
    .sort(function (a, b) { return new Date(a.fecha) - new Date(b.fecha); })
    .slice(0, MAX_EVENTOS);

  const res = new Response(JSON.stringify({ fuente: fuente, actualizado: new Date().toISOString(), eventos: eventos }), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=' + CACHE_SEGUNDOS,
      'Access-Control-Allow-Origin': '*'
    }
  });

  context.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

/* --------------------------------------------------------------- utilidades */
function traer(url) {
  return fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cf: { cacheTtl: CACHE_SEGUNDOS, cacheEverything: true }
  });
}

/* ------------------------------------------------------------- Bandsintown */
async function deBandsintown(artista, appId) {
  const url = 'https://rest.bandsintown.com/artists/' + encodeURIComponent(artista) +
              '/events?app_id=' + encodeURIComponent(appId) + '&date=upcoming';
  const r = await traer(url);
  if (!r.ok) return [];

  const datos = await r.json();
  if (!Array.isArray(datos)) return [];   // la API responde un objeto cuando hay error

  return datos.map(function (e) {
    const v = e.venue || {};
    const oferta = (e.offers || []).find(function (o) { return o.type === 'Tickets' && o.url; });
    return {
      fecha: e.datetime || '',
      ciudad: v.city || '',
      region: v.region || '',
      pais: v.country || '',
      recinto: v.name || '',
      titulo: e.title || '',
      url: (oferta && oferta.url) || e.url || ''
    };
  });
}

/* ------------------------------------------------------------- Ticketmaster */
async function deTicketmaster(artista, apiKey, pais) {
  const url = 'https://app.ticketmaster.com/discovery/v2/events.json' +
              '?keyword=' + encodeURIComponent(artista) +
              '&countryCode=' + encodeURIComponent(pais) +
              '&sort=date,asc&size=' + MAX_EVENTOS +
              '&apikey=' + encodeURIComponent(apiKey);
  const r = await traer(url);
  if (!r.ok) return [];

  const datos = await r.json();
  const lista = (datos._embedded && datos._embedded.events) || [];

  return lista.map(function (e) {
    const inicio = (e.dates && e.dates.start) || {};
    const sede = (e._embedded && e._embedded.venues && e._embedded.venues[0]) || {};
    // localDate + localTime son hora local del recinto; sin hora, mediodía para
    // que ningún cambio de huso mueva el evento al día anterior.
    const fecha = inicio.localDate
      ? inicio.localDate + 'T' + (inicio.localTime || '12:00:00')
      : '';
    return {
      fecha: fecha,
      ciudad: (sede.city && sede.city.name) || '',
      region: (sede.state && sede.state.name) || '',
      pais: (sede.country && sede.country.name) || '',
      recinto: sede.name || '',
      titulo: e.name || '',
      url: e.url || ''
    };
  });
}
