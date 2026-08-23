const { readFileSync } = require('fs');
const { join } = require('path');
const { execSync } = require('child_process');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: Missing Supabase environment variables');
  console.error('Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY in .env.local');
  process.exit(1);
}

// Extract project ref from URL (e.g., https://xxxxx.supabase.co -> xxxxx)
const projectRef = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1];

if (!projectRef) {
  console.error('❌ Error: Could not extract project reference from Supabase URL');
  process.exit(1);
}

async function runSchema() {
  console.log('📖 Reading schema file...');
  const schemaPath = join(process.cwd(), 'supabase', 'schema.sql');
  const schemaSQL = readFileSync(schemaPath, 'utf-8');

  console.log('\n🚀 Attempting to run schema using Supabase Management API...\n');

  // Try using curl to execute SQL via Supabase Management API
  // Note: This requires the project to have SQL execution enabled via API
  try {
    // First, try to get a session token (this won't work without proper auth)
    console.log('⚠️  Direct SQL execution via API requires authentication.');
    console.log('📋 Please run the SQL manually in Supabase SQL Editor:\n');
    console.log('─'.repeat(70));
    console.log(schemaSQL);
    console.log('─'.repeat(70));
    console.log('\n📝 Steps:');
    console.log(`1. Go to: https://app.supabase.com/project/${projectRef}/sql/new`);
    console.log('2. Copy the SQL above');
    console.log('3. Paste it into the SQL Editor');
    console.log('4. Click "Run" (or press Cmd/Ctrl + Enter)\n');
    
    // Check if psql is available as alternative
    try {
      execSync('which psql', { stdio: 'ignore' });
      console.log('💡 Alternative: You can also use psql if you have the database connection string.');
      console.log('   Get it from: Supabase Dashboard → Settings → Database → Connection string\n');
    } catch {
      // psql not available
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

runSchema().catch(console.error);

