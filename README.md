# Slack Image Editor Bot

A Slackbot that allows users to upload images via DM and uses OpenAI's image generation capabilities to modify them.

## Features

- Receive images via direct messages in Slack
- Process images using OpenAI's image generation API
- Send modified images back to the user

## Setup

### Prerequisites

- Node.js 18 or later
- A Slack workspace where you can create apps
- An OpenAI API key

### Environment Variables

Create a `.env.local` file with the following variables:

\`\`\`
OPENAI_API_KEY=your_openai_api_key
SLACK_BOT_TOKEN=your_slack_bot_token
SLACK_SIGNING_SECRET=your_slack_signing_secret
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
