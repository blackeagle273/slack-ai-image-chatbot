import 'dotenv/config';
import slack from "@slack/bolt";
const { App, LogLevel } = slack;
import { processImageRequest } from "./lib/process-image.js";
import { generateHelpText } from "./lib/editing-options.js";
import { logger } from "./lib/logger.js";

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
  logLevel: LogLevel.DEBUG,
});

async function handleHelpRequest(channelId) {
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

async function notifyUserAboutMissingImage(channelId, userId) {
  try {
    await app.client.chat.postMessage({
      channel: channelId,
      text: `<@${userId}> I need an image to work with! Please upload an image along with your instructions.`,
    });
  } catch (error) {
    logger.error("Error sending missing image notification:", error);
  }
}

async function notifyErrorToUser(channelId, message) {
  try {
    await app.client.chat.postMessage({
      channel: channelId,
      text: message,
    });
  } catch (error) {
    logger.error("Error sending error notification:", error);
  }
}

app.event("message", async ({ event, client, logger }) => {
  try {
    if (event.channel_type !== "im") {
      return;
    }

    if (event.bot_id || event.subtype === "bot_message") {
      return;
    }

    const messageEvent = event;

    if (messageEvent.files && messageEvent.files.length > 0) {
      logger.info(`Processing message with ${messageEvent.files.length} files`);
      logger.info(`Files: ${JSON.stringify(messageEvent.files, null, 2)}`);

      processImageRequest({
        imageUrl: messageEvent.files[0].url_private,
        prompt: messageEvent.text || "",
        userId: messageEvent.user,
        channelId: messageEvent.channel,
        app,
      });
    } else if (messageEvent.text && messageEvent.text.trim() === "/help") {
      await handleHelpRequest(messageEvent.channel);
    } else {
      await notifyUserAboutMissingImage(messageEvent.channel, messageEvent.user);
    }
  } catch (error) {
    logger.error("Error handling message event:", error);
    await notifyErrorToUser(event.channel, "Sorry, something went wrong processing your request.");
  }
});

(async () => {
  await app.start();
  logger.info("⚡️ Slack Bolt app is running!");
})();

// Start a dummy HTTP server to satisfy App Runner's TCP health check
const http = require('http');

const port = process.env.PORT || 8080;
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Slack bot is running\n');
}).listen(port, () => {
  console.log(`Dummy HTTP server is listening on port ${port}`);
});