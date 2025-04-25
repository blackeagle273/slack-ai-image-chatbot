import { OpenAI } from "openai"
import axios from "axios"

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

export async function processImageRequest({ imageUrl, prompt, userId, channelId, app }: ProcessImageRequestParams) {
  try {
    // Inform user that processing has started
    await app.client.chat.postMessage({
      channel: channelId,
      text: "I'm processing your image. This may take a moment...",
    })

    // Download the image from Slack
    const imageResponse = await axios.get(imageUrl, {
      headers: {
        Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
      },
      responseType: "arraybuffer",
    })

    const imageBuffer = Buffer.from(imageResponse.data)
    const base64Image = imageBuffer.toString("base64")

    // Default prompt if none provided
    const userPrompt = prompt.trim() || "Enhance this image and make it look better"

    // Send to OpenAI for image generation
    const response = await openai.images.edit({
      image: new File([imageBuffer], "image.png", { type: "image/png" }),
      prompt: userPrompt,
      n: 1,
      size: "1024x1024",
    })

    const generatedImageUrl = response.data[0]?.url

    if (!generatedImageUrl) {
      throw new Error("No image URL returned from OpenAI")
    }

    // Download the generated image
    const generatedImageResponse = await axios.get(generatedImageUrl, {
      responseType: "arraybuffer",
    })

    // Upload the image to Slack
    const uploadResponse = await app.client.files.upload({
      channels: channelId,
      file: generatedImageResponse.data,
      filename: "edited-image.png",
      initial_comment: `Here's your edited image based on: "${userPrompt}"`,
    })

    if (!uploadResponse.ok) {
      throw new Error(`Failed to upload image to Slack: ${uploadResponse.error}`)
    }
  } catch (error) {
    console.error("Error processing image:", error)

    // Inform user of the error
    await app.client.chat.postMessage({
      channel: channelId,
      text: `Sorry, I encountered an error while processing your image: ${error.message}`,
    })
  }
}
