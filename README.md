# ⚽ Polla Mundialista

App web para pronosticar resultados de partidos y competir en una tabla de posiciones.
**Stack:** Astro (SSR) + Tailwind CSS v4 + Supabase (PostgreSQL, Auth, RLS).

## Sistema de puntos

| Acierto | Puntos |
|---|---|
| Marcador exacto | **5** |
| Diferencia de goles correcta (mismo ganador) | **3** |
| Ganador o empate correcto | **2** |
| Sin acierto | **0** |

---

## 1. Configurar Supabase

1. Crea un proyecto gratis en [supabase.com](https://supabase.com).
2. Ve a **SQL Editor** → New query → pega el contenido de [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
   - Crea tablas (`profiles`, `matches`, `predictions`), la vista `leaderboard`, el motor de puntos, los triggers y las políticas RLS.
3. (Opcional) Ejecuta [`supabase/seed.sql`](supabase/seed.sql) para cargar partidos de ejemplo.
4. **Auth → Providers → Email**: para probar en local, desactiva *"Confirm email"* (así el registro inicia sesión al instante). En producción déjalo activado.
5. Copia tus credenciales en **Project Settings → API**:
   - `Project URL` → `PUBLIC_SUPABASE_URL`
   - `anon public` key → `PUBLIC_SUPABASE_ANON_KEY`

## 2. Configurar el proyecto

```bash
cp .env.example .env      # en Windows PowerShell:  Copy-Item .env.example .env
# edita .env con tu URL y anon key
npm install
npm run dev
```

Abre http://localhost:4321

## 3. Hacerte administrador

Regístrate desde la app. Luego, en el **SQL Editor** de Supabase:

```sql
update public.profiles set role = 'admin' where username = 'TU_USUARIO';
```

Vuelve a entrar y verás el menú **Admin** para crear partidos y registrar resultados.

---

## Cómo funciona

- **Registro/login**: Supabase Auth (email + contraseña). Sesión por cookies vía `@supabase/ssr`, gestionada en [`src/middleware.ts`](src/middleware.ts).
- **Pronósticos**: cada usuario guarda un marcador por partido. Se cierran 5 min antes del inicio — **validado en la base de datos por RLS**, no solo en la UI.
- **Motor de puntos**: cuando el admin registra el resultado, el trigger `trg_recalc_points` ejecuta `calculate_points()` sobre todos los pronósticos del partido.
- **Tabla**: la vista `leaderboard` agrega los puntos; desempate por resultados exactos.
- **Privacidad**: las políticas RLS impiden ver los pronósticos ajenos antes del cierre, y solo un `admin` puede crear partidos o cargar resultados.

## Estructura

```
supabase/schema.sql      Esquema completo (pegar en Supabase)
supabase/seed.sql        Fixture de ejemplo
src/middleware.ts        Sesión Supabase + carga de perfil
src/lib/supabase.ts      Cliente SSR ligado a cookies
src/lib/helpers.ts       Lógica de cierre, formato y badges de puntos
src/pages/               Páginas (inicio, login, registro, partidos, tabla, mis-pronosticos, admin)
src/pages/api/           Endpoints (auth, predictions, admin)
```

## Sincronizar el fixture del Mundial desde una API

En vez de cargar los partidos a mano, puedes traerlos automáticamente de
[football-data.org](https://www.football-data.org) (plan gratuito, incluye el Mundial `WC`).

1. Regístrate gratis en https://www.football-data.org/client/register y copia tu token.
2. Si ya tenías la base de datos creada, ejecuta [`supabase/migration_external_id.sql`](supabase/migration_external_id.sql) en el SQL Editor (añade la columna `external_id` para no duplicar).
3. En tu `.env` agrega:
   ```env
   FOOTBALL_DATA_TOKEN=tu-token
   FOOTBALL_COMPETITION=WC      # WC = Mundial (otras: CL, PL, PD, SA, BL1, FL1, EC...)
   ```
4. Entra como **admin** → panel **Admin** → botón **⟳ Sincronizar fixture**.

Trae todos los partidos y, al repetirlo, **actualiza los resultados** de los que ya se
jugaron. Como el marcador cambia en la base de datos, el trigger recalcula los puntos solo.
Re-sincronizar nunca duplica partidos (se identifican por `external_id`).

### Sincronización automática (cron / tarea programada)

Para que los resultados se actualicen solos sin que nadie entre, usa el script:

```bash
npm run sync          # usa node --env-file=.env scripts/sync-fixture.mjs
```

Necesita además `SUPABASE_SERVICE_ROLE_KEY` en el `.env` (Supabase → Project Settings → API → *service_role*; **es secreta**, no la subas al repo ni al cliente).

Prográmalo durante el torneo:
- **Windows** (Programador de tareas): ejecuta `npm run sync` cada, p. ej., 10 minutos.
- **Linux/cron**: `*/10 * * * * cd /ruta/app && npm run sync`
- **Supabase**: alternativamente puedes recrear esta lógica en un *Edge Function* + *cron* dentro de Supabase.

## Deploy

- **Frontend**: el adaptador por defecto es `@astrojs/node` (standalone). Para Vercel/Netlify cambia el adaptador en `astro.config.mjs` (`@astrojs/vercel` o `@astrojs/netlify`) y define las variables `PUBLIC_SUPABASE_URL` y `PUBLIC_SUPABASE_ANON_KEY` en el panel del proveedor.
- **Backend**: ya está en Supabase Cloud.

```bash
npm run build
node ./dist/server/entry.mjs   # arranque standalone
```
