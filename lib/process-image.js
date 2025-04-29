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
            }"\n\nThis typically takes 15-30 seconds per image...`,
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
      const imageFile = await toFile(inputImageBuffer, null, { type: 'image/png' });
      imageFiles.push(imageFile);
    }

    logger.debug('Sending images to OpenAI for editing...');
    let imageGenResponse;
    try {
      imageGenResponse = await openai.images.edit({
        model: 'gpt-image-1',
        prompt: prompt,
        image: imageFiles,
      });
    } catch (error) {
      logger.error('Error during image generation with OpenAI:', error);
      throw error;
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
  } catch (error) {
    logger.error('Error in processImageRequest:', error);
  }
}
