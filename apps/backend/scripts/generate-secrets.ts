// Secrets are now managed via Supabase publishable/secret keys.
// No custom JWT signing — the backend uses supabase.auth.getUser() for verification.
console.log('No secrets to generate — auth is delegated to Supabase.');
console.log('Set SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY in your .env file.');
