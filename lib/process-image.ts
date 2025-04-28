import { OpenAI } from "openai"
import axios from "axios"
import fs from "fs"
import { logger } from "./logger"
import { parseEditingCommand, generateHelpText } from "@/lib/editing-options"
import { App } from "@slack/bolt"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

interface ProcessImageRequestParams {
  imageUrl: string
  prompt: string
  userId: string
  channelId: string
  app: App // Slack App instance
}

// Define error types for better handling
enum ErrorType {
  DOWNLOAD_ERROR = "DOWNLOAD_ERROR",
  OPENAI_ERROR = "OPENAI_ERROR",
  UPLOAD_ERROR = "UPLOAD_ERROR",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

export async function processImageRequest({ imageUrl, prompt, userId, channelId, app }: ProcessImageRequestParams) {
  logger.debug("processImageRequest called")
  // Track the processing stage for better error messages
  let processingStage = "starting"

  try {
    logger.info(`Processing image request for user ${userId} with prompt: ${prompt}`)

    // Inform user that processing has started with more details
    logger.debug("Sending initial processing message to Slack")
    try {
      await app.client.chat.postMessage({
        channel: channelId,
        text: `:hourglass: I'm processing your image request. This typically takes 15-30 seconds...`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `:hourglass: *Processing your image*\n\nI'll edit your image based on: "${prompt || "Enhance this image"}"\n\nThis typically takes 15-30 seconds...`,
            },
          },
        ],
      });
    } catch (error) {
      console.error("Failed to post message to Slack:", error);
    }
    logger.debug("Initial processing message sent to Slack")

    // Parse editing command safely
    let editingOption
    try {
      logger.debug("Parsing editing command from prompt")
      editingOption = parseEditingCommand(prompt.trim())
      logger.debug(`Editing option parsed: ${editingOption ? editingOption.name : "none"}`)
    } catch (err) {
      logger.error("Error parsing editing command:", err)
      editingOption = null
    }

    // Handle help command
    if (prompt.trim().toLowerCase() === "/help") {
      logger.debug("Help command detected, sending help text")
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
        ],
      })
      logger.debug("Help text sent")
      return
    }

    // Set the prompt based on editing option or user input
    const userPrompt = editingOption
      ? editingOption.prompt
      : prompt.trim() || "Enhance this image and make it look better"

    // Update user on progress with editing option info if applicable
    try {
      logger.debug("Sending progress update message to Slack")
      await app.client.chat.postMessage({
        channel: channelId,
        text: editingOption
          ? `:art: Applying *${editingOption.name}* style ${editingOption.emoji}`
          : `:art: Now applying your edits: "${userPrompt}"`,
      })
      logger.debug("Progress update message sent")
    } catch (err) {
      logger.error("Error sending progress update message:", err)
    }

    processingStage = "generating image with gpt-image-1"
    logger.info("Generating image with gpt-image-1")

    // Prepare image input for OpenAI images.edit
    let img_input
    if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
      // Download image as arraybuffer and convert to File-like object
      logger.debug("Downloading image as arraybuffer for OpenAI API")
      const response = await axios.get(imageUrl, { responseType: "arraybuffer", timeout: 10000 })
      logger.debug("Image download response received")
      const buffer = Buffer.from(response.data)
      // Create a File-like object with required properties for OpenAI API
      const file = new File([buffer], "image.png", { type: "image/png" })
      img_input = file
    } else {
      // Read local file as stream
      img_input = fs.createReadStream(imageUrl)
    }

    logger.debug("Calling OpenAI images.edit API")

    // Now use the gpt-image-1 model to generate the image
    let imageGenResponse
    try {
      // Direct approach with gpt-image-1
      imageGenResponse = await openai.images.edit({
        model: "gpt-image-1",
        prompt: userPrompt,
        image: img_input,
      })

      logger.info("Received image generation response from OpenAI")
    } catch (error) {
      logger.error("OpenAI image generation error:", error)

      // Send error details to the user
      await app.client.chat.postMessage({
        channel: channelId,
        text: `:warning: Error from OpenAI: ${error instanceof Error ? error.message : "Unknown error"}`,
      })

      throw {
        type: ErrorType.OPENAI_ERROR,
        message: `Error generating image with OpenAI: ${error instanceof Error ? error.message : "Unknown error"}`,
      }
    }

    const generatedImageUrl = imageGenResponse?.data?.[0]?.url
    
    if (!generatedImageUrl) {
      logger.error("No image URL returned from OpenAI")
      throw { type: ErrorType.OPENAI_ERROR, message: "No image URL returned from OpenAI" }
    }
    
    logger.info("Image generation successful, URL:", generatedImageUrl)

    logger.info("Successfully received image URL from OpenAI")

    // Update user on progress
    await app.client.chat.postMessage({
      channel: channelId,
      text: `:white_check_mark: Your image is ready! Uploading now...`,
    })

    processingStage = "downloading generated image"
    // Download the generated image
    let generatedImageResponse
    try {
      logger.debug("Downloading generated image from URL")
      generatedImageResponse = await axios.get(generatedImageUrl, {
        responseType: "arraybuffer",
        timeout: 10000, // 10 second timeout
      })
      logger.info("Downloaded generated image")
    } catch (error) {
      logger.error("Error downloading generated image:", error)
      throw { type: ErrorType.DOWNLOAD_ERROR, message: "Failed to download the generated image" }
    }

    processingStage = "uploading to Slack"
    // Upload the image to Slack
    let uploadResponse
    try {
      logger.debug("Uploading generated image to Slack")
      uploadResponse = await app.client.files.upload({
        channels: channelId,
        file: generatedImageResponse.data,
        filename: "edited-image.png",
        initial_comment: `:sparkles: Here's your edited image based on: "${userPrompt}"`,
      })
      logger.info("Uploaded generated image to Slack")
    } catch (error) {
      logger.error("Error uploading to Slack:", error)
      throw { type: ErrorType.UPLOAD_ERROR, message: "Failed to upload the edited image to Slack" }
    }

    if (!uploadResponse.ok) {
      throw { type: ErrorType.UPLOAD_ERROR, message: `Failed to upload image to Slack: ${uploadResponse.error}` }
    }

    // Send a completion message with helpful tips
    logger.debug("Sending image processing completion message to Slack")
    await app.client.chat.postMessage({
      channel: channelId,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `:tada: *Image editing complete!*\n\nTo edit another image, simply upload it with your instructions.`,
          },
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: "💡 *Tip:* Be specific in your instructions for better results. For example, 'Make the sky more blue' or 'Convert to watercolor style'.",
            },
          ],
        },
      ],
    })
    logger.info("Image processing complete")
  } catch (error) {
    logger.error(`Error during ${processingStage}:`, error)

    // Determine the error type and provide a helpful message
    let userErrorMessage = "Sorry, I encountered an error while processing your image."

    if (
      typeof error === "object" &&
      error !== null &&
      "type" in error
    ) {
      const typedError = error as { type: ErrorType; message?: string }
      if (typedError.type === ErrorType.DOWNLOAD_ERROR) {
        userErrorMessage = "I couldn't download your image. Please try uploading it again."
      } else if (typedError.type === ErrorType.OPENAI_ERROR) {
        userErrorMessage = `There was a problem editing your image: ${typedError.message}`
      } else if (typedError.type === ErrorType.UPLOAD_ERROR) {
        userErrorMessage = "Your image was edited successfully, but I couldn't upload it back to Slack. Please try again."
      } else if (typedError.type === ErrorType.VALIDATION_ERROR) {
        userErrorMessage = typedError.message || ""
      }
    }

    // Send a user-friendly error message
    logger.debug("Sending error message to user in Slack")
    await app.client.chat.postMessage({
      channel: channelId,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `:warning: *Error*: ${userErrorMessage}`,
          },
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: "If this problem persists, please contact the administrator.",
            },
          ],
        },
      ],
    })
  }
}
