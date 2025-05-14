import 'dotenv/config';
import OpenAI, { toFile } from 'openai';
import axios from 'axios';
import { logger } from './logger.js';
import { notifyErrorToUser } from './notify-user.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function postInitialMessage(app, channelId, text, blocks) {
  const message = await app.client.chat.postMessage({
    channel: channelId,
    text,
    blocks,
  });
  logger.debug(`Posted initial message at ts=${message.ts}`);
  return message.ts;
}

async function downloadAndResizeImages(imageUrls) {
  const slackToken = process.env.SLACK_BOT_TOKEN;
  if (!slackToken) throw new Error('Missing SLACK_BOT_TOKEN for image download');

  const sharp = await import('sharp');
  const imageFiles = [];

  for (let i = 0; i < imageUrls.length; i++) {
    const imageUrl = imageUrls[i];
    logger.debug(`Downloading input image ${i + 1}...`);
    const inputImageResponse = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      headers: { Authorization: `Bearer ${slackToken}` },
    });
    const inputImageBuffer = Buffer.from(inputImageResponse.data);

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
  return imageFiles;
}

async function handleOpenAIImageResponse({
  openaiCall,
  prompt,
  app,
  channelId,
}) {
  let imageGenResponse;
  try {
    imageGenResponse = await openaiCall();
  } catch (error) {
    logger.error('Error during image generation with OpenAI:', error);
    throw error;
  }

  if (!imageGenResponse?.data) {
    throw new Error('Issue returning image from OpenAI');
  }

  const image_base64 = imageGenResponse.data[0].b64_json;
  const base64String = image_base64.replace(/^data:image\/\w+;base64,/, '');
  const imageBuffer = Buffer.from(base64String, 'base64');

  logger.debug(`Uploading generated to Slack...`);
  await app.client.files.uploadV2({
    channel_id: channelId,
    file: imageBuffer,
    filename: 'gpt-generated-image.png',
    initial_comment: `✨ Here's your edited image based on: "${prompt}"`,
  });

  logger.info('Image processing and messaging complete.');
}

export async function processImageRequest({
  imageUrls,
  prompt,
  userId,
  channelId,
  app,
  size = '1024x1024',
  isFirstImageMask = false,
}) {
  logger.debug('processImageRequest called');

  try {
    logger.info(
      `Processing image request for user ${userId} with prompt: ${prompt}`
    );

    // Validate image file types before processing
    const allowedExtensions = ['png', 'webp', 'jpg', 'jpeg'];
    const invalidFiles = imageUrls.filter((url) => {
      const match = url.match(/\.([a-zA-Z0-9]+)(\?.*)?$/);
      if (!match) return true; // no extension found, treat as invalid
      const ext = match[1].toLowerCase();
      return !allowedExtensions.includes(ext);
    });

    if (invalidFiles.length > 0) {
      const errorMessage =
        'One or more files are incompatible. Please provide images in png, webp, or jpg format and try again.';
      logger.error(errorMessage, invalidFiles);
      throw new Error(errorMessage);
    }

    await postInitialMessage(
      app,
      channelId,
      ':hourglass: Processing your image request...',
      [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `:hourglass: *Processing your image(s)*\n\nPrompt: "${
              prompt || 'Enhance these images and make them look better'
            }"\n\nComplex prompts may take up to 2 minutes to process...`,
          },
        },
      ]
    );

    let maskFile = null;
    let imagesToEdit = imageUrls;

    // Download and resize all images first
    const allImageFiles = await downloadAndResizeImages(imageUrls);

    if (isFirstImageMask === 'true' && imageUrls.length > 1) {
      maskFile = allImageFiles.shift(); // pull the first image off as mask
      imagesToEdit = allImageFiles;
    } else {
      imagesToEdit = allImageFiles;
    }

    const imageFiles = imagesToEdit;

    logger.debug('Sending images to OpenAI for editing...');

    await handleOpenAIImageResponse({
      openaiCall: () => {
        const params = {
          model: 'gpt-image-1',
          prompt: prompt,
          image: imageFiles,
          moderation: 'low',
          size: size,
        };
        if (maskFile) {
          params.mask = maskFile;
        }
        return openai.images.edit(params);
      },
      prompt,
      size,
      app,
      channelId,
    });
  } catch (error) {
    logger.error('Error in processImageRequest:', error);
    await notifyErrorToUser(
      app,
      channelId,
      'Sorry, something went wrong processing your request.'
    );
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

  try {
    logger.info(
      `Processing image generation request for user ${userId} with prompt: ${prompt}`
    );

    await postInitialMessage(
      app,
      channelId,
      ':hourglass: Generating your image...',
      [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `:hourglass: *Generating your image*\n\nPrompt: "${prompt}"\n\nComplex prompts may take up to 2 minutes to process...`,
          },
        },
      ]
    );

    logger.debug(`Sending ${prompt} to OpenAI...`);
    await handleOpenAIImageResponse({
      openaiCall: async () =>
        openai.images.generate({
          model: 'gpt-image-1',
          prompt: prompt,
          size: size,
          moderation: 'low',
        }),
      prompt,
      size,
      app,
      channelId,
    });
  } catch (error) {
    logger.error('Error in processImageGenerationRequest:', error);
    // Notify user of error
    await notifyErrorToUser(
      app,
      channelId,
      'Sorry, something went wrong processing your request.'
    );
  }
}