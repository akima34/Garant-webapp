// Garant settings. Fill in the two values from your Supabase project
// (Supabase -> Project Settings -> API Keys / Data API):
//   SUPABASE_URL - the project URL, looks like https://abcdefgh.supabase.co
//   SUPABASE_KEY - the public key ("publishable" or "anon"). It is meant to be public:
//                  the database is protected by row level security.
// Never put a "secret" / "service_role" key or the Groq key in this file.
window.GARANT_CONFIG = {
  SUPABASE_URL: 'https://xedotrztphnwhhhjfrrh.supabase.co',
  SUPABASE_KEY: 'sb_publishable_9InNG89V3jHeXKJWZPW0QA_R98H1Sw7',
  // set to true only after you connect your own mail server (SMTP) in Supabase:
  // then "Forgot password?" sends real emails
  EMAIL_ENABLED: false
};
