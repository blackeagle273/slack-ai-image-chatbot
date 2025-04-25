# Slack Image Editor Bot

A Slackbot that allows users to upload images via DM and uses OpenAI's DALL-E 3 model to generate modified versions based on text prompts.

## Features

- Receive images via direct messages in Slack
- Process images using OpenAI's DALL-E 3 model
- Send modified images back to the user
- Robust error handling and user feedback
- Image validation for size and format
- Detailed processing status updates
- Preset editing styles with simple commands

## Setup

### Prerequisites

- Node.js 18 or later
- A Slack workspace where you can create apps
- An OpenAI API key with access to DALL-E 3

### Environment Variables

Create a `.env.local` file with the following variables:

\`\`\`
OPENAI_API_KEY=your_openai_api_key
SLACK_BOT_TOKEN=your_slack_bot_token
SLACK_SIGNING_SECRET=your_slack_signing_secret
LOG_LEVEL=INFO  # Optional: DEBUG, INFO, WARN, or ERROR (default: INFO)
\`\`\`

### Slack App Configuration

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click "Create New App" and choose "From scratch"
3. Give your app a name and select your workspace
4. Under "OAuth & Permissions", add the following bot token scopes:
   - `app_mentions:read`
   - `chat:write`
   - `files:read`
   - `files:write`
   - `im:history`
   - `im:write`
5. Install the app to your workspace
6. Copy the Bot User OAuth Token and Signing Secret for your environment variables
7. Under "Event Subscriptions", enable events and set the Request URL to your deployed app's URL + `/api/slack/events`
8. Subscribe to the following bot events:
   - `message.im`
   - `file_shared`

### Development

\`\`\`bash
# Install dependencies
npm install

# Run the development server
npm run dev
\`\`\`

### Deployment

Deploy to Vercel:

\`\`\`bash
vercel
\`\`\`

Make sure to set your environment variables in the Vercel dashboard.

## Usage

1. Send a direct message to the bot with an image attached
2. Include a description of the changes you want to make
3. The bot will process your image and send back the edited version

## Preset Editing Options

The bot supports several preset editing styles that can be applied by using commands:

- `/enhance` - ✨ Improve image quality and details
- `/cartoon` - 🎨 Convert to cartoon style
- `/watercolor` - 🖌️ Convert to watercolor painting
- `/vintage` - 📷 Apply vintage/retro filter
- `/neon` - 💫 Add neon glow effects
- `/minimalist` - ⚪ Simplify to minimal style
- `/portrait` - 👤 Enhance portrait photo
- `/landscape` - 🏞️ Enhance landscape photo

To use a preset, simply upload an image and type the command (e.g., `/enhance`) in your message.

Type `/help` to see a list of all available commands.

## How It Works

1. User uploads an image to the bot via DM
2. The bot downloads the image and validates it
3. The bot uses OpenAI's DALL-E 3 model to generate a new image based on the user's prompt
4. The bot uploads both the original and modified images back to the Slack conversation

## Troubleshooting

If you encounter issues:

1. Check the logs in your Vercel deployment
2. Ensure your OpenAI API key has access to DALL-E 3
3. Verify that your Slack bot has the necessary permissions
4. Make sure your images are in a supported format (JPEG or PNG) and under 10MB

## Error Handling

The bot includes comprehensive error handling for various scenarios:

- Image validation (size and format)
- Network errors during image download/upload
- OpenAI API errors
- Slack API errors

Users receive friendly, informative error messages with suggestions on how to resolve issues.

## Logging

The application uses a structured logging system with configurable log levels:

- DEBUG: Detailed debugging information
- INFO: General operational information
- WARN: Warning conditions
- ERROR: Error conditions

Set the LOG_LEVEL environment variable to control logging verbosity.
