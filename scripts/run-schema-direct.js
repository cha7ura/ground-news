const { readFileSync } = require('fs');
const { join } = require('path');
const https = require('https');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: Missing Supabase environment variables');
  process.exit(1);
}

// Extract the base URL without protocol
const url = new URL(supabaseUrl);
const hostname = url.hostname;

async function executeViaREST(sql) {
  return new Promise((resolve, reject) => {
    // Try using Supabase REST API's query endpoint
    // This won't work for DDL, but let's try
    const options = {
      hostname: hostname,
      path: '/rest/v1/rpc/exec_sql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'return=minimal',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify({ query: sql }));
    req.end();
  });
}

async function runSchema() {
  console.log('📖 Reading schema file...\n');
  const schemaPath = join(process.cwd(), 'supabase', 'schema.sql');
  const schemaSQL = readFileSync(schemaPath, 'utf-8');

  console.log('⚠️  Supabase REST API cannot execute DDL statements directly.');
  console.log('📋 You need to run this SQL manually in the Supabase SQL Editor.\n');
  
  console.log('🔗 Opening SQL file for you to copy...\n');
  console.log('─'.repeat(70));
  console.log(schemaSQL);
  console.log('─'.repeat(70));
  console.log('\n📝 Next steps:');
  console.log('1. Copy the SQL above');
  console.log('2. Go to: https://app.supabase.com/project/_/sql/new');
  console.log('3. Paste the SQL');
  console.log('4. Click "Run"\n');
  
  // Try to open browser (macOS)
  try {
    const { execSync } = require('child_process');
    execSync('open "https://app.supabase.com/project/_/sql/new"', { stdio: 'ignore' });
    console.log('✅ Opened Supabase SQL Editor in your browser!\n');
  } catch (e) {
    // Browser open failed, that's okay
  }
}

runSchema().catch(console.error);

