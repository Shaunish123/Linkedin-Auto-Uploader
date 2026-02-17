import { createClient } from '@supabase/supabase-js';

// 1. Initialize Client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default async function Home() {
  // 2. Fetch the dummy data
  const { data: posts, error } = await supabase.from('posts').select('*');

  // 3. Handle Errors
  if (error) {
    return (
      <div className="p-10 text-red-600 font-bold border-2 border-red-600 rounded">
        ❌ CONNECTION FAILED: {error.message}
      </div>
    );
  }

  // 4. Show Success
  return (
    <div className="min-h-screen p-10 font-mono bg-gray-50">
      <h1 className="text-3xl font-bold mb-6">Unit 1: Sanity Check</h1>
      
      <div className="bg-white p-6 shadow-md rounded-lg border-l-4 border-green-500">
        <h2 className="text-xl font-bold text-green-700 mb-2">✅ Connection Successful</h2>
        <p className="mb-4">Here is the data fetched from Supabase:</p>
        
        <pre className="bg-gray-900 text-green-400 p-4 rounded overflow-auto text-sm">
          {JSON.stringify(posts, null, 2)}
        </pre>
      </div>
    </div>
  );
}