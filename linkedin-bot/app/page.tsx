
"use client";
import { useRouter } from "next/navigation";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import ColorBends from "@/components/ColorBends";

// 1. UPDATED: Perfectly matches your SQL schema
interface DraftPost {
  id: string;
  created_at: string;
  repo_name: string;
  commit_message: string;
  readme_content: string;
  draft_content: string;
  image_url: string;
  status: string;
}

export default function Dashboard() {
  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const [posts, setPosts] = useState<DraftPost[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, [supabase.auth]);

  // 2. UPDATED FETCH: Now looks for 'draft' instead of 'pending'
  useEffect(() => {
    const fetchDrafts = async () => {
      if (!session) return;
      
      setLoadingPosts(true);
      const { data, error } = await supabase
        .from("posts")
        .select("*")
        .eq("status", "draft") // Matches your SQL check constraint!
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching drafts:", error.message);
      } else {
        setPosts(data || []);
      }
      setLoadingPosts(false);
    };

    fetchDrafts();
  }, [session, supabase]);

  const handleLinkedInLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "linkedin_oidc",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) console.error("Login failed:", error.message);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-white">
        <p className="animate-pulse text-neutral-400">Loading engine...</p>
      </div>
    );
  }

  // LOGIN SCREEN
  if (!session) {
    return (
      <div className="relative min-h-screen bg-neutral-950 flex flex-col items-center justify-center text-white p-4 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <ColorBends
            colors={["#0a0a0a", "#0a66c2", "#171717"]}
            rotation={0}
            speed={0.2}
            scale={1}
            frequency={1}
            warpStrength={1}
            mouseInfluence={1}
            parallax={0.5}
            noise={0.1}
            transparent
            autoRotate={0}
            color=""
          />
        </div>

        <div className="relative z-10 max-w-md w-full text-center space-y-8 backdrop-blur-sm bg-black/40 p-8 rounded-2xl border border-white/10 shadow-2xl">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight">LinkedIn Auto Uploader</h1>
            <p className="text-neutral-400">The serverless developer content engine.</p>
          </div>
          
          <button
            onClick={handleLinkedInLogin}
            className="w-full bg-[#0a66c2] hover:bg-[#004182] text-white font-semibold py-3 px-4 rounded-md transition-all duration-200 flex items-center justify-center gap-2 shadow-lg hover:shadow-blue-900/50 hover:-translate-y-0.5"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
            </svg>
            Sign in with LinkedIn
          </button>
        </div>
      </div>
    );
  }

  // DASHBOARD INBOX SCREEN
  return (
    <div className="min-h-screen bg-neutral-950 text-white p-8">
      <div className="max-w-6xl mx-auto flex justify-between items-center mb-12">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Inbox</h1>
          <p className="text-neutral-400 mt-1">Review and approve your AI-generated drafts.</p>
        </div>
        <button 
          onClick={() => supabase.auth.signOut()}
          className="px-4 py-2 rounded-md bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-800 transition-all"
        >
          Sign Out
        </button>
      </div>
      
      <div className="max-w-6xl mx-auto">
        {loadingPosts ? (
          <div className="flex justify-center py-20">
            <p className="animate-pulse text-neutral-500">Syncing drafts from database...</p>
          </div>
        ) : posts.length === 0 ? (
          <div className="border border-neutral-800 rounded-2xl p-20 text-center bg-neutral-900/30">
            <p className="text-xl text-neutral-400 font-medium">No pending drafts.</p>
            <p className="text-neutral-500 mt-2">Push a release to GitHub to trigger the AI engine.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map((post) => (
              <div 
                key={post.id} 
                className="group flex flex-col bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden hover:border-neutral-700 transition-all shadow-lg"
              >
                {/* Image Thumbnail */}
                <div className="relative aspect-video w-full bg-neutral-950 overflow-hidden">
                  {post.image_url ? (
                    <img 
                      src={post.image_url} 
                      alt="Generated visual" 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-neutral-700">
                      No Image
                    </div>
                  )}
                  {/* Status Badge */}
                  <div className="absolute top-3 right-3 bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 text-xs font-medium px-2.5 py-1 rounded-full backdrop-blur-md">
                    Pending Approval
                  </div>
                </div>

                {/* Card Content */}
                <div className="p-5 flex flex-col flex-grow">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-sm font-semibold text-white truncate">
                      {post.repo_name || "Unknown Repo"}
                    </span>
                    <span className="text-xs text-neutral-500 bg-neutral-800 px-2 py-0.5 rounded-md truncate max-w-[120px]">
                      {post.commit_message || "Update"}
                    </span>
                  </div>
                  
                  {/* The AI Draft Text (Truncated) */}
                  <p className="text-sm text-neutral-400 line-clamp-4 flex-grow whitespace-pre-wrap">
                    {post.draft_content}
                  </p>

                  {/* Action Buttons */}
                  <div className="grid grid-cols-2 gap-3 mt-6">
                    <button 
                      onClick={() => router.push(`/edit/${post.id}`)} 
                      className="w-full py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      Edit Draft
                    </button>
                    <button className="w-full py-2 bg-[#0a66c2] hover:bg-[#004182] text-white text-sm font-medium rounded-lg shadow-lg hover:shadow-blue-900/50 transition-all">
                      Approve & Post
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}