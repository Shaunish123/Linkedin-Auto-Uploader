import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function generateAndUploadImage(commitMessage: string): Promise<string> {
    let imageBuffer: Buffer | null = null;
    const seed = Math.floor(Math.random() * 100000);

    const imagePrompt = `A high quality 3D dramatic, extreme low-angle shot looking up representing: ${commitMessage}. Dark mode, cyberpunk lighting, neon accents, clean background, highly detailed, no text.`;

    console.log("Attempting Image Generation via Hugging Face Serverless API FLUX.1 schnell");

    try {
        // primary attempt using Hugging Face FLUX.1
        // updated to the new router huggingface endpoint
        const hfUrl = "https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell";
        
        // calling hugging face inference url
        const hfResponse = await fetch(hfUrl, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify({
                inputs: imagePrompt
            })
        });

        if (!hfResponse.ok) {
            const errorText = await hfResponse.text();
            throw new Error(`Hugging Face API failed status ${hfResponse.status} ${errorText}`);
        }

        // hugging face returns the raw image bytes directly
        const arrayBuffer = await hfResponse.arrayBuffer();
        imageBuffer = Buffer.from(arrayBuffer);
        console.log("Hugging Face Generation Successful");

    } catch (hfError: any) {
        console.warn(`Hugging Face Failed ${hfError.message} Falling back to Pollinations API`);
        
        try {
            // fallback attempt using pollinations
            const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(imagePrompt)}?width=1024&height=768&nologo=true&seed=${seed}`;
            
            // calling pollinations api url
            const polyResponse = await fetch(pollinationsUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            });

            if (!polyResponse.ok) throw new Error(`Pollinations failed status ${polyResponse.status}`);

            // fetching raw jpeg bytes
            const arrayBuffer = await polyResponse.arrayBuffer();
            imageBuffer = Buffer.from(arrayBuffer);
            console.log("Pollinations API Generation Successful");

        } catch (fallbackError: any) {
            console.warn(`Pollinations Failed ${fallbackError.message} Using Reliable Picsum Fallback`);
            
            // the ultimate fallback guaranteed professional placeholder image
            try {
                // grayscale blurred moody tech background
                const reliableUrl = `https://picsum.photos/seed/${seed}/1024/768?grayscale&blur=2`;
                const reliableResponse = await fetch(reliableUrl);
                
                const arrayBuffer = await reliableResponse.arrayBuffer();
                imageBuffer = Buffer.from(arrayBuffer);
                console.log("Reliable Fallback Generation Successful");
            } catch (totalFailure) {
                console.error("Total visual pipeline failure");
                return "";
            }
        }
    }

    // upload phase
    if (imageBuffer) {
        try {
            console.log("Uploading image to Supabase Storage");
            const fileName = `post-image-${Date.now()}.jpg`;

            // calling supabase storage upload
            const { error: uploadError } = await supabase.storage
                .from('linkedin-images')
                .upload(fileName, imageBuffer, {
                    contentType: 'image/jpeg',
                    upsert: false
                });

            if (uploadError) throw new Error(`Supabase Upload Error ${uploadError.message}`);

            // fetching public url from supabase
            const { data: publicUrlData } = supabase.storage
                .from('linkedin-images')
                .getPublicUrl(fileName);
                
            return publicUrlData.publicUrl;
            
        } catch (uploadError: any) {
            console.error("Upload to Supabase Failed", uploadError.message);
            return "";
        }
    }

    return "";
}