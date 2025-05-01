import 'dotenv/config';
import pkg from '@slack/bolt';
const { App, LogLevel, AwsLambdaReceiver } = pkg;
import { processImageRequest, processImageGenerationRequest } from './lib/process-image.js';
import { logger } from './lib/logger.js';

const awsLambdaReceiver = new AwsLambdaReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  processBeforeResponse: false,
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

const processedEventIds = new Set();

// Helper functions for reusable UI blocks
function buildSizeSelectionBlock(initialValue = 'square') {
  return {
    type: 'section',
    block_id: 'select_image_size_block',
    text: {
      type: 'mrkdwn',
      text: '*Select image size:*',
    },
    accessory: {
      type: 'radio_buttons',
      action_id: 'select_image_size',
      options: [
        {
          text: {
            type: 'plain_text',
            text: 'Square',
            emoji: true,
          },
          value: 'square',
        },
        {
          text: {
            type: 'plain_text',
            text: 'Landscape',
            emoji: true,
          },
          value: 'landscape',
        },
        {
          text: {
            type: 'plain_text',
            text: 'Portrait',
            emoji: true,
          },
          value: 'portrait',
        },
      ],
      initial_option: {
        text: {
          type: 'plain_text',
          text: initialValue.charAt(0).toUpperCase() + initialValue.slice(1),
          emoji: true,
        },
        value: initialValue,
      },
    },
  };
}

function buildGenerateButtonBlock() {
  return {
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: 'Generate',
          emoji: true,
        },
        action_id: 'generate_image',
      },
    ],
  };
}

function buildConfirmationMessageBlocks(initialSize = 'square', introText = 'Choose a size, then generate your image.') {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: introText,
      },
    },
    buildSizeSelectionBlock(initialSize),
    buildGenerateButtonBlock(),
  ];
}

app.event('message', async ({ event, client, logger }) => {
  try {
    if (event.channel_type !== 'im') {
      return;
    }
    if (event.bot_id || event.subtype === 'bot_message') {
      return;
    }
    if (!event.user) {
      return;
    }
    if (processedEventIds.has(event.event_ts)) {
      logger.info(`Skipping already processed event with ts=${event.event_ts}`);
      return;
    }
    processedEventIds.add(event.event_ts);

    const messageEvent = event;

    logger.info(`Message: ${JSON.stringify(messageEvent, null, 2)}`);

    // Helper function to disable confirmation messages
    async function disableConfirmationMessages(selectedSizeText) {
      const historyResponse = await client.conversations.history({
        channel: messageEvent.channel,
        limit: 50,
      });
      if (historyResponse.ok) {
        // Find the most recent confirmation message
        const confirmationMessages = historyResponse.messages.filter(
          (msg) =>
            msg.bot_id &&
            msg.blocks &&
            msg.blocks.some(
              (block) => block.block_id === 'select_image_size_block'
            )
        );

        if (confirmationMessages.length > 0) {
          const msg = confirmationMessages[0]; // most recent message (messages are in descending order)
          // Check if message already has no actions with generate_image
          const hasGenerateAction = msg.blocks.some(
            (block) =>
              block.type === 'actions' &&
              block.elements.some((el) => el.action_id === 'generate_image')
          );
          if (!hasGenerateAction) {
            // Already disabled, skip updating
            return;
          }
          const updatedBlocks = msg.blocks.map((block) => {
            if (block.block_id === 'select_image_size_block') {
              return {
                type: 'section',
                block_id: 'select_image_size_block',
                text: {
                  type: 'mrkdwn',
                  text: selectedSizeText,
                },
              };
            }
            if (
              block.type === 'actions' &&
              block.elements.some(
                (el) => el.action_id === 'generate_image'
              )
            ) {
              return {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: '_Generate button disabled_',
                },
              };
            }
            return block;
          });
          try {
            await client.chat.update({
              channel: messageEvent.channel,
              ts: msg.ts,
              blocks: updatedBlocks,
              text: msg.text || 'Image size selection disabled',
            });
          } catch (updateError) {
            logger.error('Failed to update message to disable radios:', updateError);
          }
        }
      }
    }

    // Refactored conditional for Images
    if (messageEvent.files && messageEvent.files.length > 0) {
      logger.info(`Processing message with ${messageEvent.files.length} files`);

      try {
         // Disable previous confirmation messages with generic text
        await disableConfirmationMessages('_Image size selection closed_');

        // Send confirmation message with size selection and generate button
        await app.client.chat.postMessage({
          channel: messageEvent.channel,
          text: 'Choose a size, then generate your image.',
          blocks: buildConfirmationMessageBlocks(),
        });
      } catch (error) {
        logger.error('Error sending confirmation message with button:', error);
      }

    // Refactored conditional for text prompts
    } else if (messageEvent.text && messageEvent.text.trim().length > 0) {
      logger.info('Received message with text but no files; sending confirmation message with generate button.');
      try {
        // Disable previous confirmation messages with generic text
        await disableConfirmationMessages('_Image size selection closed_');

        await app.client.chat.postMessage({
          channel: messageEvent.channel,
          text: 'Choose a size, then generate your image.',
          blocks: buildConfirmationMessageBlocks(),
        });
      } catch (error) {
        logger.error('Error sending confirmation message with button:', error);
      }
    } else {
      if (messageEvent.user) {
        await notifyUserAboutMissingImage(
          messageEvent.channel,
          messageEvent.user
        );
      }
    }
  } catch (error) {
    logger.error('Error handling message event:', error);
    await notifyErrorToUser(
      event.channel,
      'Sorry, something went wrong processing your request.'
    );
  }
});

app.action('select_image_size', async ({ ack }) => {
  await ack();
});

app.action('generate_image', async ({ body, ack, client, logger }) => {
  logger.debug('Received generate_image action');
  await ack();
  try {
    const userId = body.user.id;
    const channelId = body.channel.id;

    // Determine selected size from state
    let selectedSize = 'square'; // default
    if (body.state && body.state.values && body.state.values['select_image_size_block'] && body.state.values['select_image_size_block'].select_image_size) {
      selectedSize = body.state.values['select_image_size_block'].select_image_size.selected_option.value;
    }

    // Map size to resolution
    const sizeMap = {
      square: '1024x1024',
      landscape: '1536x1024',
      portrait: '1024x1536',
    };
    const size = sizeMap[selectedSize] || '1024x1024';

    // Fetch conversation history to get last message from user
    const historyResponse = await client.conversations.history({
      channel: channelId,
      limit: 50,
    });

    if (!historyResponse.ok) {
      logger.error('Failed to fetch conversation history:', historyResponse.error);
      await client.chat.postMessage({
        channel: channelId,
        text: ':warning: Could not retrieve conversation history to generate image.',
      });
      return;
    }

    // Find last confirmation message to disable
    const confirmationMessages = historyResponse.messages.filter(
      (msg) =>
        msg.bot_id &&
        msg.blocks &&
        msg.blocks.some((block) => block.block_id === 'select_image_size_block')
    );

    // Disable only the most recent confirmation message
    if (confirmationMessages.length > 0) {
      const msg = confirmationMessages[0]; // most recent message (messages are in descending order)
      // Check if message already has no actions with generate_image
      const hasGenerateAction = msg.blocks.some(
        (block) =>
          block.type === 'actions' &&
          block.elements.some((el) => el.action_id === 'generate_image')
      );
      if (!hasGenerateAction) {
        // Already disabled, skip updating
        return;
      }
      const updatedBlocks = msg.blocks.map((block) => {
        if (block.block_id === 'select_image_size_block') {
          return {
            type: 'section',
            block_id: 'select_image_size_block',
            text: {
              type: 'mrkdwn',
              text: `_${selectedSize.charAt(0).toUpperCase() + selectedSize.slice(1)} was selected._`,
            },
          };
        }
        if (
          block.type === 'actions' &&
          block.elements.some((el) => el.action_id === 'generate_image')
        ) {
          return {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '_Generate button disabled_',
            },
          };
        }
        return block;
      });
      try {
        await client.chat.update({
          channel: channelId,
          ts: msg.ts,
          blocks: updatedBlocks,
          text: msg.text || 'Image size selection disabled',
        });
      } catch (updateError) {
        logger.error('Failed to update message to disable radios:', updateError);
      }
    }


    // Find last message from the user
    const userMessages = historyResponse.messages
      .filter((msg) => msg.user === userId && msg.text && msg.text.trim().length > 0)
      .sort((a, b) => parseFloat(b.ts) - parseFloat(a.ts));
    logger.debug('Filtered userMessages:', userMessages.map(m => ({ ts: m.ts, text: m.text })));

    // Pick the most recent user message (with or without files)
    const latestUserMessage = historyResponse.messages
      .filter((msg) => msg.user === userId && (msg.text || (msg.files && msg.files.length > 0)))
      .sort((a, b) => parseFloat(b.ts) - parseFloat(a.ts))[0];

    if (!latestUserMessage) {
      await client.chat.postMessage({
        channel: channelId,
        text: ':warning: Cannot generate image because no recent user message was found.',
      });
      return;
    }

    if (latestUserMessage.files && latestUserMessage.files.length > 0) {
      // Image editing flow
      const imageUrls = latestUserMessage.files.map((file) => file.url_private);
      // Remove URLs from the prompt text before sending to OpenAI
      let prompt = latestUserMessage.text || '';
      // Remove URLs including those enclosed in angle brackets
      prompt = prompt.replace(/<?https?:\/\/\S+>?/g, '').trim();

      await processImageRequest({
        imageUrls,
        prompt,
        userId,
        channelId,
        app,
        size,
      });
    } else {
      // Prompt generation flow
      // Remove URLs from the prompt text before sending to OpenAI
      let prompt = latestUserMessage.text;
      // Remove URLs including those enclosed in angle brackets
      prompt = prompt.replace(/<?https?:\/\/\S+>?/g, '').trim();

      await processImageGenerationRequest({
        prompt,
        userId,
        channelId,
        app,
        size,
      });
    }
  } catch (error) {
    logger.error('Error handling generate_image action:', error);
  }
});

export const handler = async (event, context, callback) => {
  const lambdaHandler = await awsLambdaReceiver.start();
  return lambdaHandler(event, context, callback);
};
