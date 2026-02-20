// We are going to create the endpoint that GitHub will eventually send your code to. 
// It will take your commit message, turn it into a vector, search your style_examples table, 
// and then ask Groq to write the post.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from 'groq-sdk';
import * as dotenv from 'dotenv';

dotenv.config({path: '.env.local'});

// Initialize clients
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
const googleAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const groq = new Groq({apiKey: process.env.GROQ_API_KEY});

// a post request will come in with the commit message and code readme

export async function POST(req: Request){
    try{
        const{message, diff, readme} = await req.json();
        console.log("Receive commit: ", message);

        // step 1 : rag - find similar posts

        // convert message to embedding
        const embedModel = googleAI.getGenerativeModel({model: "models/gemini-embedding-001"});
        const embeddingResult = await embedModel.embedContent(message);
        const vector = embeddingResult.embedding.values;

        // search for similar posts in supabase
        const {data: similarPosts, error: ragError} = await supabase.rpc('match_style', {
            query_embedding: vector,
            match_threshold: 0.5,
            match_count: 2
        })

        if(ragError) {
            console.error("Error during RAG: ", ragError);
            return NextResponse.json({error: "Error during RAG"}, {status: 500});
        }

        // stylecontext is the examples we will give to groq to show the style we want the post in. 
        // We will concatenate the similar posts we found into one string and give that to groq as context.

        const styleContext = similarPosts?.map((p:any) => `EXAMPLE POST: \n ${p.content}`).join("\n\n") || "";
        

        // step 2 : prompt and generate

        const prompt = `
            ROLE: You are an expert developer ghostwriter. Write a LinkedIn post about a recent code update.
            
            REFERENCE STYLES (Mimic the tone, structure, formatting, and length of these):
            ${styleContext}
            
            RULES:
            - Write from a first-person "I" perspective (solo developer).
            - If examples exist, use their exact sentence structure and spacing.
            - NO hashtags in the middle of sentences.
            - NO "excited to announce" or corporate jargon.
            - Use emojis but only where relevant (e.g. when talking about a technical breakthrough, use a mind-blown emoji. Don't just sprinkle them everywhere).
            - If the commit is a bug fix, write about the struggle of debugging and the satisfaction of solving it. If it's a new feature, write about the problem it solves and how you built it.
            - if the commit message is vague, make assumptions based on the code diff and write about those assumptions. For example, if the commit message is "refactor codebase" and the diff shows that the developer switched from REST to GraphQL, write about how you decided to switch to GraphQL and the benefits it has.
            - In the end of the post, ask a question to encourage engagement. For example, "What technical milestone are you most proud of?" or "What's a recent hard lesson you learned in coding?"
            - Include hashtags at the end of the post, but only relevant ones. For example, if the commit is about a React update, use #reactjs. If it's about a bug fix, use #bugfix.

            DYNAMIC CONTEXT ROUTING (FOLLOW STRICTLY):
            - IF A README IS PROVIDED: This is a FINAL PROJECT LAUNCH. The README contains the exact details of what you built. Ignore the Code Diff. Your ONLY job is to summarize the project's value, the problem it solves, and the tech stack you used, based entirely on the README. 
            - IF NO README IS PROVIDED: This is a day-to-day coding update. Focus on the struggle of debugging or the specific logic changed in the Code Diff.
            
            INPUT DATA:
            Commit Message: ${message}
            README Context: ${readme ? readme.substring(0, 20000) : "No README provided"}
            Code Diff: ${diff ? diff.substring(0, 1500) : "No diff provided"}
            `;

        const chatCompletion = await groq.chat.completions.create({
            messages: [{role: 'user', content: prompt}],
            model: "llama-3.3-70b-versatile"
        })

        // the generated content is in chatCompletion.choices[0].message.content
        const aiContent = chatCompletion.choices[0]?.message?.content || "GENERATION FAILED!!!!!!!!!!!";

        // step3 save the draft to supabase

        const {data, error} = await supabase.from('posts').insert([{
            commit_message : message,
            readme_content : readme ? readme.substring(0, 20000) : null, // Save a chunk of readme to DB for your records
            draft_content : aiContent,
            status: 'draft'
        }]).select();

        if(error) {
            console.error("Error saving post to database: ", error);
            return NextResponse.json({error: "Error saving post to database"}, {status: 500});
        }

        return NextResponse.json({success: true, id: data[0].id, content: aiContent});


    }

    catch(error) {
        console.error("Error in POST handler / API: ", error);
        return NextResponse.json({error: error.message || "Unknown error"}, {status: 500});
    }
}

