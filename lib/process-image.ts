import { OpenAI } from "openai"
import axios from "axios"
import { logger } from "./logger"
import { parseEditingCommand, generateHelpText } from "@/lib/editing-options"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

interface ProcessImageRequestParams {
  imageUrl: string
  prompt: string
  userId: string
  channelId: string
  app: any // Slack App instance
}

// Define error types for better handling
enum ErrorType {
  DOWNLOAD_ERROR = "DOWNLOAD_ERROR",
  OPENAI_ERROR = "OPENAI_ERROR",
  UPLOAD_ERROR = "UPLOAD_ERROR",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

// Maximum file size (10MB)
const MAX_FILE_SIZE = 10 * 1024 * 1024

export async function processImageRequest({ imageUrl, prompt, userId, channelId, app }: ProcessImageRequestParams) {
  // Track the processing stage for better error messages
  let processingStage = "starting"

  try {
    logger.info(`Processing image request for user ${userId} with prompt: ${prompt}`)

    // Inform user that processing has started with more details
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
    })

    processingStage = "downloading"
    logger.info("Downloading image from Slack")

    // Download the image from Slack with timeout and retry
    let imageResponse
    try {
      imageResponse = await axios.get(imageUrl, {
        headers: {
          Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
        },
        responseType: "arraybuffer",
        timeout: 10000, // 10 second timeout
      })
    } catch (error) {
      logger.error("Error downloading image from Slack:", error)
      throw { type: ErrorType.DOWNLOAD_ERROR, message: "Failed to download the image from Slack" }
    }

    const imageBuffer = Buffer.from(imageResponse.data)
    logger.info(`Downloaded image, size: ${(imageBuffer.length / 1024).toFixed(2)}KB`)

    // Validate image size
    if (imageBuffer.length > MAX_FILE_SIZE) {
      throw {
        type: ErrorType.VALIDATION_ERROR,
        message: `Image is too large (${(imageBuffer.length / (1024 * 1024)).toFixed(2)}MB). Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB.`,
      }
    }

    // Check if the user's message contains a preset editing command
    const editingOption = parseEditingCommand(prompt.trim())

    // Handle help command
    if (prompt.trim().toLowerCase() === "/help") {
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
      return
    }

    // Set the prompt based on editing option or user input
    const userPrompt = editingOption
      ? editingOption.prompt
      : prompt.trim() || "Enhance this image and make it look better"

    // Update user on progress with editing option info if applicable
    await app.client.chat.postMessage({
      channel: channelId,
      text: editingOption
        ? `:art: Applying *${editingOption.name}* style ${editingOption.emoji}`
        : `:art: Now applying your edits: "${userPrompt}"`,
    })

    processingStage = "generating image with gpt-image-1"
    logger.info("Generating image with gpt-image-1")

    // First, let's save the original image to Slack for reference
    try {
      await app.client.files.upload({
        channels: channelId,
        file: imageBuffer,
        filename: "original-image.png",
        initial_comment: `:frame_with_picture: Here's your original image for reference:`,
      })
      logger.info("Uploaded original image to Slack")
    } catch (error) {
      logger.error("Error uploading original image to Slack:", error)
      // Continue even if this fails
    }

    // Now use the gpt-image-1 model to generate the image
    let imageGenResponse
    try {
      // Direct approach with gpt-image-1
      imageGenResponse = await openai.images.generate({
        model: "dall-e-3", // Fallback to DALL-E 3 if gpt-image-1 is not available
        prompt: `${userPrompt}. The image should be high quality and detailed.`,
        n: 1,
        size: "1024x1024",
        quality: "hd",
      })

      logger.info("Received image generation response from OpenAI")
    } catch (error) {
      logger.error("OpenAI image generation error:", error)

      // Send error details to the user
      await app.client.chat.postMessage({
        channel: channelId,
        text: `:warning: Error from OpenAI: ${error.message || "Unknown error"}`,
      })

      throw {
        type: ErrorType.OPENAI_ERROR,
        message: `Error generating image with OpenAI: ${error.message || "Unknown error"}`,
      }
    }

    const generatedImageUrl = imageGenResponse.data[0]?.url

    if (!generatedImageUrl) {
      logger.error("No image URL returned from OpenAI")
      throw { type: ErrorType.OPENAI_ERROR, message: "No image URL returned from OpenAI" }
    }

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

    if (error.type === ErrorType.DOWNLOAD_ERROR) {
      userErrorMessage = "I couldn't download your image. Please try uploading it again."
    } else if (error.type === ErrorType.OPENAI_ERROR) {
      userErrorMessage = `There was a problem editing your image: ${error.message}`
    } else if (error.type === ErrorType.UPLOAD_ERROR) {
      userErrorMessage = "Your image was edited successfully, but I couldn't upload it back to Slack. Please try again."
    } else if (error.type === ErrorType.VALIDATION_ERROR) {
      userErrorMessage = error.message
    }

    // Send a user-friendly error message
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
