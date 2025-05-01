import 'dotenv/config';
import OpenAI, { toFile } from 'openai';
import axios from 'axios';
import fs from 'fs';
import { logger } from './logger.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function processImageRequest({
  imageUrls,
  prompt,
  userId,
  channelId,
  app,
  size = '1024x1024',
}) {
  logger.debug('processImageRequest called');
  let initialMessageTs;

  try {
    logger.info(
      `Processing image request for user ${userId} with prompt: ${prompt}`
    );

    // Step 1: Post initial "Processing..." message
    const initMessage = await app.client.chat.postMessage({
      channel: channelId,
      text: ':hourglass: Processing your image request...',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `:hourglass: *Processing your image(s)*\n\nPrompt: "${
              prompt || 'Enhance these images and make them look better'
            }"\n\nComplex prompts may take up to 2 minutes to process...`,
          },
        },
      ],
    });

    initialMessageTs = initMessage.ts;
    logger.debug(`Posted initial message at ts=${initialMessageTs}`);

    const slackToken = process.env.SLACK_BOT_TOKEN;
    if (!slackToken)
      throw new Error('Missing SLACK_BOT_TOKEN for image download');

    // Download all images and convert to toFile objects
    const imageFiles = [];
    for (let i = 0; i < imageUrls.length; i++) {
      const imageUrl = imageUrls[i];
      logger.debug(`Downloading input image ${i + 1}...`);
      const inputImageResponse = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        headers: { Authorization: `Bearer ${slackToken}` },
      });
      const inputImageBuffer = Buffer.from(inputImageResponse.data);

      // Resize image if larger than 2000px in width or height
      const sharp = await import('sharp');
      let resizedBuffer = inputImageBuffer;
      try {
        const image = sharp.default(inputImageBuffer);
        const metadata = await image.metadata();
        if (metadata.width > 2000 || metadata.height > 2000) {
          const scaleFactor = 2000 / Math.max(metadata.width, metadata.height);
          const newWidth = Math.round(metadata.width * scaleFactor);
          const newHeight = Math.round(metadata.height * scaleFactor);
          resizedBuffer = await image.resize(newWidth, newHeight).toBuffer();
          logger.debug(`Resized image ${i + 1} to ${newWidth}x${newHeight}`);
        }
      } catch (resizeError) {
        logger.error(`Error resizing image ${i + 1}:`, resizeError);
      }

      const imageFile = await toFile(resizedBuffer, null, {
        type: 'image/png',
      });
      imageFiles.push(imageFile);
    }

    logger.debug('Sending images to OpenAI for editing...');
    (async () => {
      let imageGenResponse;
      try {
        imageGenResponse = await openai.images.edit({
          model: 'gpt-image-1',
          prompt: prompt,
          image: imageFiles,
          moderation: 'low',
          size: size,
        });
      } catch (error) {
        logger.error('Error during image generation with OpenAI:', error);
        // Bubble up error message to outer catch block
        throw new Error(error.message);
      }

      if (!imageGenResponse?.data) {
        throw new Error('Issue returning image from OpenAI');
      }

      const image_base64 = imageGenResponse.data[0].b64_json;
      const base64String = image_base64.replace(/^data:image\/\w+;base64,/, '');
      const outputFilename = `edited-image-1.png`;
      fs.writeFileSync(outputFilename, base64String, 'base64', (error) => {
        logger.error('Error writing base64 string to file:', error);
      });

      logger.debug(`Uploading generated to Slack...`);
      await app.client.files.uploadV2({
        channel_id: channelId,
        file: fs.createReadStream(`./${outputFilename}`),
        filename: outputFilename,
        initial_comment: `✨ Here's your edited image based on: "${prompt}"`,
      });

      logger.info('Image processing and messaging complete.');
    })();
  } catch (error) {
    logger.error('Error in processImageRequest:', error);
  }
}
export async function processImageGenerationRequest({
  prompt,
  userId,
  channelId,
  app,
  size = '1024x1024',
}) {
  logger.debug('processImageGenerationRequest called');
  let initialMessageTs;

  try {
    logger.info(
      `Processing image generation request for user ${userId} with prompt: ${prompt}`
    );

    // Step 1: Post initial "Processing..." message
    const initMessage = await app.client.chat.postMessage({
      channel: channelId,
      text: ':hourglass: Generating your image...',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `:hourglass: *Generating your image*\n\nPrompt: "${prompt}"\n\nComplex prompts may take up to 2 minutes to process...`,
          },
        },
      ],
    });

    initialMessageTs = initMessage.ts;
    logger.debug(`Posted initial message at ts=${initialMessageTs}`);

    // Call OpenAI images.generate with the prompt
    (async () => {
      let imageGenResponse;
      try {
        logger.debug(`Sending ${prompt} to OpenAI...`);
        imageGenResponse = await openai.images.generate({
          model: 'gpt-image-1',
          prompt: prompt,
          size: size,
          moderation: 'low',
        });
      } catch (error) {
        logger.error('Error during image generation with OpenAI:', error);
        throw error;
      }

      logger.info('Open AI Complete: ' . imageGenResponse);
      if (!imageGenResponse?.data) {
        throw new Error('Issue returning image from OpenAI');
      }

      logger.info('Image generation successful!');
      const image_base64 = imageGenResponse.data[0].b64_json;
      const base64String = image_base64.replace(/^data:image\/\w+;base64,/, '');
      const outputFilename = `edited-image-1.png`;
      fs.writeFileSync(outputFilename, base64String, 'base64', (error) => {
        logger.error('Error writing base64 string to file:', error);
      });

      logger.debug(`Uploading generated to Slack...`);
      await app.client.files.uploadV2({
        channel_id: channelId,
        file: fs.createReadStream(`./${outputFilename}`),
        filename: outputFilename,
        initial_comment: `✨ Here's your edited image based on: "${prompt}"`,
      });

      logger.info('Image generation and messaging complete.');
    })();
  } catch (error) {
    logger.error('Error in processImageGenerationRequest:', error);
    // Notify user of error
    try {
      await app.client.chat.postMessage({
        channel: channelId,
        text: `:warning: Sorry, there was an error generating your image: ${error.message}`,
      });
    } catch (notifyError) {
      logger.error(
        'Failed to notify user about image generation error:',
        notifyError
      );
    }
  }
}