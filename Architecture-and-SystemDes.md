
# Architecture & System Design: Automated LinkedIn Content Engine (V1)

## 1. High-Level Overview

The Commit-to-LinkedIn Engine is an event-driven, serverless pipeline designed to automate the generation of technical developer content. It leverages Retrieval-Augmented Generation (RAG) to ensure stylistic consistency and uses a multi-modal AI approach (Text + Image) to create high-engagement posts directly from git commit metadata.

**Core Philosophy:** Zero-friction documentation. The system acts as a "Ghostwriter" that observes code changes and drafts content asynchronously, requiring human intervention only for final approval.

## 2. System Architecture Diagram

The system follows a **Push-Based Event Architecture**. The workflow is triggered by a specific event (Git Push) and processed via a serverless Next.js backend.

```mermaid
graph TD
    %% Source
    subgraph "Event Source"
        Dev[Developer] -->|git push| Repo[GitHub Repository]
        Repo -->|Trigger| Action[GitHub Actions Runner]
    end

    %% Processing Layer
    subgraph "Control Plane (Next.js / Vercel)"
        Action -->|POST Payload| API[API Route: /api/generate]
        API -->|Auth Check| Secret[Validate API Secret]
        
        %% RAG Sub-system
        API -->|1. Generate Embeddings| Embed[Google Gemini Text-Embedding-004]
        Embed -->|2. Query Vector DB| VectorDB[(Supabase pgvector)]
        VectorDB -->|3. Return Style Context| API
        
        %% Inference Sub-system
        API -->|4. Generate Text| LLM[Groq (Llama 3.3 70B)]
        API -->|5. Generate Visuals| Vision[Google Imagen 3]
    end

    %% Persistence Layer
    subgraph "Data Plane (Supabase)"
        Vision -->|6. Upload Buffer| Storage[Object Storage Bucket]
        Storage -->|7. Return Public URL| API
        API -->|8. Persist Draft| DB[(PostgreSQL)]
    end

    %% Presentation Layer
    subgraph "Client"
        DB -->|Fetch| Dashboard[Next.js Dashboard]
        Dashboard -->|Approve/Edit| User
        User -->|Publish| LinkedIn[LinkedIn API]
    end
```

## 3. Technology Stack & Rationale

| Component | Technology | Rationale |
|-----------|------------|----------|
| Compute | Next.js (App Router) | Provides serverless API routes (`/api/*`) and frontend UI in a single monorepo. Deployed on Vercel for zero-config scaling. |
| Database | Supabase (PostgreSQL) | Combines relational data (users, posts) with pgvector for semantic search, eliminating the need for a separate vector DB (like Pinecone). |
| LLM Inference | Groq (Llama 3.3 70B) | Chosen for ultra-low latency inference (~300ms) and high-quality coding capabilities compared to smaller models. |
| Embeddings | Gemini text-embedding-004 | High-dimensional (768d) embeddings optimized for semantic retrieval of technical content. |
| Image Gen | Google Imagen 3 | Superior photorealism for abstract tech concepts compared to Stable Diffusion. |
| Object Storage | Supabase Storage | S3-compatible storage for serving generated images via public URLs. |
| CI/CD Trigger | GitHub Actions | Enables "Infrastructure as Code" for the trigger mechanism, running directly in the repository context. |

## 4. Data Architecture

### 4.1. Database Schema (PostgreSQL)

The system uses a relational schema with vector extensions.

#### Table: `style_examples` (The Knowledge Base)

Used for RAG. Stores high-performing past posts to "teach" the LLM the user's voice.

```sql
CREATE TABLE style_examples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  embedding VECTOR(768) -- Gemini Embedding Dimensions
);
```

#### Table: `posts` (The State Machine)

Stores the lifecycle of a generated post.

```sql
CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_name TEXT NOT NULL,
  original_commit_msg TEXT NOT NULL,
  
  -- AI Generated Assets
  draft_content TEXT,
  image_url TEXT,
  
  -- Workflow State
  status TEXT CHECK (status IN ('draft', 'published', 'failed')) DEFAULT 'draft',
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  linkedin_post_id TEXT
);
```

### 4.2. Vector Search Implementation

We utilize **Cosine Similarity** to retrieve relevant style examples. The query logic is wrapped in a PL/pgSQL function for performance.

- **Metric:** Cosine Distance (`<=>` operator in pgvector)
- **Threshold:** < 0.5 distance ensures strict stylistic alignment

## 5. Pipeline Sequence (The "Generate" Flow)

1. **Ingestion:**
   - GitHub Action captures the commit message (`feat: added rbac`) and the git diff
   - Payload is signed with a secret key and sent to `/api/generate`

2. **Semantic Retrieval (RAG):**
   - The commit message is embedded using `text-embedding-004`
   - System queries `style_examples` for the top 2 most semantically similar past posts (e.g., retrieving a past "feature announcement" to match the current "feature" commit)

3. **Context Construction:**
   - A prompt is constructed dynamically: System Instruction + Style Examples + Code Diff

4. **Inference:**
   - **Text:** Groq generates the post body using Llama 3.3
   - **Visual:** Google Imagen 3 generates a 3D abstract render based on the commit keywords

5. **Asset Management:**
   - The raw binary image (Base64) is buffered and streamed to Supabase Storage
   - The returned Public URL is attached to the draft

6. **Persistence:**
   - The final draft object is written to the `posts` table

## 6. Security & Constraints

- **API Security:** The `/api/generate` endpoint is protected via a static `x-secret-key` header matching the GitHub Repository Secret
- **Payload Limits:** The GitHub Action truncates git diff output to 3000 lines to prevent token limit exhaustion and payload size errors
- **Failover Strategy:** If Google Imagen API fails (due to strict safety filters or rate limits), the system automatically falls back to Pollinations.ai to ensure a draft is always created

## 7. Future Roadmap (V2 Considerations)

- **Multi-Tenancy:** Implementing Row Level Security (RLS) to support multiple users
- **LinkedIn OAuth:** Automating the "Publish" step via LinkedIn v2 API (`w_member_social` scope)
- **Analytics Feedback Loop:** Feeding LinkedIn engagement metrics back into the Vector DB to weight "successful" styles higher

