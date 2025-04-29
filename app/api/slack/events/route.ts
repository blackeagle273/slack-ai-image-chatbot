import { App, LogLevel } from "@slack/bolt";
import { processImageRequest } from "@/lib/process-image";
import { generateHelpText } from "@/lib/editing-options";
import { logger } from "@/lib/logger";


const app = new App({
  token: process.env.SLACK_BOT_TOKEN!,
  appToken: process.env.SLACK_APP_TOKEN!,
  socketMode: true,
  logLevel: LogLevel.DEBUG,
});

async function handleHelpRequest(channelId: string) {
  try {
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
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "To use these commands, upload an image along with the command.",
          },
        },
      ],
    });
  } catch (error) {
    logger.error("Error sending help information:", error);
  }
}

async function notifyUserAboutMissingImage(channelId: string, userId: string) {
  try {
    await app.client.chat.postMessage({
      channel: channelId,
      text: `<@${userId}> I need an image to work with! Please upload an image along with your instructions.`,
    });
  } catch (error) {
    logger.error("Error sending missing image notification:", error);
  }
}

async function notifyErrorToUser(channelId: string, message: string) {
  try {
    await app.client.chat.postMessage({
      channel: channelId,
      text: message,
    });
  } catch (error) {
    logger.error("Error sending error notification:", error);
  }
}

app.event('message', async ({ event, client, logger }) => {
  try {
    // Only handle messages in direct messages (im)
    if (event.channel_type !== "im") {
      return;
    }

    // Skip bot messages
    if ((event as any).bot_id || (event as any).subtype === "bot_message") {
      return;
    }

    const messageEvent = event as any;

    if (messageEvent.files && messageEvent.files.length > 0) {
      logger.info(`Processing message with ${messageEvent.files.length} files`);
      logger.info(`Files: ${JSON.stringify(messageEvent.files, null, 2)}`);

      processImageRequest({
        imageUrl: messageEvent.files[0].url_private,
        prompt: messageEvent.text || "",
        userId: messageEvent.user,
        channelId: messageEvent.channel,
        app,
      }).catch(async (error) => {
        logger.error("Error in async event processing:", error);
        await notifyErrorToUser(
          messageEvent.channel,
          "There was an error processing your request. Please try again later."
        );
      });
    } else if (messageEvent.text && messageEvent.text.trim().toLowerCase() === "/help") {
      logger.info("Processing help request");
      await handleHelpRequest(messageEvent.channel);
    } else {
      logger.info("Notifying user about missing image");
      await notifyUserAboutMissingImage(messageEvent.channel, messageEvent.user);
    }
  } catch (error) {
    logger.error("Error handling message event:", error);
  }
});

(async () => {
  try {
    await app.start();
    logger.info("⚡️ Slack SocketModeApp is running!");
  } catch (error) {
    logger.error("Failed to start Slack SocketModeApp:", error);
  }
})();

export { app };