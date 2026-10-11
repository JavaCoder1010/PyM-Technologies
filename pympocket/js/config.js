// Conexión con Supabase (cuentas y sincronización). Ver SUPABASE.md.
// Ambos valores están en Supabase → Project Settings → API.
// SUPABASE_URL es la dirección del proyecto de Supabase (termina en .supabase.co),
// no la dirección donde se publica la app.
// La clave "anon"/"publishable" es pública por diseño: la seguridad la dan las
// reglas de acceso (RLS) de la base, que solo dejan a cada usuario ver sus datos.
// Nunca pongas acá la clave "service_role"/"secret".

export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';

// Solo demo: sin login ni cuentas, siempre con datos de ejemplo. Lo activa
// automáticamente el script de PyMweb (npm run sync:pympocket) en la copia del
// portafolio; en la app real queda en false.
export const DEMO_ONLY = true;

// Dirección de la app real, a la que la demo invita a crear una cuenta.
export const APP_URL = 'https://pympocket.netlify.app/';
