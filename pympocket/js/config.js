// Conexión con Supabase (cuentas y sincronización). Ver SUPABASE.md.
// Ambos valores están en Supabase → Project Settings → API.
// SUPABASE_URL es la dirección del proyecto de Supabase (termina en .supabase.co),
// no la dirección donde se publica la app.
// La clave "anon"/"publishable" es pública por diseño: la seguridad la dan las
// reglas de acceso (RLS) de la base, que solo dejan a cada usuario ver sus datos.
// Nunca pongas acá la clave "service_role"/"secret".

export const SUPABASE_URL = 'https://efcvakgctiuqbdmqrhab.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_NTCRXxo27worqSK9cRs4vw_g40cK551';
