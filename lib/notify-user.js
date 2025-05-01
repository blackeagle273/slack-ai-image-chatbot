import { logger } from './logger.js';

export async function notifyErrorToUser(app, channelId, message) {
  try {
    await app.client.chat.postMessage({
      channel: channelId,
      text: message,
    });
  } catch (error) {
    logger.error('Error sending error notification:', error);
  }
}
