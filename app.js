import 'dotenv/config';
import pkg from '@slack/bolt';
const { App, LogLevel, AwsLambdaReceiver } = pkg;
import { processImageRequest } from './lib/process-image.js';
import { logger } from './lib/logger.js';

const awsLambdaReceiver = new AwsLambdaReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver: awsLambdaReceiver,
  logLevel: LogLevel.DEBUG,
});

async function notifyUserAboutMissingImage(channelId, userId) {
  try {
    await app.client.chat.postMessage({
      channel: channelId,
      text: `<@${userId}> I need an image to work with! Please upload an image along with your instructions.`,
    });
  } catch (error) {
    logger.error('Error sending missing image notification:', error);
  }
}

async function notifyErrorToUser(channelId, message) {
  try {
    await app.client.chat.postMessage({
      channel: channelId,
      text: message,
    });
  } catch (error) {
    logger.error('Error sending error notification:', error);
  }
}

app.event('message', async ({ event, client, logger }) => {
  try {
    if (event.channel_type !== 'im') {
      return;
    }

    if (event.bot_id || event.subtype === 'bot_message') {
      return;
    }

    const messageEvent = event;

    if (messageEvent.files && messageEvent.files.length > 0) {
      logger.info(`Processing message with ${messageEvent.files.length} files`);
      logger.info(`Files: ${JSON.stringify(messageEvent.files, null, 2)}`);

      const maxImages = 10;
      const imagesToProcess = messageEvent.files.slice(0, maxImages);
      const imageUrls = imagesToProcess.map((file) => file.url_private);
      processImageRequest({
        imageUrls,
        prompt: messageEvent.text || '',
        userId: messageEvent.user,
        channelId: messageEvent.channel,
        app,
      });
    } else {
      await notifyUserAboutMissingImage(
        messageEvent.channel,
        messageEvent.user
      );
    }
  } catch (error) {
    logger.error('Error handling message event:', error);
    await notifyErrorToUser(
      event.channel,
      'Sorry, something went wrong processing your request.'
    );
  }
});

export const handler = async (event, context, callback) => {
  const lambdaHandler = await awsLambdaReceiver.start();
  return lambdaHandler(event, context, callback);
};
