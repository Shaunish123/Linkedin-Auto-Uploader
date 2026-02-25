// github sends webhook encrypted with hmac sha256 encrypted with  secret
// sends json payload and signature to this app
// this route takes payload and encrypts it with saem secret
// then compares: if same then we know the request is from github and we can process it
// this is done because no one other can send request to this route without knowing the secret

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { Client } from "@upstash/qstash";

// initialize qstash client: RECEIVES MESSAGE
const qstashClient = new Client({
    token: process.env.QSTASH_TOKEN!,
});

export async function POST(req: NextRequest) {
    try {// grab raw payload and signature github sent
        const rawBody = await req.text();
        const signature = req.headers.get("x-hub-signature-256") || "";

        // check if signature exists
        if(!signature){
            console.error("No signature found in headers");
            return NextResponse.json({error: "Unauthorized"}, {status: 401});
        }

        // hash raw body with secret using hmac sha256
        const hmac = crypto.createHmac("sha256", process.env.GITHUB_WEBHOOK_SECRET!);
        const digest = "sha256=" + hmac.update(rawBody).digest("hex");

        // compare signatures and if they match, we know the request is from github
        const isValid = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));

        if(!isValid){
            console.error("Invalid signature. Possible malicious request.");
            return NextResponse.json({error: "Unauthorized: Invalid signature"}, {status: 401});
        }

        // parse (parse meanse we convert the raw body into json so we can read it and use it in our app)
        // the safe json to see what data github sent us
        const payload = JSON.parse(rawBody);

        // ignore anything that isnt a published release ( we only care about release events, not push or pr or other events)
        if(payload.action !== "published" || !payload.release){
            console.log("Event is not a published release. Ignoring.");
            return NextResponse.json({message: "Event ignored"}, {status: 200});
        }

        // ok lets handover this package to qstash 
        console.log(`Valid release detected for: ${payload.repository.name}`);

        await qstashClient.publish({
            // qstash needs to deliver this forward
            url: `https://${req.headers.get("host")}/api/generate`,
            body: {
                repoName: payload.repository.name,
                owner: payload.repository.owner.login,
                tag: payload.release.tag_name,
            },
        });

        // respond to github that we received the webhook and its valid 
        // (necessary to respond within 10 secs otherwise github will think something is wrong and retry or disable the webhook)

        return NextResponse.json({success: true, message: "Webhook received and validated"}, {status: 200});
    } catch (error) {
        console.error("Error processing webhook:", error);
        return NextResponse.json({error: "Internal server error"}, {status: 500});
    }


}
