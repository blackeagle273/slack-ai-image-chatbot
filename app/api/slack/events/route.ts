import { NextResponse } from "next/server"
import { App, LogLevel } from "@slack/bolt"
import { processImageRequest } from "@/lib/process-image"
import { verifySlackRequest } from "@/lib/verify-slack"

// Initialize the Slack app
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  logLevel: LogLevel.DEBUG,
})

export async function POST(request: Request) {
  try {
    // Verify the request is coming from Slack
    const rawBody = await request.text()
    const isValid = await verifySlackRequest(request, rawBody)

    if (!isValid) {
      return NextResponse.json({ error: "Invalid request signature" }, { status: 401 })
    }

    const payload = JSON.parse(rawBody)

    // Handle URL verification challenge
    if (payload.type === "url_verification") {
      return NextResponse.json({ challenge: payload.challenge })
    }

    // Handle events
    if (payload.type === "event_callback") {
      const event = payload.event

      // Handle direct messages with files
      if (event.type === "message" && event.channel_type === "im" && event.files) {
        // Process asynchronously to respond to Slack quickly
        processEvent(event).catch(console.error)
      }
    }

    // Respond quickly to acknowledge receipt
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Error handling Slack event:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

async function processEvent(event: any) {
  try {
    const files = event.files
    const userId = event.user
    const channelId = event.channel
    const text = event.text || ""

    // Only process image files
    const imageFiles = files.filter((file: any) => file.mimetype && file.mimetype.startsWith("image/"))

    if (imageFiles.length > 0) {
      // Process the first image
      await processImageRequest({
        imageUrl: imageFiles[0].url_private,
        prompt: text,
        userId,
        channelId,
        app,
      })
    } else {
      // Inform user that no valid images were found
      await app.client.chat.postMessage({
        channel: channelId,
        text: "I can only process image files. Please upload an image with your instructions.",
      })
    }
  } catch (error) {
    console.error("Error processing event:", error)
  }
}

// Required for Next.js Edge API routes
export const config = {
  runtime: "nodejs",
}
