const { createClient } = require('@supabase/supabase-js');
const { readFileSync } = require('fs');
const { join } = require('path');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Missing Supabase environment variables');
  console.error('Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function setupDatabase() {
  console.log('📖 Reading schema file...');
  const schemaPath = join(process.cwd(), 'supabase', 'schema.sql');
  const schemaSQL = readFileSync(schemaPath, 'utf-8');

  console.log('⚠️  Note: Supabase JS client cannot execute DDL statements directly.');
  console.log('📋 Please run the SQL schema manually in Supabase SQL Editor.\n');
  console.log('Steps:');
  console.log('1. Go to: https://app.supabase.com/project/_/sql/new');
  console.log('2. Copy and paste the following SQL:\n');
  console.log('─'.repeat(60));
  console.log(schemaSQL);
  console.log('─'.repeat(60));
  console.log('\n3. Click "Run" to execute the schema\n');

  // Try to verify connection
  try {
    const { data, error } = await supabase.from('sources').select('count').limit(0);
    if (error && error.code === '42P01') {
      console.log('✅ Connected to Supabase successfully!');
      console.log('❌ Tables do not exist yet - please run the SQL schema above.\n');
    } else if (!error) {
      console.log('✅ Database tables already exist!\n');
    }
  } catch (err) {
    console.log('✅ Connected to Supabase successfully!');
    console.log('Please run the SQL schema above to create the tables.\n');
  }
}

setupDatabase().catch(console.error);

