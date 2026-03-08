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

## Day 6: The Architectural Pivot (Actions vs. Webhooks)

**Date:** February 23, 2026  
**Goal:** Rethink the deployment trigger to avoid copying YAML files into every single future repository, and design a system that scales automatically.

---

## Things I Learned

### 1. The Limitation of GitHub Actions (CI/CD)
Up until now, my plan was to use GitHub Actions. I was going to write a `release.yml` file that would spin up an Ubuntu server whenever I published a release, read my README, and send it to my Next.js API. 

**The Problem:** GitHub Actions are strictly *repo-scoped*. That means if I build 10 new projects this year, I have to manually copy and paste that YAML file into all 10 repositories and configure the API secrets 10 different times. That defeats the purpose of automation.

### 2. Global Webhooks & The Timeout Trap
I researched an alternative: **Account-Level Webhooks**. I can tell my GitHub account to globally listen to *all* my repositories and ping my server when any of them launch a release. Zero configuration per repo. 

But I immediately hit a massive architectural roadblock: **The Serverless Timeout Trap.**
* **The GitHub Rule:** When GitHub sends a webhook, it demands an HTTP 200 OK response within exactly 10 seconds. If it doesn't get one, it marks the delivery as a failure and drops the connection.
* **The Vercel Rule:** Serverless functions on Vercel freeze their CPU the exact millisecond you return a response. You can't return a "200 OK" and then keep running heavy AI tasks in the background.
* **The Math:** My AI pipeline (Text RAG + Visual Prompt + Image Gen + Database Upload) takes about 25 to 30 seconds. 

If I used a standard webhook, GitHub would time out and fail before my AI even finished generating the image. 

---

## How I Fixed It: The Decoupled Message Queue

I realized I couldn't just point GitHub directly at my Next.js API. I needed a middleman. 

I decided to pivot the entire architecture to an **Event-Driven Microservice** using a Message Queue.

Here is the new flow (in plain English):
1. **The Global Manager (GitHub):** Watches all my repositories. When I publish a release, it fires a payload across the internet.
2. **The Patient Butler (The Message Queue):** A separate server catches the payload. It instantly says "Thank you" to GitHub (satisfying the 10-second rule), so GitHub leaves happy.
3. **The Kitchen (Next.js API):** The Butler then walks the payload over to my Vercel API and patiently holds the door open for a full 60 seconds while the AI cooks up the post and the image.

This takes me out of standard web development and into distributed systems engineering. It is more complicated to build, but it means I never have to write a YAML configuration file again.

---

## Day 7: Provisioning the Global Infrastructure

**Date:** February 24, 2026  
**Goal:** Set up the "Patient Butler" (Message Queue) and the "Global Manager" (GitHub App) without touching any code yet.

---

## Things I Learned & What I Built

To make this new architecture work, I had to provision two pieces of external infrastructure.

### Step 1: Upstash QStash (The Message Queue)
I needed a serverless message queue that wouldn't charge me a massive monthly AWS bill. I found **Upstash QStash**, which is essentially a serverless Redis instance built specifically for asynchronous messaging.

* **What it is:** A decoupled buffer. It catches webhooks, queues them up, and securely forwards them to serverless environments like Vercel with built-in automatic retries if my API crashes.
* **How I accessed it:** I went to upstash.com, created a free account, and navigated to the QStash dashboard. 
* **The Setup:** I generated my REST API credentials. The most important parts were the `QSTASH_URL` (where GitHub will send the data) and the **Signing Keys**. Because my Next.js API will be public, I need these cryptographic keys to mathematically verify that incoming traffic is actually from Upstash, not a hacker trying to spam my LinkedIn.

### Step 2: Creating a Private GitHub App
Initially, I was going to use a standard Webhook in my GitHub settings. But I learned that building a **Private GitHub App** is the enterprise standard because of security.

* **What it is:** Instead of using a Personal Access Token (which acts like a master key to my entire GitHub account), an App acts like a contractor with a restricted ID badge. It uses the Principle of Least Privilege.
* **How I accessed it:** `GitHub Settings -> Developer settings -> GitHub Apps -> New GitHub App`.
* **The Setup:** 1.  **The Placeholder:** Because my Next.js API isn't built or hosted yet, I just put a temporary placeholder URL (`https://example.com/api/webhook`) in the Webhook URL field. I will update this to point to my Upstash QStash queue later once the app is deployed.
    2.  **Security:** I generated a strong Webhook Secret. I will need this later to mathematically verify that incoming payloads actually came from GitHub.
    3.  **Permissions:** I disabled absolutely everything except `Contents: Read-only`. This ensures the app can only read my `README.md` files and has zero permission to modify code or access packages.
    4.  **Events:** I subscribed strictly to the `Release` event.
    5.  Finally, I installed the App on my entire account. 

The foundational infrastructure is provisioned. 

The next day, I need write the Next.js API route to actually catch what GitHub throws at it!

---

## Day 8: The Edge Receiver & Cryptographic Security

**Date:** February 25, 2026  
**Goal:** Build the secure "Front Door" API route to catch GitHub's webhook, verify its authenticity, and pass it to the Upstash message queue.

---

## Things I Learned

### 1. Cryptographic Webhook Security (HMAC SHA-256)
If my API is public, anyone on the internet can send a fake POST request to it. If a hacker triggered my API, they would drain my Groq and Hugging Face credits and post spam to my LinkedIn. 

To fix this, I learned about **HMAC SHA-256**. GitHub takes the payload and my secret password, mixes them in a one-way math equation, and sends me the resulting 64-character signature. My Next.js server runs the exact same equation locally. If the signatures match perfectly, I know it's mathematically impossible for the payload to be forged. It acts like a Bouncer checking an ID at the door.

### 2. Next.js Runtime vs. Standalone Node.js
I initially tried to import `dotenv` into my new API route, remembering that I had to do this on Day 2 for my `seed.ts` script. I realized that the Next.js framework automatically injects `.env.local` variables into `process.env` at startup. Standalone scripts need `dotenv` because they bypass Next.js entirely, but native API routes do not. 

### 3. The "Claim Check" Pattern
I wondered why I was only extracting the `Repo Name`, `Owner`, and `Tag` from the GitHub payload. Why not just send the whole `README.md` through the queue?

I learned a core distributed systems concept called the **Claim Check Pattern**. 
Message queues like Upstash have strict payload size limits (256KB on the free tier). A 15,000-character README is too heavy. Instead of passing the "heavy suitcase" to the queue, I just pass a "Claim Check" (the exact coordinates: Repo, Owner, Tag). The background worker will use those coordinates to fetch the heavy file later. 

---

## How I Built It

### Step 1: SDKs and Environment Setup
I had a slight typo trying to install `@upstash/upstash` which threw a 404 error, but corrected it to install the official messaging SDK:
`npm install @upstash/qstash`

I then securely added my `GITHUB_WEBHOOK_SECRET` and my Upstash signing keys to my `.env.local` file.

### Step 2: The Bouncer (`/api/webhook/route.ts`)
I built the Edge Receiver. It is designed purely for speed and security. It does not touch the AI models or the database. 

Here is the exact flow of the code I wrote:
1. **Receive:** Catches the raw POST request from GitHub.
2. **Verify:** Uses Node's `crypto.timingSafeEqual` to compare the GitHub HMAC signature against my locally generated hash. If it fails, it returns a `401 Unauthorized`.
3. **Filter:** Ignores any webhook event that isn't a `published` release.
4. **The Handoff:** Extracts the `repoName`, `owner`, and `tag` (The Claim Check), and uses `qstashClient.publishJSON()` to forward those coordinates to my Upstash queue.
5. **The Disconnect:** Immediately returns a `200 OK` to GitHub so the webhook delivery succeeds without triggering the 10-second timeout.

The front door is locked and secure, I will build the Background Worker (Phase 3) that actually takes the Claim Check, downloads the README, and runs the AI pipeline!

---

## Day 9: The Background Worker & Data Hydration

**Date:** February 26, 2026  
**Goal:** Build the async Background Worker (`/api/generate`) to catch the Claim Check from Upstash, dynamically fetch the README from GitHub, and run the AI generation pipeline without timing out.

---

## Things I Learned

### 1. The Double-Bouncer Security Model
I initially wondered why I needed to verify a signature in this route when I already built a signature check in my `/api/webhook` Front Door. I learned that in distributed systems, every public endpoint needs its own security. If a hacker bypassed the Front Door and directly hit my Vercel URL, they could trigger my Groq and Hugging Face keys. The Front Door verifies GitHub. The Background Worker verifies Upstash. 

*Critical bug fixed:* Cryptographic verification in the `@upstash/qstash` SDK returns a Promise. I forgot the `await` keyword on `receiver.verify()`, which meant the security check would have always passed instantly. Added the `await` to lock it down.

### 2. Data Hydration (No Web Scraping Allowed)
To get the actual code context, I needed the `README.md` file. I learned that scraping GitHub's UI is bad practice. Instead, GitHub provides a dedicated, machine-readable server: `raw.githubusercontent.com`. Because my portfolio repositories are public, my Next.js worker can just use the variables from the Upstash Claim Check (`owner`, `repoName`, `tag`) to construct the raw URL and `fetch()` the text instantly, without needing a GitHub API key.

### 3. Vercel Serverless Limits
Even though Upstash holds the connection open, Vercel still tries to kill functions that run longer than 15 seconds. I had to explicitly export `maxDuration = 60` at the top of the route to give the AI pipeline enough time to complete the text generation, the visual prompting, and the image rendering.

---

## How I Built It

I wrapped my existing RAG and AI Pipeline inside the new Event-Driven logic. 

Here is the finalized structure for `/api/generate/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from 'groq-sdk';
import { generateAndUploadImage } from "@/lib/generate-images";
import { Receiver } from "@upstash/qstash";

// 1. BYPASS VERCEL TIMEOUT
export const maxDuration = 60; 

/*
    other imports and intialiseing 
*/

const receiver = new Receiver({
    currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
    nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
});

export async function POST(req: Request){
    try {
        
        // PHASE 1: SECURITY & HYDRATION
        
        const rawBody = await req.text();
        const signature = req.headers.get("Upstash-Signature") || "";

        // Verify this request is genuinely from QStash
        if(!signature){
            return NextResponse.json({error: "Unauthorized"}, {status: 401});
        }
        const isValid = await receiver.verify({ signature: signature, body: rawBody });
        if(!isValid){
            return NextResponse.json({error: "Unauthorized: Invalid signature"}, {status: 401});
        }

        // Extract Claim Check
        const payload = JSON.parse(rawBody);
        const {repoName, owner, tag} = payload;

        // Hydrate: Fetch actual README from GitHub's raw server
        const rawUrl = `https://raw.githubusercontent.com/${owner}/${repoName}/${tag}/README.md`;
        const githubResponse = await fetch(rawUrl);
        let fetchedReadme ="";
        if(githubResponse.ok){
            fetchedReadme = await githubResponse.text();
        } 

        // Map data for the AI Pipeline
        const readme = fetchedReadme;
        const message = `Published Release ${tag} for ${repoName}`;
        const diff = ""; 

        
        // PHASE 2: AI PIPELINE (RAG + Text + Image)
    }
}
```

Next i'll test if my feature works or not using Ngrok

### 4. Testing Webhooks Locally (Ngrok)
I couldn't test this pipeline with a standard `localhost` URL because GitHub and Upstash need a public internet address to deliver their webhooks. I learned how to use **Ngrok** to drill a secure tunnel from the public internet straight into my local Next.js server running on port 3000.

*Bug fixed during testing:* Initially, the QStash payload crashed the worker with a `SyntaxError: "[object Object]" is not valid JSON`. I realized I needed to explicitly use `JSON.stringify()` on the payload body inside my `/api/webhook` route before handing it to QStash, rather than relying on the SDK to guess the formatting. Once stringified, the Background Worker parsed it perfectly.

---

### The Final End-to-End Test:
To simulate the entire pipeline without deploying to Vercel, I executed the following flow:
1. Booted up my local Next.js server (`npm run dev`).
2. Started the Ngrok tunnel (`ngrok http 3000`) and copied the temporary public forwarding URL.
3. Updated my private GitHub App's Webhook URL to point to `https://<my-ngrok-url>.ngrok-free.app/api/webhook`.
4. Triggered a test pre-release on my GitHub repository.

**The Result:** The terminal logs lit up exactly as designed! 
* The Edge Receiver caught the payload and handed it off.
* QStash woke up the Background Worker.
* The Worker bypassed the 15-second serverless limit, successfully hydrated the README from GitHub, generated the AI text via Groq, rendered the 3D image via Hugging Face, and saved the final draft to Supabase.

The async backend engine is officially 100% complete! Next up: The Frontend Approval Dashboard.

---

## Day 10: The Dashboard UI & The OAuth 2.0 Labyrinth

**Date:** March 4, 2026  
**Goal:** Build the Next.js frontend, style it with a premium animated background, and lock the dashboard behind a secure LinkedIn login using Supabase.

---

## Things I Learned (and Problems Faced)

### 1. Tailwind v4 is a Massive Change
When I started styling the frontend, I went looking for my `tailwind.config.js` file to add my custom "Poppins" font. It wasn't there. 

**The Discovery:** Tailwind CSS v4 completely removed the config file. Instead of using a JavaScript file to set up your theme, everything is now done directly inside your main CSS file (`globals.css`) using standard CSS variables and a new `@theme` rule. It is much faster and cleaner, but it required me to unlearn how I've set up Next.js apps for the past few years.

### 2. LinkedIn's API Bureaucracy (The Fake Company)
I just wanted to add a "Sign in with LinkedIn" button so I could securely access my own app. 

**The Problem:** Unlike Twitter or GitHub, LinkedIn's developer platform is strictly built for massive B2B (Business-to-Business) companies. They refuse to let a regular user create an API app. Their system forces every app to be legally tied to a recognized "Company Page."
**The Fix:** I had to play along with their corporate rules. I went onto LinkedIn and created a completely blank, dummy "Company Page" (e.g., Shaunish Dev Lab). I didn't post anything to it, I just needed it to exist so I could link it to my Developer App. Once they gave me my secret API keys, I never had to look at the dummy page again.

### 3. The LocalStorage vs. Cookie Bug (The Hardest Fix)
Setting up the login button was easy. But when LinkedIn tried to send me back to my app after logging in, my app crashed with a `404` and a `bad_oauth_state` error.

**The Problem:** When I clicked "Login," the standard Supabase tool (`@supabase/supabase-js`) saved a secret security handshake in my browser's **LocalStorage**. 
However, LinkedIn sends you back to a **Server Route** (`/auth/callback`). A server lives on the backend; it cannot look inside your browser's LocalStorage. It can only read **Cookies**. Because my server couldn't find the security handshake, it assumed I was a hacker and rejected the login.
**The Fix:** I had to uninstall the standard Supabase client and install `@supabase/ssr` (Server-Side Rendering). This special Next.js package automatically takes that security handshake and saves it as a **Cookie** instead. The server read the cookie, the handshake succeeded, and the login finally worked.

---

## How I Built It

### Step 1: The UI Shell & Animated Background
Since this is a tool I will look at every day, I wanted it to feel like a premium SaaS product, not a boring white login screen. 

Instead of writing complex WebGL animations from scratch, I used a library called **React Bits**. I copied their `ColorBends.tsx` component, which creates a slow-moving, liquid-like gradient. I customized the colors to mix a dark "Vercel" black (`#0a0a0a`) with the official LinkedIn blue (`#0a66c2`). 

I placed this animation on the bottom layer (`z-0`) and placed a "frosted glass" login card on top of it using Tailwind's `backdrop-blur` utility.

### Step 2: Wiring the Supabase Auth
I took the two secret passwords from my LinkedIn Developer App (the **Client ID** and **Client Secret**) and pasted them into my Supabase Dashboard under the **LinkedIn (OIDC)** settings. 
*Note:* OIDC stands for OpenID Connect, which is the modern, secure standard for "Sign in with X" buttons. I also checked a box saying "Allow users without an email" just to make sure the login wouldn't break if LinkedIn hid my email for privacy reasons.

### Step 3: The "Welcome Back" Door (Callback Route)
To catch the user when LinkedIn redirects them back to my app, I built a dedicated Next.js Server Route at `app/auth/callback/route.ts`. 

Here is exactly what this file does:
1. It looks at the URL LinkedIn sent me to and grabs a temporary secret `code`.
2. It boots up the Supabase server client and injects my browser's cookies.
3. It calls a function called `exchangeCodeForSession()`. This securely trades the temporary code for a permanent "Access Token" (my VIP pass).
4. Finally, it redirects me to the root home page (`/`).

### Step 4: The Protected Dashboard
In my main screen (`app/page.tsx`), I needed logic to decide whether to show the Login Button or the Dashboard.

I used a React `useEffect` hook to constantly listen to `supabase.auth.onAuthStateChange`. 
* If the user has no session (not logged in), it renders the animated background and the blue "Sign in with LinkedIn" button.
* If the user has a session, it completely hides the login screen and renders the secure **"Inbox / Drafts"** dashboard view.

The frontend gate is officially locked and working. Next up: Writing the database queries to pull my AI-generated drafts into the Inbox!

---

## Day 11: The Inbox Data & The "Pro Editor"

**Date:** March 6, 2026  
**Goal:** Pull real AI-generated drafts from the database into the dashboard and build a dedicated, full-screen editing experience for media and text.

---

## Things I Learned (and Problems Faced)

### 1. The 5MB LocalStorage Trap
When building the "Edit Draft" screen, I wanted auto-saving so I wouldn't lose my work if I accidentally refreshed the page. Saving text to `localStorage` was easy. But when I tried to save user-uploaded photos, the browser crashed with a `QuotaExceededError`.
**The Problem:** Browsers strictly limit `localStorage` to about 5MB per website. Converting high-quality images to text (Base64) to store them locally instantly blew past this limit. 
**The Fix:** I split the logic. Text is safely auto-saved to `localStorage` on every keystroke. Photos and videos, however, are strictly held in the React state (RAM). If the user uploads a video, I use `URL.createObjectURL(file)` to create a high-speed, temporary memory link just for the preview, completely bypassing storage limits.

### 2. UX: The "Both" Assumption
Initially, I had a "Photos" area and a "Video" area visible at the same time. 
**The Problem:** If a user uploaded an image and a video, they would naturally assume both were getting posted. But the LinkedIn API strictly forbids mixing media types in a single post.
**The Fix:** I built a strict toggle system. The user must actively click either the "Photos" tab or the "Video" tab. If they upload custom photos and then click the Video tab, a browser warning pops up telling them their photos will be wiped to make room for the video. 

### 3. Protecting the AI Image
During the toggle fix above, I realized a massive bug: if the user clicked the Video tab, it was wiping *all* photos, including the original 3D render generated by my AI pipeline!
**The Fix:** I created a dedicated state variable called `originalImageUrl` when the page first loads. Now, if the user switches tabs, the UI deletes their manually uploaded photos but keeps the AI-generated image safely preserved in the background so it's waiting for them if they switch back to the Photos tab.

---

## How I Built It

### Step 1: The Inbox Grid (`app/page.tsx`)
I replaced the dummy "Welcome" message with a React `useEffect` that connects to Supabase. It queries the `posts` table for any row where `status = 'draft'` and orders them by the newest first. 

I mapped these results into a sleek CSS grid of dark-mode cards. Each card shows the GitHub Repo Name, the Commit Message, a snippet of the AI text, and the AI-generated image thumbnail. 

### Step 2: Rejecting Modals for a Pro Editor
Originally, I was going to use a pop-up modal for the "Edit Draft" button. I realized that cutting corners here would make the app feel cheap, especially when handling multiple photos and video files. 

Instead, I built a dedicated dynamic route at `app/edit/[id]/page.tsx`. It features:
* A sticky top navigation bar with "Save to DB" and "Approve & Post" buttons.
* A two-column layout: A Media Manager on the left (handling the 5-photo limit and video previews) and a real-time auto-saving Text Editor on the right.

---

## Day 12: The Inline AI Copilot & Simulation Testing

**Date:** March 7, 2026  
**Goal:** Add a "Magic Bar" so I can prompt the AI to rewrite my drafts inline, and build a safe way to test the entire flow without spamming my real LinkedIn feed.

---

## Things I Learned (and Problems Faced)

### 1. The Classic `<!DOCTYPE html>` JSON Error
When I built the API route for the AI Copilot and tested it, the frontend crashed with a cryptic error: `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`.
**The Problem:** This happens when the Next.js frontend expects a clean JSON response, but the backend crashes so hard it returns a default HTML 500 Error Page instead. The frontend chokes on the very first `<` character of the HTML.
**The Root Cause:** I had initialized the `Groq` SDK at the very top of my backend file, outside of my `try/catch` block. Because my `.env.local` variables weren't loaded properly, the SDK crashed the entire file before it could send a readable error message.
**The Fix:** I moved the Groq initialization *inside* the `try/catch` block and explicitly checked for the API key. If it fails, it now gracefully returns a clean JSON error `{"error": "Missing API Key"}` instead of an HTML page.

### 2. Safe Testing (The Mock API)
I needed to test the "Approve & Post" loading spinners, the `FormData` packaging, and the Supabase database updates (changing status from `draft` to `posted`). 
**The Problem:** If I wired this up to LinkedIn right away, I would accidentally publish dozens of "test 123" posts to my professional network.
**The Fix:** I built a "Mock" API route at `/api/linkedin/post`. Instead of talking to LinkedIn, it simply intercepts my `FormData`, prints the data (like video size and text length) to my VS Code terminal to prove it arrived, waits exactly 2 seconds to simulate network latency, and returns a fake success signal. This let me test the entire UI loop perfectly with zero risk.

---

## How I Built It

### Step 1: The Inline AI Copilot
I didn't want to leave the editor if the AI's first draft wasn't perfect. I added a "Magic Prompt Bar" (✨) directly under the text area. 

When I type an instruction (e.g., *"Make this sound more aggressive"* or *"Add a joke about Docker"*), it triggers a new API route: `/api/ai/reprompt`.

This route takes the current text and my new instruction, and sends them to Llama 3.3 via Groq with a strict System Prompt: 
* *"You are an editor. Apply the user instruction to the draft. Do not use conversational filler. Do not use 'We'. Return ONLY the new raw text."*

When the new text comes back, it instantly replaces the text in the editor and automatically updates the browser's `localStorage` cache.

### Step 2: Packaging the Payload (`FormData`)
To send the final approved post to the backend, I couldn't just use standard JSON because JSON cannot handle raw video files. 

I updated the "Approve & Post" button to construct a `FormData` object. I appended the text, the media mode, and either the raw video `File` object or the array of Base64 photos. 

I also grabbed my active LinkedIn `provider_token` directly from my Supabase session and attached it to the `Authorization` header so the backend has the legal authority to post on my behalf.

The frontend is now 100% complete and heavily tested. The final step is replacing the Mock API with the actual LinkedIn API media upload dance!

---

## Day 13: The LinkedIn "Bouncer" & The First Live Text-Only Post

**Date:** March 8, 2026  
**Goal:** Transition from a simulation-based "Mock API" to the real-world LinkedIn UGC (User Generated Content) API and resolve authentication permission hurdles.

---

## Things I Learned (and Problems Faced)

### 1. The OAuth 2.0 Scope Labyrinth (`403 Forbidden`)
After wiring up the production endpoint, my first attempt to post resulted in a sharp `ACCESS_DENIED` error from LinkedIn. 

**The Problem:** By default, Supabase's LinkedIn OIDC provider only requests the `openid`, `profile`, and `email` scopes. These are "Read" permissions. To actually "Write" to a feed, you need the specific `w_member_social` permission.

**The Fix:** I had to explicitly modify the `signInWithOAuth` call in the frontend to include the required scope. 

**The "Ghost Token" Issue:** I learned that browsers aggressively cache OAuth tokens. Simply updating the code wasn't enough; I had to perform a **"Hard Reset"** by clearing LocalStorage and Cookies to force LinkedIn to show a fresh consent screen that explicitly included the "Create, modify, and delete posts" permission.

### 2. Identity Architecture (URNs vs IDs)
LinkedIn’s API doesn't use standard integer IDs for authors. It uses **URNs (Uniform Resource Names)**.

**The Logic:** Before posting, the backend must "self-identify." I built a pre-flight check that pings the `https://api.linkedin.com/v2/userinfo` endpoint using the user's access token. 

**The Format:** LinkedIn returns a `sub` field. I had to manually wrap this into the strict LinkedIn protocol format: `urn:li:person:${userData.sub}`. Without this exact string prefix, the entire JSON payload is rejected as malformed.

---

## How I Built It

### Step 1: The Production Bridge (`/api/linkedin/post`)
I converted the mock route into a real bridge. I implemented the `ugcPosts` endpoint, which is the current enterprise standard for LinkedIn content. 

For this initial phase, I set the `shareMediaCategory` to `"NONE"`. This allowed me to verify the authentication handshake and the URN formatting without the complexity of binary file uploads.

**Result:** At 4:45 PM, the first automated text post was successfully pushed from my local dev environment to my dummy LinkedIn account. **The "Brain-to-Feed" pipeline is officially live.**

---

## Day 14: The Multi-Image Handshake & The Admin Bouncer

**Date:** March 9, 2026  
**Goal:** Implement the complex 3-step binary media upload process for images and secure the dashboard against unauthorized access.

---

## Things I Learned (and Problems Faced)

### 1. The 3-Step Media "Dance"
LinkedIn does not accept images as simple URL links or attachments in the final post request. To prevent server timeouts, they require an asynchronous handshake:
1.  **Register:** Tell LinkedIn an image is coming. LinkedIn provides a `digitalmediaAsset` URN and a temporary, high-speed **Upload URL**.
2.  **The Heavy Lift (Binary PUT):** The server must take the raw image bytes and perform a `PUT` request to that temporary URL.
3.  **The Reference:** The final post JSON doesn't contain the image; it contains the `asset_urn` tracking number.

### 2. The "Smart Image Handler" (Binary Buffer Processing)
My backend initially crashed when trying to process the AI-generated images.

**The Discovery:** The "Pro Editor" sends two distinct data types in the same array:
* **External URLs:** The AI-generated 3D render already hosted in my Supabase bucket (starts with `http`).
* **Base64 Strings:** Manual photos uploaded by the user from their local machine (starts with `data:image`).

**The Fix:** I wrote a robust parser that detects the string prefix. If it's a URL, it uses `fetch` to download the image into an `ArrayBuffer`. If it's Base64, it strips the metadata and converts it into a Node.js `Buffer`. This ensures the server always has raw binary bytes to ship to LinkedIn.

### 3. Preventing Multi-Tenant Data Leakage
I realized a massive security flaw: since the app uses a public LinkedIn login, anyone who found the URL could log in and see my private GitHub drafts, and potentially post them to their own feed!

**The Fix:** I implemented a frontend "Admin Bouncer." The dashboard now captures the logged-in user's email and compares it against a hardcoded `ADMIN_EMAIL`. If a stranger logs in, the app renders a "Restricted Access" screen and refuses to fetch any data from Supabase.

---

## How I Built It

### Step 1: The Admin Lock
I updated `app/page.tsx` to instantly verify the session email before rendering the inbox grid, ensuring complete privacy for my automated drafts.

### Step 2: The Multi-Photo Logic
I upgraded the backend `/api/linkedin/post/route.ts` to loop through the `photos` array. Because LinkedIn requires each image to be registered and uploaded individually, I used a `for` loop to handle the asynchronous handshakes in sequence. Once all images are uploaded and marked as ready on LinkedIn's servers, the backend constructs the final `ugcPost` payload with the `shareMediaCategory` set to `"IMAGE"`.

### Step 3: UI Updates (The "Status" History)
I modified the Supabase query in `app/page.tsx` to remove the `.eq('status', 'draft')` filter so published posts wouldn't disappear. I then built a dynamic badge system:
* **Yellow:** Pending Approval (Editable)
* **Green:** ✅ Published (Locked/Read-Only)

**Result:** The Pro Editor can now successfully publish posts containing a mix of AI-generated visuals and manual uploads directly to the feed. The system is secure, the data is persistent, and the UX handles the transition from "Draft" to "Live" seamlessly.