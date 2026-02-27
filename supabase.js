import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// Pulls the keys securely from our hidden config.js vault!
const supabaseUrl = window.ENV.SUPABASE_URL;
const supabaseKey = window.ENV.SUPABASE_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);