import { NextResponse } from "next/server"
import { App, LogLevel } from "@slack/bolt"
import { processImageRequest } from "@/lib/process-image"
import { verifySlackRequest } from "@/lib/verify-slack"
import { generateHelpText } from "@/lib/editing-options"
import { logger } from "@/lib/logger"

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
    logger.error("Error sending help information:", error)
  }
}

export async function POST(request: Request) {
  try {
    logger.info("Received new Slack event request");
    const rawBody = await request.text()
    logger.debug("Raw request body:", rawBody)
    const isValid = await verifySlackRequest(request, rawBody)

    if (!isValid) {
      logger.error("Invalid Slack signature")
      return NextResponse.json({ error: "Invalid request signature" }, { status: 401 })
    }

    const payload = JSON.parse(rawBody)
    logger.debug("Received Slack event", { type: payload.type })

    // Handle URL verification challenge
    if (payload.type === "url_verification") {
      logger.info("Responding to Slack URL verification challenge")
      return NextResponse.json({ challenge: payload.challenge })
    }

    // Handle events
    if (payload.type === "event_callback" && payload.event.type === "message") {
      const event = payload.event

      // Skip bot messages to prevent loops
      if (event.bot_id || event.subtype === "bot_message") {
        logger.debug("Skipping bot message")
        return NextResponse.json({ ok: true })
      }

      // Log full event object if user is undefined
      if (!event.user) {
        logger.debug("Event object with undefined user:", event)
      }

      // Handle direct messages with files
      if (event.type === "message" && event.channel_type === "im") {
        // Check if this is a message with files
        if (event.files && event.files.length > 0) {
          logger.info(`Processing message with ${event.files.length} files`)
          logger.info(`Files: ${JSON.stringify(event.files, null, 2)}`)

          // Process asynchronously to respond to Slack quickly
          processEvent(event, app).catch((error: unknown) => {
            logger.error("Error in async event processing:", error)
            notifyErrorToUser(
              event.channel,
              "There was an error processing your request. Please try again later.",
            ).catch(console.error)
          })
        } else if (event.text && event.text.trim().toLowerCase() === "/help") {
          // Handle help command without an image
          logger.info("Processing help request")
          handleHelpRequest(event.channel).catch(console.error)
        } else {
          // Handle messages without files
          logger.info("Notifying user about missing image")
          notifyUserAboutMissingImage(event.channel, event.user).catch(console.error)
        }
      }
    }

    // Respond quickly to acknowledge receipt
    logger.info("Sending 200 OK response to Slack")
    return NextResponse.json({ ok: true })
  } catch (error) {
    logger.error("Error handling Slack event:", error)

    // Determine if it's a parsing error
    if (error instanceof SyntaxError) {
      logger.info("Sending 400 Invalid JSON response to Slack")
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
    }

    logger.info("Sending 500 Internal Server Error response to Slack")
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

async function processEvent(event: any, app: App) {
  try {
    const files = event.files
    const userId = event.user_id || event.user
    const channelId = event.channel
    const text = event.text || ""

    // Prevent processing if the message is an error message containing an image URL
    if (text.includes("Error") && text.match(/https?:\/\/\S+/)) {
      logger.info("Skipping processing for error message containing image URL")
      return
    }

    // Only process image files
    const imageFiles = files.filter((file: any) => file.mimetype && file.mimetype.startsWith("image/"))

    if (imageFiles.length > 0) {
      logger.info(`Processing ${imageFiles.length} image files`)
      // Process the first image
      await processImageRequest({
        imageUrl: imageFiles[0].url_private,
        prompt: text,
        userId,
        channelId,
        app,
      })
    } else {
      // Inform user that no valid image files were found
      logger.info("No valid image files found")
      try {
        await app.client.chat.postMessage({
          channel: channelId,
          text: "I can only process image files. Please upload an image with your instructions.",
        })
      } catch (postError) {
        logger.error("Failed to send message about missing image:", postError)
      }
    }
  } catch (error) {
    logger.error("Error processing event:", error)
  }
}

async function notifyUserAboutMissingImage(channelId: string, userId: string) {
  try {
    await app.client.chat.postMessage({
      channel: channelId,
      text: `<@${userId}> I need an image to work with! Please upload an image along with your instructions.`,
    })
  } catch (error) {
    logger.error("Error sending missing image notification:", error)
  }
}

async function notifyErrorToUser(channelId: string, message: string) {
  try {
    await app.client.chat.postMessage({
      channel: channelId,
      text: message,
    })
  } catch (error) {
    logger.error("Error sending error notification:", error)
  }
}

// Required for Next.js Edge API routes
export const config = {
  runtime: "nodejs",
}
