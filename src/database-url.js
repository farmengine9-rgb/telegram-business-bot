// Resolve a Neon/PostgreSQL connection without guessing or exposing secrets.
// DATABASE_URL_ENV may name a custom environment variable injected by Vercel.
export function resolveDatabaseUrl(env = process.env) {
  const override = env.DATABASE_URL_ENV?.trim();
  if (override) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(override)) throw new Error('Invalid DATABASE_URL_ENV variable name');
    if (!env[override]) throw new Error('Database variable ' + override + ' is missing');
    return validate(env[override]);
  }
  const known = ['DATABASE_URL','POSTGRES_URL','NEON_DATABASE_URL','NEON_POSTGRES_URL','POSTGRES_URL_NON_POOLING','PG_CONNECTION_STRING'];
  for (const key of known) if (env[key]) return validate(env[key]);
  const candidates = Object.keys(env).filter(k => /^(?:NEON|POSTGRES|PG)_[A-Z0-9_]*(?:DATABASE_URL|POSTGRES_URL|CONNECTION_STRING)$/.test(k) && env[k]);
  if (candidates.length===1) return validate(env[candidates[0]]);
  if (candidates.length>1) throw new Error('Multiple Neon variables found; set DATABASE_URL_ENV to select one');
  throw new Error('PostgreSQL connection missing. Set DATABASE_URL or DATABASE_URL_ENV to the name of the Neon variable.');
}
function validate(value) {
  if (typeof value !== 'string' || !/^postgres(?:ql)?:\/\//i.test(value)) throw new Error('Database variable must contain a postgres:// or postgresql:// connection URL');
  return value;
}
