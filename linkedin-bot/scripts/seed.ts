import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from 'dotenv';

//load env variables
dotenv.config({path: '.env.local'});

//intialize clients
const googleAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// some viral posts to seed the database with
const viralPosts = [
  // 1. The "I solved a hard problem" post
  `My database queries were taking 4 seconds to load.

8 hours of debugging. Every day.

3 days later, those same queries take 40 milliseconds.

What changed?

I stopped fighting the ORM and wrote raw SQL with proper indexing:
→ Analyzed the query execution plan
→ Added composite indexes to the most queried columns
→ Removed N+1 query bottlenecks
→ Cached static responses with Redis

The result: 99% faster load times and zero timeouts.

Sometimes the best framework is just understanding the underlying technology. 

What technical debt are you fighting right now?`,

  // 2. The "I built a cool feature / The Twist" post
  `Here's a crazy debugging story from my latest weekend project...

I needed to extract text from messy PDF documents for a new AI pipeline.
Sounds simple, right? 
Not when dealing with broken formatting.

Here's how I cracked it:
• Ditched standard libraries
• Implemented custom OCR
• Chunked the text into 1000-character blocks
• Added 200-character overlaps so the AI doesn't lose context

The result? A highly accurate vector search in under 300ms.

Now, here's the kicker...
I almost gave up and just threw the raw text at the LLM. But taking the extra time to clean the data made the AI 10x smarter.

Investing time in the ingestion pipeline saves hallucinations later. 

What's your best solo coding win this week?`,

  // 3. The "I shipped a project" post
  `I did it! V1 of my personal project is finally live! 🎉

When I started building this 2 months ago, the architecture was a mess. I had to stop the feature creep and focus on the core logic.

My game plan?
• Rip out unnecessary state management
• Shift heavy processing to background workers
• Go all-in on a clean, minimalist UI

The payoff? I cut the bundle size by 50% and the app feels lightning fast.

Building this entirely from scratch taught me more than any tutorial ever could. Massive props to the open-source libraries that make solo building a superpower.

What's a big technical milestone you hit recently? Let's hype each other up!`,

  // 4. The "I learned a hard lesson" post (Great for students)
  `I used to think RAG was just "searching a database and sending it to an LLM."

Then I tried to build it from scratch.

I quickly learned that a simple search isn't enough. If a user asks "Explain that," the AI gets lost. It has no memory.

Here is how I fixed the amnesia in my latest app:
→ Swapped standard retrieval for a Conversational Retrieval Chain
→ Added a step to rewrite user questions based on history
→ Sliced the chat context to the last 6 messages to save tokens

The difference is night and day. The AI actually holds a conversation now.

Building things breaks your illusions of how simple they are. 

What is a technical concept you recently completely changed your mind about?`
];

async function seed() {
    console.log(`Seeding ${viralPosts.length} posts...`);

    // gemini embedding model

    const model = googleAI.getGenerativeModel({model: "models/gemini-embedding-001"});

    for(const post of viralPosts) {
        try{
            // turn text into vectors
            const result = await model.embedContent(post);
            const vector = result.embedding.values;
            
            // upload text and vector to supabase
            const {error} = await supabase.from('style_examples').insert({
                content: post,
                embedding: vector
            });

            if(error) {
                console.error('Error inserting post:', error);
            }

            console.log('Inserted post with id:', post.slice(0, 30) + '...');

        } catch (error) {
            console.error('Error processing post:', error);

        }

    }

    console.log('Seeding complete!');
}

// run the seed function
seed()