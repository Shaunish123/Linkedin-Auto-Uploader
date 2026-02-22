# LinkedIn Auto Uploader - Development Log

## Day 1: The Foundation (Next.js & Supabase)

**Date:** February 17, 2026  
**Goal:** Initialize the project, set up the database, and establish a successful connection between the frontend and the backend.

---

## Things I Learned

### 1. Next.js as a Full Stack Solution

I chose Next.js because it allows me to build both the **Dashboard** (Frontend) and the **API** (Backend) in a single repository. I don't need to spin up a separate Express or Python server just to handle a few API requests. The `app/api` folder acts as my backend server.

### 2. Vector Databases (pgvector) in Postgres

To do **RAG (Retrieval Augmented Generation)**, I need to store "vectors" (lists of numbers that represent meaning). Supabase is just PostgreSQL under the hood, so enabling the `vector` extension turns a standard SQL database into an AI database.

---

## How I Built It

### Step 1: The Setup

I started by initializing the project using `create-next-app`. I kept it simple with TypeScript and Tailwind.

Then, I installed the three main SDKs I need:

- `@supabase/supabase-js`: To talk to the database
- `groq-sdk`: For the Llama 3.3 model (The Text Brain)
- `@google/generative-ai`: For embeddings and image generation

### Step 2: The Database Architecture

I went to the Supabase dashboard and set up the schema. I created two main tables:

- **`posts`**: This stores the commit message, the draft content, the image URL, and the current status
- **`style_examples`**: This stores high-performing LinkedIn posts so the AI can mimic their style later

### Step 3: The Connection Check

Before writing complex code, I needed to prove the app works.

1. I manually inserted a dummy row (`feat: database works`) into the Supabase Dashboard
2. I wrote a simple fetch function in `page.tsx`

**Result:** The data appeared on `localhost:3000`. The connection is live. 

---

## Decision: Writing Logic in SQL (Not JavaScript)

I had to decide how to find the "best matching" past posts for the RAG engine.

### Option A: The JavaScript Way

1. Fetch all 1,000 example posts from the database to my server
2. Loop through them in JavaScript to calculate the math
3. Pick the top 3

### Option B: The SQL Way (What I Chose) 

1. Send the query to the database
2. Let the database do the math internally
3. Return only the top 3 matches

### Why I chose SQL:

I wrote a function called `match_style` directly in the Supabase SQL Editor using **PL/pgSQL**.

> It is much faster to **"bring the compute to the data."** If I did this in JavaScript, I would waste network bandwidth downloading thousands of rows just to filter them. By doing it in SQL, the database (which runs in C/C++) does the math instantly and sends back only what I need.

```sql
-- The function runs inside Postgres
create or replace function match_style (...)
returns table (...)
language plpgsql stable
as $$
begin
  return query
  select content, 1 - (embedding <=> query_embedding) as similarity
  from style_examples
  order by similarity desc
  limit match_count;
end;
$$;
```


---

## Day 2: The Brain (RAG & Text Generation)

**Date:** February 20, 2026  
**Goal:** Teach the database what a good developer post looks like (Seeding), and build the API route that turns GitHub commits and READMEs into viral text.

---

## Things I Learned (and Problems Faced)

### 1. The AI Persona is Fragile

I initially tried feeding the AI successful B2B marketing templates (e.g., "My client asked us..."). I quickly learned that the AI mimics exactly what it reads. If the examples say "We" or "Our team", the AI will hallucinate a fake team. Because I am building these projects alone, I had to rewrite the seed examples strictly from a first-person ("I", "my") solo-developer perspective.

### 2. Vector Dimensions Must Match Exactly

When I ran the script to embed the text, Supabase threw a 22000 error: expected 768 dimensions, not 3072.

**The Problem:** My original Postgres schema expected 768 numbers. But the new, more powerful `models/gemini-embedding-001` model returns 3,072 numbers for better accuracy.

**The Fix:** I wrote a SQL script to drop the `style_examples` table and recreate it with `vector(3072)`. Instead of dumbing down the AI, I upgraded the database.

### 3. Standalone Scripts Need Manual Environment Variables

Next.js automatically loads `.env.local` files for the web app. But when running a standalone TypeScript script (`scripts/seed.ts`) using `tsx` in the terminal, it crashed. I had to manually install and import `dotenv` to inject my API keys into the script environment.

---

## How I Built It

### Step 1: Seeding the Database

I wrote a `seed.ts` script that takes 4 highly-structured, text-based LinkedIn templates (covering problem-solving, project launches, and hard lessons).

It passes each text string to Google's Gemini Embedding model to convert it into a 3072-dimension vector, and then inserts both the text and the vector into the Supabase `style_examples` table.

### Step 2: The Core API Route

I built the main receiver at `app/api/generate/route.ts`.

When a POST request hits this endpoint, it:

1. Embeds the incoming text into a vector.
2. Calls the Supabase SQL function (`match_style`) to find the 2 most semantically similar past posts.
3. Constructs a prompt combining the rules, the style examples, and the code diff/README.
4. Calls Groq (Llama 3.3 70B) to generate the post.
5. Saves the drafted text into the `posts` table.

---

## Decision: The Smart README Router & Context Limits

I had to decide how to handle large project updates versus small daily code commits.

### The Problem

A standard code diff is fine for a daily update, but when I finish a project, the true value is in the README.md. A README can be up to 15,000 characters long.

### Option A: Two-Step AI Chain

1. Send the README to the AI to write a short summary.
2. Send the summary to the AI again to write the LinkedIn post.

### Option B: Pass the Entire README (What I Chose)

I chose to pass the entire README directly into the final prompt with a generous `substring(0, 20000)` safety cap.

### Why I chose Option B:

The Llama 3.3 70B model has a massive 128,000 token context window. A 15,000-character README is only about 3,750 tokens. By passing the whole document in a single API call, I avoid the latency of a two-step chain and ensure the AI doesn't lose the specific, quirky technical details (like the "Lessons Learned" section) that make a post authentic.

I also added a **Dynamic Context Router** to the prompt instructions:

- If a README is present, the AI ignores the code diff and writes a "Final Project Launch" post.
- If no README is present, the AI focuses on the code diff and writes a "Day-to-day Bug Fix" post.

---

---

## Day 3: The Visuals Foundation (Storage & API Battles)

**Date:** February 21, 2026

**Goal:** Abstract the image generation logic, set up a Supabase storage bucket, and test different AI image APIs to find a reliable, free solution.

---

## Things I Learned (and Problems Faced)

### 1. Separation of Concerns

My `route.ts` file was getting massive. Instead of cramming the image generation and upload logic directly into the main API handler, I created a dedicated utility file at `lib/generate-image.ts`. This keeps the backend modular. If I want to swap image models later, I only have to touch one file.

### 2. The Free Tier Reality Check

I initially tried to use Google's Imagen model through the Gemini API.

**The Problem:** Google gives millions of text tokens for free, but hard-locks image generation behind a paywall. My terminal instantly spat out a quota limit of `0`.

**The Pivot:** I moved to Pollinations.ai, a free, community-funded wrapper. But I immediately hit Cloudflare blocks (Error 1033) and server timeouts (Error 530). I managed to bypass their bot-protection by injecting a Chrome `User-Agent` header into my fetch request, but the servers were just too unstable for a production pipeline.

---

## How I Built It

### Step 1: The Supabase Storage Bucket

I went into my Supabase dashboard and created a new public bucket called `linkedin-images`. This is where the generated images will live so they can be securely linked in the final LinkedIn post.

### Step 2: The Utility Wrapper

I set up the basic structure for `generateAndUploadImage`. It takes a string, attempts to generate an image buffer, and then pushes that buffer directly to Supabase.

```typescript
// Initial setup in lib/generate-image.ts
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function generateAndUploadImage(prompt: string): Promise<string> {
    let imageBuffer: Buffer | null = null;
    // ... API call logic goes here ...
}

```

---

## Day 4: The Unbreakable Pipeline & RLS

**Date:** February 22, 2026

**Goal:** Finalize the image generation using a reliable open-source model and ensure the pipeline never crashes, even if third-party servers go down.

---

## Things I Learned (and Problems Faced)

### 1. Hugging Face API Migrations

I decided to use Hugging Face's Serverless Inference API to run `FLUX.1-schnell` (an incredibly fast, high-quality open-source model).

**The Problem:** My first test threw a `410 Gone` error.
**The Fix:** I learned Hugging Face recently deprecated their old `api-inference` URLs. I had to update my endpoint to route through their new inference provider system (`router.huggingface.co/hf-inference/models/...`).

### 2. Supabase Row-Level Security (RLS) Blocks Uploads

Even after successfully generating the image buffer, Supabase rejected the upload with a "violates row-level security policy" error.

**The Fix:** Setting a bucket to "Public" only allows people to *view* the images. To let my API *insert* files, I had to write a specific SQL policy.

```sql
-- Unlocking the bucket for API inserts
create policy "Allow API uploads"
on storage.objects
for insert
to public
with check (bucket_id = 'linkedin-images');

```

---

## How I Built It

### The 3-Tier Safety Net

To make sure my automated LinkedIn posts never fail due to a server crash, I built a nested `try/catch` architecture.

1. **Primary:** Hugging Face (FLUX.1-schnell).
2. **Fallback:** Pollinations.ai (if Hugging Face rate-limits me).
3. **Ultimate Fallback:** A reliable, moody grayscale placeholder from `picsum.photos` if all AI generators are down.

```typescript
try {
    // 1. Try Hugging Face FLUX.1
    // ... fetch logic ...
} catch (hfError) {
    try {
        // 2. Fall back to Pollinations
        // ... fetch logic ...
    } catch (fallbackError) {
        // 3. The Ultimate Fallback (Guaranteed to work)
        const reliableUrl = `https://picsum.photos/seed/${seed}/1024/768?grayscale&blur=2`;
        const res = await fetch(reliableUrl);
        imageBuffer = Buffer.from(await res.arrayBuffer());
    }
}

```

---

## Day 5: The "Art Director" (Sequential Prompt Chaining)

**Date:** February 22, 2026

**Goal:** Fix the quality of the generated images by preventing the AI from hallucinating over abstract code concepts.

---

## Things I Learned

### Image Models Hate Abstract Concepts

I passed the raw commit message `"feat: launch InsightPDF v1.0"` directly to the image model. The result was terrible. Image models like FLUX.1 don't understand invisible concepts like "code," "databases," or "vector search." When forced to draw abstract metaphors, they panic and output generic, blurry neon shapes.

I needed to translate code terminology into concrete, physical objects.

---

## How I Built It

### Sequential Prompt Chaining

Instead of asking one LLM to do everything at once, I split the task. In my main `route.ts`, right after Groq generates the text for the LinkedIn post, I added a *second* API call to Groq.

I instructed this second prompt to act as an "Art Director." It reads the code diff and README, and outputs a highly specific, physical visual description (e.g., translating "database" into "a glowing server rack"). I then pass *that* concrete description to the image generator.

```typescript
// The new Art Director prompt in route.ts
const imageInstruction = `
    Analyze the following code commit context and write a single, highly descriptive sentence for a 3D render.
    
    CRITICAL RULES FOR VISUALS:
    1. NO METAPHORS: Do not use phrases like "fortress of knowledge" or "corridors of data."
    2. BE CONCRETE & PHYSICAL: Describe actual objects. Instead of "vector search," describe "a glowing server rack."
    3. Keep it under 50 words.

    Commit Message: ${message}
    README Context: ${readme ? readme.substring(0, 3000) : "None"}
`;

const imagePromptCompletion = await groq.chat.completions.create({
    messages: [{role: 'user', content: imageInstruction}],
    model: "llama-3.3-70b-versatile"
});

const dynamicVisualContext = imagePromptCompletion.choices[0]?.message?.content?.trim();

// Pass the physical description to the image generator, not the raw commit
const permanentImageUrl = await generateAndUploadImage(dynamicVisualContext);

```

This single architectural change dramatically improved the relevance and quality of the generated 3D renders. The backend pipeline is now completely finished.

---
