import { notifyErrorToUser } from "./notify-user";

export default function registerSlackActions(app, {
  processImageRequest,
  processImageGenerationRequest,
}) {
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
      if (
        body.state &&
        body.state.values &&
        body.state.values['select_image_size_block'] &&
        body.state.values['select_image_size_block'].select_image_size
      ) {
        selectedSize =
          body.state.values['select_image_size_block'].select_image_size
            .selected_option.value;
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
      await notifyErrorToUser(
        app,
        channelId,
        'Sorry, something went wrong processing your request.'
      );
    }
  });
}