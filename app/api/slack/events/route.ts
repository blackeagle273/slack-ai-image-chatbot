import { NextResponse } from "next/server"
import { App, LogLevel } from "@slack/bolt"
import { processImageRequest } from "@/lib/process-image"
import { verifySlackRequest } from "@/lib/verify-slack"
// Import the help text generator
import { generateHelpText } from "@/lib/editing-options"

// Initialize the Slack app
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  logLevel: LogLevel.DEBUG,
})

// Add a new function to handle help requests
async function handleHelpRequest(channelId: string) {
  try {
    await app.client.chat.postMessage({
      channel: channelId,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: generateHelpText(),
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "To use these commands, upload an image along with the command.",
          },
        },
      ],
    })
  } catch (error) {
    console.error("Error sending help information:", error)
  }
}

export async function POST(request: Request) {
  try {
    // Verify the request is coming from Slack
    const rawBody = await request.text()
    const isValid = await verifySlackRequest(request, rawBody)

    if (!isValid) {
      console.error("Invalid Slack signature")
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
      if (event.type === "message" && event.channel_type === "im") {
        if (event.files) {
          // Process asynchronously to respond to Slack quickly
          processEvent(event).catch((error) => {
            console.error("Error in async event processing:", error)
            notifyErrorToUser(
              event.channel,
              "There was an error processing your request. Please try again later.",
            ).catch(console.error)
          })
        } else if (event.text && event.text.trim().toLowerCase() === "/help") {
          // Handle help command without an image
          handleHelpRequest(event.channel).catch(console.error)
        } else {
          // Handle messages without files
          notifyUserAboutMissingImage(event.channel, event.user).catch(console.error)
        }
      }
    }

    // Respond quickly to acknowledge receipt
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Error handling Slack event:", error)

    // Determine if it's a parsing error
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
    }

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

async function notifyUserAboutMissingImage(channelId: string, userId: string) {
  try {
    await app.client.chat.postMessage({
      channel: channelId,
      text: `<@${userId}> I need an image to work with! Please upload an image along with your instructions.`,
    })
  } catch (error) {
    console.error("Error sending missing image notification:", error)
  }
}

async function notifyErrorToUser(channelId: string, message: string) {
  try {
    await app.client.chat.postMessage({
      channel: channelId,
      text: message,
    })
  } catch (error) {
    console.error("Error sending error notification:", error)
  }
}

// Required for Next.js Edge API routes
export const config = {
  runtime: "nodejs",
}
