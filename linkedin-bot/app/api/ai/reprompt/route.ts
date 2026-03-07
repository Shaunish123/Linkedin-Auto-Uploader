import { NextResponse } from "next/server";
import Groq from "groq-sdk";

// Initialize the Groq client (Make sure GROQ_API_KEY is in your .env.local)
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { currentContent, instruction } = body;

    if (!currentContent || !instruction) {
      return NextResponse.json(
        { error: "Missing current content or instruction." },
        { status: 400 }
      );
    }

    // 1. Set strict boundaries for the AI Editor
    const systemPrompt = `
      You are an expert technical copywriter and editor managing a solo software developer's LinkedIn account.
      Your task is to take an existing LinkedIn post draft and modify it strictly according to the user's instructions.
      
      CRITICAL RULES:
      1. Maintain a first-person perspective ("I", "my"). Do not use "We" or "Our team".
      2. DO NOT add any conversational filler (e.g., "Here is the revised draft:", "Sure, I can help with that!").
      3. Return ONLY the final, ready-to-publish raw text. 
      4. Do not wrap the output in markdown code blocks.
    `;

    // 2. Pass the exact draft and the user's command
    const userPrompt = `
      --- CURRENT DRAFT ---
      ${currentContent}
      
      --- USER INSTRUCTION ---
      ${instruction}
    `;

    // 3. Call Llama 3.3 for lightning-fast text generation
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      model: "llama-3.3-70b-versatile", 
      temperature: 0.7, // 0.7 gives a good balance of creativity and following instructions
    });

    const newContent = chatCompletion.choices[0]?.message?.content?.trim();

    if (!newContent) {
      throw new Error("The AI returned an empty response.");
    }

    // 4. Send the rewritten text back to the frontend
    return NextResponse.json({ newContent });

  } catch (error: any) {
    console.error("AI Reprompt Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to rewrite content." },
      { status: 500 }
    );
  }
}