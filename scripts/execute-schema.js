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

async function executeSQL(sql) {
  return new Promise((resolve, reject) => {
    // Extract project ref from URL
    const projectRef = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1];
    
    if (!projectRef) {
      reject(new Error('Could not extract project reference'));
      return;
    }

    // Supabase Management API endpoint for executing SQL
    // Note: This requires proper authentication and may not work with anon key
    const options = {
      hostname: 'api.supabase.com',
      path: `/v1/projects/${projectRef}/database/query`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data));
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

  console.log('🚀 Attempting to execute schema via Supabase API...\n');

  try {
    // Split SQL into individual statements
    const statements = schemaSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`Found ${statements.length} SQL statements\n`);

    // Try executing (this will likely fail without proper admin access)
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.length < 10) continue; // Skip very short statements
      
      try {
        console.log(`Executing statement ${i + 1}/${statements.length}...`);
        await executeSQL(statement);
        console.log(`✅ Statement ${i + 1} executed successfully\n`);
      } catch (error) {
        console.log(`⚠️  Statement ${i + 1} failed: ${error.message}\n`);
        // Continue with next statement
      }
    }

    console.log('✅ Schema execution attempted!\n');
    console.log('Note: Some statements may require manual execution in Supabase SQL Editor.\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n📋 The API method didn\'t work. Please run the SQL manually:\n');
    console.log('1. Go to: https://app.supabase.com/project/_/sql/new');
    console.log('2. Copy and paste the SQL from supabase/schema.sql');
    console.log('3. Click "Run"\n');
  }
}

runSchema().catch(console.error);

