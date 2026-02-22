import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function checkImagenModels() {
  console.log("🔍 Asking Google for available Imagen models...");
  
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
  const data = await response.json();
  
  if (!data.models) {
      console.error("❌ Failed to fetch models. Check your API key.");
      return;
  }
  
  // Filter only the models that have "imagen" in their name
  const imagenModels = data.models.filter((m: any) => m.name.toLowerCase().includes("image") && m.supportedGenerationMethods.includes("generateContent")); ;
  
  if (imagenModels.length === 0) {
      console.log("\n❌ NO IMAGEN MODELS FOUND.");
      console.log("Google has not enabled image generation for this specific API key/tier.");
  } else {
      console.log("\n✅ AVAILABLE IMAGEN MODELS:");
      imagenModels.forEach((m: any) => {
          console.log(`\n- Model: ${m.name}`);
          console.log(`  Methods: ${m.supportedGenerationMethods?.join(', ')}`);
      });
  }
}

checkImagenModels();