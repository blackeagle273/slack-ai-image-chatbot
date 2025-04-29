import { OpenAI } from "openai";
import axios from "axios";
import { App } from "@slack/bolt";
import { logger } from "@/lib/logger";
import { parseEditingCommand, generateHelpText } from "@/lib/editing-options";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface ProcessImageRequestParams {
  imageUrl: string;
  prompt: string;
  userId: string;
  channelId: string;
  app: App;
}

export async function processImageRequest({ imageUrl, prompt, userId, channelId, app }: ProcessImageRequestParams) {
  logger.debug("processImageRequest called");
  let initialMessageTs: string | undefined;

  try {
    logger.info(`Processing image request for user ${userId} with prompt: ${prompt}`);

    // Step 1: Post initial "Processing..." message
    const initMessage = await app.client.chat.postMessage({
      channel: channelId,
      text: ":hourglass: Processing your image request...",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `:hourglass: *Processing your image*\n\nPrompt: "${prompt || "Enhance this image"}"\n\nThis typically takes 15-30 seconds...`,
          },
        },
      ],
    });

    initialMessageTs = initMessage.ts;
    logger.debug(`Posted initial message at ts=${initialMessageTs}`);

    // Step 2: Parse editing command
    let editingOption;
    try {
      editingOption = parseEditingCommand(prompt.trim());
      logger.debug(`Parsed editing option: ${editingOption ? editingOption.name : "none"}`);
    } catch (err) {
      logger.warn("Failed to parse editing command", err);
    }

    const userPrompt = editingOption
      ? editingOption.prompt
      : prompt.trim() || "Enhance this image and make it look better";

    // Step 3: Download the original image
    logger.debug("Downloading input image...");
    const slackToken = process.env.SLACK_BOT_TOKEN;
    if (!slackToken) throw new Error("Missing SLACK_BOT_TOKEN for image download");

    const inputImageResponse = await axios.get(imageUrl, {
      responseType: "arraybuffer",
      headers: { Authorization: `Bearer ${slackToken}` },
    });

    const inputImageBuffer = Buffer.from(inputImageResponse.data);
    const inputFile = new File([inputImageBuffer], "input.png", { type: "image/png" });

    // Step 4: Generate the new image
    logger.debug("Sending image to OpenAI for editing...");
    const imageGenResponse = await openai.images.edit({
      model: "gpt-image-1",
      prompt: userPrompt,
      image: inputFile,
    });

    const generatedImageUrl = imageGenResponse?.data?.[0]?.url;
    if (!generatedImageUrl) throw new Error("No generated image URL returned from OpenAI");

    // Step 5: Download the generated image
    logger.debug("Downloading generated image...");
    const outputImageResponse = await axios.get(generatedImageUrl, { responseType: "arraybuffer" });
    const outputImageBuffer = Buffer.from(outputImageResponse.data);

    // Step 6: Upload the generated image to Slack
    logger.debug("Uploading generated image to Slack...");
    await app.client.files.upload({
      channels: channelId,
      file: outputImageBuffer,
      filename: "edited-image.png",
      initial_comment: `✨ Here's your edited image based on: "${userPrompt}"`,
    });

    // Step 7: Update the initial "Processing..." message to Success
    if (initialMessageTs) {
      await app.client.chat.update({
        channel: channelId,
        ts: initialMessageTs,
        text: ":white_check_mark: Image editing complete!",
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `:tada: *Image editing complete!*\n\nYour enhanced image is ready.`,
            },
          },
        ],
      });
    }

    logger.info("Image processing and messaging complete.");
  } catch (error) {
    logger.error("Error in processImageRequest:", error);

    if (initialMessageTs) {
      // Update initial message to show error
      await app.client.chat.update({
        channel: channelId,
        ts: initialMessageTs,
        text: ":x: Error processing your image",
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: ":warning: *Sorry!* Something went wrong while editing your image.",
            },
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: "Please try again later, or contact support if the issue persists.",
              },
            ],
          },
        ],
      });
    } else {
      logger.error("Could not update Slack message because no initial ts was recorded.");
    }
  }
}