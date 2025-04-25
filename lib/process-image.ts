import { OpenAI } from "openai"
import axios from "axios"
// Import the editing options utilities at the top of the file
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

// Supported image formats
const SUPPORTED_FORMATS = ["image/png", "image/jpeg", "image/jpg", "image/webp"]

export async function processImageRequest({ imageUrl, prompt, userId, channelId, app }: ProcessImageRequestParams) {
  // Track the processing stage for better error messages
  let processingStage = "starting"

  try {
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
      console.error("Error downloading image from Slack:", error)
      throw { type: ErrorType.DOWNLOAD_ERROR, message: "Failed to download the image from Slack" }
    }

    const imageBuffer = Buffer.from(imageResponse.data)

    // Validate image size
    if (imageBuffer.length > MAX_FILE_SIZE) {
      throw {
        type: ErrorType.VALIDATION_ERROR,
        message: `Image is too large (${(imageBuffer.length / (1024 * 1024)).toFixed(2)}MB). Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB.`,
      }
    }

    // Validate image format based on magic numbers
    const isPNG =
      imageBuffer.length > 8 &&
      imageBuffer[0] === 0x89 &&
      imageBuffer[1] === 0x50 &&
      imageBuffer[2] === 0x4e &&
      imageBuffer[3] === 0x47

    const isJPEG = imageBuffer.length > 2 && imageBuffer[0] === 0xff && imageBuffer[1] === 0xd8

    if (!isPNG && !isJPEG) {
      throw {
        type: ErrorType.VALIDATION_ERROR,
        message: "Unsupported image format. Please upload a PNG or JPEG image.",
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

    processingStage = "processing with OpenAI"
    // Send to OpenAI for image generation with error handling
    let response
    try {
      response = await openai.images.edit({
        image: new File([imageBuffer], "image.png", { type: "image/png" }),
        prompt: userPrompt,
        n: 1,
        size: "1024x1024",
      })
    } catch (error) {
      console.error("OpenAI API error:", error)

      // Handle specific OpenAI errors
      if (error.response) {
        const statusCode = error.response.status
        if (statusCode === 429) {
          throw { type: ErrorType.OPENAI_ERROR, message: "Rate limit exceeded. Please try again later." }
        } else if (statusCode === 400) {
          throw {
            type: ErrorType.OPENAI_ERROR,
            message: "The image or prompt couldn't be processed. Please try a different image or prompt.",
          }
        } else if (statusCode === 401) {
          throw { type: ErrorType.OPENAI_ERROR, message: "API authentication error. Please contact the administrator." }
        }
      }

      throw { type: ErrorType.OPENAI_ERROR, message: "Error processing image with OpenAI" }
    }

    const generatedImageUrl = response.data[0]?.url

    if (!generatedImageUrl) {
      throw { type: ErrorType.OPENAI_ERROR, message: "No image URL returned from OpenAI" }
    }

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
    } catch (error) {
      console.error("Error downloading generated image:", error)
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
    } catch (error) {
      console.error("Error uploading to Slack:", error)
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
  } catch (error) {
    console.error(`Error during ${processingStage}:`, error)

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
