# LinkedIn Auto Uploader - Development Log

## Day 1: The Foundation (Next.js & Supabase)

**Date:** February 17, 2026  
**Goal:** Initialize the project, set up the database, and establish a successful connection between the frontend and the backend.

---

## Things I Learned

### 1. Next.js as a Full Stack Solution

I chose Next.js because it allows me to build both the **Dashboard** (Frontend) and the **API** (Backend) in a single repository. I don't need to spin up a separate Express or Python server just to handle a few API requests. The `app/api` folder acts as my backend server.

### 2. Vector Databases (pgvector)

I learned that standard databases store text, but to do **RAG (Retrieval Augmented Generation)**, I need to store "vectors" (lists of numbers that represent meaning). Supabase is just PostgreSQL under the hood, so enabling the `vector` extension turns a standard SQL database into an AI database.

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

**Result:** The data appeared on `localhost:3000`. The connection is live. ✅

---

## Decision: Writing Logic in SQL (Not JavaScript)

I had to decide how to find the "best matching" past posts for the RAG engine.

### Option A: The JavaScript Way

1. Fetch all 1,000 example posts from the database to my server
2. Loop through them in JavaScript to calculate the math
3. Pick the top 3

### Option B: The SQL Way (What I Chose) ✅

1. Send the query to the database
2. Let the database do the math internally
3. Return only the top 3 matches

### Why I chose SQL:

I wrote a function called `match_style` directly in the Supabase SQL Editor using **PL/pgSQL**.

> It is much faster to **"bring the compute to the data."** If I did this in JavaScript, I would waste network bandwidth downloading thousands of rows just to filter them. By doing it in SQL, the database (which runs in C++) does the math instantly and sends back only what I need.

It's like asking a librarian to find the "best 3 books" versus asking them to bring every book in the library to your house so you can pick 3 yourself.

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