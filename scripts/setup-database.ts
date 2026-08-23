import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Missing Supabase environment variables');
  console.error('Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function setupDatabase() {
  console.log('Reading schema file...');
  const schemaPath = join(process.cwd(), 'supabase', 'schema.sql');
  const schemaSQL = readFileSync(schemaPath, 'utf-8');

  // Split by semicolons and filter out empty statements
  const statements = schemaSQL
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  console.log(`Found ${statements.length} SQL statements to execute...`);

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    if (!statement || statement.trim().length === 0) continue;

    try {
      console.log(`Executing statement ${i + 1}/${statements.length}...`);
      const { error } = await supabase.rpc('exec_sql', { sql: statement });
      
      if (error) {
        // Try direct query execution
        const { error: queryError } = await supabase.from('_temp').select('1').limit(0);
        // If that doesn't work, we'll need to use a different approach
        console.warn(`Warning: Could not execute statement ${i + 1}. You may need to run this in Supabase SQL Editor.`);
        console.warn(`Error: ${error.message}`);
      }
    } catch (err: any) {
      console.warn(`Warning: Could not execute statement ${i + 1}: ${err.message}`);
    }
  }

  console.log('\n✅ Database setup attempted!');
  console.log('\nNote: Some statements may need to be run manually in Supabase SQL Editor.');
  console.log('Please copy the contents of supabase/schema.sql and run it in:');
  console.log('https://app.supabase.com/project/_/sql/new');
}

setupDatabase().catch(console.error);

