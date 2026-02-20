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