import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    // 1. Grab the LinkedIn Token from the headers
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "No LinkedIn token provided" }, { status: 401 });
    }
    const token = authHeader.replace("Bearer ", "");

    // 2. Parse the payload
    const formData = await req.formData();
    const content = formData.get("content") as string;
    const mediaType = formData.get("mediaType") as string;
    const photosString = formData.get("photos") as string;
    
    // 3. GET AUTHOR URN (Who am I?)
    const userInfoRes = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
    });
    
    if (!userInfoRes.ok) {
      const errorData = await userInfoRes.json();
      throw new Error(`Failed to fetch LinkedIn profile: ${JSON.stringify(errorData)}`);
    }

    const userData = await userInfoRes.json();
    const authorUrn = `urn:li:person:${userData.sub}`;
    console.log("✅ Authenticated as:", authorUrn);

    // --- MEDIA UPLOAD PIPELINE ---
    let mediaAttachments: any[] = [];
    let shareMediaCategory = "NONE";

    if (mediaType === "photos" && photosString) {
      const photosArray = JSON.parse(photosString); 
      
      if (photosArray.length > 0) {
        shareMediaCategory = "IMAGE";
        console.log(`📸 Processing ${photosArray.length} photos...`);

        for (let i = 0; i < photosArray.length; i++) {
          const imageStr = photosArray[i];
          let imageBuffer: Buffer;

          // --- SMART IMAGE HANDLER ---
          if (imageStr.startsWith("http://") || imageStr.startsWith("https://")) {
            // It's a standard URL (like the Supabase AI image)
            console.log(`⬇️ Downloading URL image ${i + 1}...`);
            const imgRes = await fetch(imageStr);
            if (!imgRes.ok) throw new Error(`Failed to fetch image from URL: ${imageStr}`);
            const arrayBuffer = await imgRes.arrayBuffer();
            imageBuffer = Buffer.from(arrayBuffer);
          } else if (imageStr.startsWith("data:image")) {
            // It's a Base64 string from local upload
            console.log(`⚙️ Processing Base64 image ${i + 1}...`);
            const base64Data = imageStr.split(",")[1];
            imageBuffer = Buffer.from(base64Data, "base64");
          } else {
            throw new Error("Invalid image format received.");
          }

          // STEP A: Register the Upload
          const registerRes = await fetch("https://api.linkedin.com/v2/assets?action=registerUpload", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              registerUploadRequest: {
                recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
                owner: authorUrn,
                serviceRelationships: [
                  {
                    relationshipType: "OWNER",
                    identifier: "urn:li:userGeneratedContent",
                  },
                ],
              },
            }),
          });

          if (!registerRes.ok) throw new Error("Failed to register image upload with LinkedIn.");
          const registerData = await registerRes.json();
          
          const uploadUrl = registerData.value.uploadMechanism["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"].uploadUrl;
          const assetUrn = registerData.value.asset;

          console.log(`🔗 Got Upload URL for image ${i + 1}. Pushing bytes...`);

          // STEP B: Upload the actual binary bytes
          const uploadRes = await fetch(uploadUrl, {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/octet-stream", 
            },
            body: imageBuffer,
          });

          if (!uploadRes.ok) throw new Error(`Failed to upload image bytes for image ${i + 1}.`);

          // STEP C: Save the URN to attach to our final post
          mediaAttachments.push({
            status: "READY",
            media: assetUrn,
          });
        }
      }
    }

    // 4. PUBLISH THE POST
    console.log(`🚀 Publishing final UGC Post with Category: ${shareMediaCategory}`);
    
    const postBody: any = {
      author: authorUrn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: {
            text: content,
          },
          shareMediaCategory: shareMediaCategory,
        },
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
      },
    };

    if (mediaAttachments.length > 0) {
      postBody.specificContent["com.linkedin.ugc.ShareContent"].media = mediaAttachments;
    }

    const postRes = await fetch("https://api.linkedin.com/v2/ugcPosts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify(postBody),
    });

    if (!postRes.ok) {
      const errorData = await postRes.json();
      throw new Error(`LinkedIn Post Failed: ${JSON.stringify(errorData)}`);
    }

    const postData = await postRes.json();
    console.log("🎉 Successfully posted with Media! LinkedIn Post ID:", postData.id);

    return NextResponse.json({ 
      success: true, 
      linkedin_id: postData.id 
    });

  } catch (error: any) {
    console.error("LinkedIn API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}