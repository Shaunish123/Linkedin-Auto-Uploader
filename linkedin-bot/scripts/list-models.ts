import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const googleAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

async function checkModels() {
  console.log("🔍 Asking Google what models we can use...");
  
  // Fetch the list of all models
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
  const data = await response.json();
  
  // Filter only the embedding models
  const embeddingModels = data.models.filter((m: any) => m.supportedGenerationMethods.includes("embedContent"));
  
  console.log("\n✅ AVAILABLE EMBEDDING MODELS:");
  embeddingModels.forEach((m: any) => console.log(`- ${m.name}`));
}

checkModels();