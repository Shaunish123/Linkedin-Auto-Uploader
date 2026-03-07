"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

type MediaType = "photos" | "video";

export default function EditDraftPage() {
  const params = useParams();
  const router = useRouter();
  const postId = params.id as string;

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [loading, setLoading] = useState(true);
  const [repoName, setRepoName] = useState("");
  const [content, setContent] = useState("");
  const [isPosting, setIsPosting] = useState(false);
  
  // AI Reprompt State
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  // Media State
  const [mediaType, setMediaType] = useState<MediaType>("photos");
  const [photos, setPhotos] = useState<string[]>([]);
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null); // --- NEW: Track the AI Image ---
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);

  // Hidden Input Refs for File Selection
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadDraft = async () => {
      const { data, error } = await supabase
        .from("posts")
        .select("*")
        .eq("id", postId)
        .single();

      if (error) {
        console.error(error);
        router.push("/");
        return;
      }

      setRepoName(data.repo_name);

      // Hydrate Text
      const cachedContent = localStorage.getItem(`draft-${postId}`);
      if (cachedContent) {
        setContent(cachedContent);
      } else {
        setContent(data.draft_content || "");
      }

      // Pre-load the AI generated image & save it as the "Original"
      if (data.image_url) {
        setPhotos([data.image_url]);
        setOriginalImageUrl(data.image_url);
      }

      setLoading(false);
    };

    if (postId) loadDraft();
  }, [postId, router, supabase]);

  // --- UPDATED: SMART TAB SWITCHING ---
  const handleTabSwitch = (newType: MediaType) => {
    if (newType === mediaType) return;

    if (newType === "video") {
      // Check if they have any photos that are NOT the original AI image
      const userAddedPhotos = photos.filter(p => p !== originalImageUrl);
      
      if (userAddedPhotos.length > 0) {
        const confirmSwitch = window.confirm("Switching to Video will remove the photos you manually added. Continue?");
        if (!confirmSwitch) return;
      }
      
      // Wipe user photos, but keep the AI image safe in the array if it hasn't been deleted
      setPhotos(prev => prev.filter(p => p === originalImageUrl));

    } else if (newType === "photos" && videoFile) {
      const confirmSwitch = window.confirm("Switching to Photos will remove your currently selected video. Continue?");
      if (!confirmSwitch) return;
      removeVideo(); // Wipe video
    }

    setMediaType(newType);
  };

  // --- AI REPROMPT LOGIC ---
  const handleAiRewrite = async () => {
    if (!aiPrompt.trim()) return;
    
    setIsGenerating(true);
    try {
      const res = await fetch("/api/ai/reprompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          currentContent: content, 
          instruction: aiPrompt 
        }),
      });

      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || "Failed to rewrite");

      // Replace the textarea content with the AI's new text
      setContent(data.newContent);
      
      // Auto-save the new AI text to local storage so it isn't lost
      localStorage.setItem(`draft-${postId}`, data.newContent);
      
      // Clear the input bar
      setAiPrompt("");
      
    } catch (error: any) {
      console.error("AI Edit error:", error);
      alert(`AI Rewrite failed: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // --- TEXT LOGIC ---
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    localStorage.setItem(`draft-${postId}`, newContent); 
  };

  const handleSaveToDatabase = async () => {
    const { error } = await supabase
      .from("posts")
      .update({ draft_content: content })
      .eq("id", postId);
      
    if (!error) {
      localStorage.removeItem(`draft-${postId}`); 
      alert("Draft text saved safely to the database!");
    } else {
      alert("Error saving: " + error.message);
    }
  };

  // --- PHOTO LOGIC ---
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    if (photos.length + files.length > 5) {
      alert("You can only upload a maximum of 5 photos.");
      return;
    }

    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setPhotos(prev => [...prev, base64String]);
      };
      reader.readAsDataURL(file);
    });

    if (photoInputRef.current) photoInputRef.current.value = "";
  };

  const removePhoto = (indexToRemove: number) => {
    setPhotos(photos.filter((_, index) => index !== indexToRemove));
  };

  // --- VIDEO LOGIC ---
  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const previewUrl = URL.createObjectURL(file);
    setVideoFile(file);
    setVideoPreviewUrl(previewUrl);

    if (videoInputRef.current) videoInputRef.current.value = "";
  };

  const removeVideo = () => {
    setVideoFile(null);
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    setVideoPreviewUrl(null);
  };

  // --- PUBLISH LOGIC ---
  const handleApproveAndPost = async () => {
    if (!content.trim()) {
      alert("You need to write a caption before posting!");
      return;
    }

    setIsPosting(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("You must be logged in to post.");

      const formData = new FormData();
      formData.append("postId", postId);
      formData.append("content", content);
      formData.append("mediaType", mediaType);

      if (mediaType === "video" && videoFile) {
        formData.append("video", videoFile);
      } else if (mediaType === "photos" && photos.length > 0) {
        formData.append("photos", JSON.stringify(photos));
      }

      const res = await fetch("/api/linkedin/post", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.provider_token}`,
        },
        body: formData,
      });

      const responseData = await res.json();
      if (!res.ok) throw new Error(responseData.error || "Failed to post");

      await supabase.from("posts").update({ status: "posted" }).eq("id", postId);
      localStorage.removeItem(`draft-${postId}`);
      
      alert("🚀 Successfully posted to LinkedIn!");
      router.push("/"); 

    } catch (error: any) {
      console.error("Posting error:", error);
      alert(`Error: ${error.message}`);
    } finally {
      setIsPosting(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-neutral-400">Loading Pro Editor...</div>;
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col">
      <input type="file" accept="image/*" multiple ref={photoInputRef} onChange={handlePhotoUpload} className="hidden" />
      <input type="file" accept="video/*" ref={videoInputRef} onChange={handleVideoUpload} className="hidden" />

      <div className="h-16 border-b border-neutral-800 px-6 flex items-center justify-between bg-neutral-900/50 sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push("/")} className="text-neutral-400 hover:text-white transition-colors">
            ← Back to Inbox
          </button>
          <div className="h-4 w-px bg-neutral-800"></div>
          <span className="font-semibold text-sm">Editing: {repoName}</span>
        </div>
        <div className="flex gap-3">
          <button onClick={handleSaveToDatabase} className="px-4 py-2 text-sm font-medium bg-neutral-800 hover:bg-neutral-700 rounded-md transition-colors">
            Save Text to DB
          </button>
          <button onClick={handleApproveAndPost} disabled={isPosting} className="px-4 py-2 text-sm font-bold bg-[#0a66c2] hover:bg-[#004182] shadow-lg hover:shadow-blue-900/50 rounded-md transition-all disabled:opacity-50 flex items-center gap-2">
            {isPosting ? "Publishing..." : "Approve & Post"}
          </button>
        </div>
      </div>

      <div className="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* LEFT COLUMN */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
            <h2 className="text-lg font-bold">Media Attachment</h2>
            <div className="flex bg-neutral-900 rounded-lg p-1 border border-neutral-800">
              <button 
                onClick={() => handleTabSwitch("photos")}
                className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${mediaType === "photos" ? "bg-neutral-800 text-white shadow-sm" : "text-neutral-500 hover:text-white"}`}
              >
                Photos ({photos.length}/5)
              </button>
              <button 
                onClick={() => handleTabSwitch("video")}
                className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${mediaType === "video" ? "bg-neutral-800 text-white shadow-sm" : "text-neutral-500 hover:text-white"}`}
              >
                Video (1 Max)
              </button>
            </div>
          </div>

          {mediaType === "photos" ? (
            <div className="grid grid-cols-2 gap-4">
              {photos.map((url, idx) => (
                <div key={idx} className="aspect-video bg-neutral-900 rounded-xl border border-neutral-800 overflow-hidden relative group">
                  <img src={url} alt={`Preview ${idx}`} className="w-full h-full object-cover" />
                  <button onClick={() => removePhoto(idx)} className="absolute top-2 right-2 bg-black/50 hover:bg-red-500/80 rounded-full backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all text-xs w-7 h-7 flex items-center justify-center">✕</button>
                </div>
              ))}
              {photos.length < 5 && (
                <button onClick={() => photoInputRef.current?.click()} className="aspect-video bg-neutral-900/50 border-2 border-dashed border-neutral-800 hover:border-neutral-600 rounded-xl flex flex-col items-center justify-center text-neutral-500 hover:text-neutral-300 transition-colors">
                  <span className="text-2xl mb-1">+</span>
                  <span className="text-sm font-medium">Add Photo</span>
                </button>
              )}
            </div>
          ) : (
            <div className="w-full">
              {videoPreviewUrl ? (
                <div className="relative aspect-video rounded-xl overflow-hidden border border-neutral-800 bg-black group">
                  <video src={videoPreviewUrl} controls className="w-full h-full" />
                  <button onClick={removeVideo} className="absolute top-2 right-2 bg-black/50 hover:bg-red-500/80 rounded-full backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all text-xs w-7 h-7 flex items-center justify-center z-10">✕</button>
                </div>
              ) : (
                <button onClick={() => videoInputRef.current?.click()} className="aspect-video w-full bg-neutral-900/50 border-2 border-dashed border-neutral-800 hover:border-neutral-600 rounded-xl flex flex-col items-center justify-center text-neutral-500 hover:text-neutral-300 transition-colors">
                  <span className="text-2xl mb-2">📹</span>
                  <span className="text-sm font-medium">Upload Video File</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN */}
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-2 mb-4">
            <h2 className="text-lg font-bold">Post Caption</h2>
            <span className="text-xs text-neutral-500 bg-neutral-900 px-2 py-1 rounded-md">Auto-saved locally</span>
          </div>
          
          <textarea
            value={content}
            onChange={handleContentChange}
            disabled={isGenerating}
            className={`flex-1 w-full bg-neutral-900 border border-neutral-800 rounded-xl p-5 text-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#0a66c2]/50 resize-none leading-relaxed ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''}`}
            placeholder="Write your LinkedIn post here..."
          />

          {/* --- NEW: AI COPILOT BAR --- */}
          <div className="mt-4 bg-neutral-900 border border-neutral-800 rounded-xl p-2 flex items-center gap-2 focus-within:border-neutral-600 transition-colors">
            <div className="pl-3 text-lg">✨</div>
            <input
              type="text"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAiRewrite()}
              disabled={isGenerating}
              placeholder="Ask AI to edit... (e.g., 'Make it shorter', 'Add a joke about Docker')"
              className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-neutral-200 placeholder:text-neutral-600 px-2 py-2 outline-none disabled:opacity-50"
            />
            <button
              onClick={handleAiRewrite}
              disabled={isGenerating || !aiPrompt.trim()}
              className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center min-w-[90px]"
            >
              {isGenerating ? (
                <span className="animate-pulse">Thinking...</span>
              ) : (
                "Rewrite"
              )}
            </button>
          </div>
          
        </div>

      </div>
    </div>
  );
}