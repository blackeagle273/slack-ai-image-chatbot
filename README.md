# Slack AI Image Chatbot

This project is a Slack chatbot that uses AI to generate images based on user prompts. The bot is built using the Slack Bolt framework and deployed using Serverless Framework.

## Prerequisites

Before you begin, ensure you have met the following requirements:

1. **Node.js**: Version 22 or higher
2. **npm**: Version 10 or higher (comes with Node.js 22)
3. **Serverless Framework**: Install globally using npm
   ```bash
   npm install -g serverless
   ```
4. **ngrok**: Install using Homebrew
   ```bash
   brew install ngrok
   ```

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/athletics/slack-ai-image-chatbot
   cd slack-ai-image-chatbot
   ```

2. Install project dependencies:
   ```bash
   npm install
   ```

3. Copy the example environment file and fill in your credentials:
   ```bash
   cp .env.example .env
   ```

## Running Locally

To run the application locally, follow these steps:

1. Start ngrok to expose your local server to the internet:
   ```bash
   ngrok http 3000
   ```
   This will provide you with a public URL that you can use to configure your Slack app.

2. Start the Serverless Offline service:
   ```bash
   serverless offline --noPrependStageInUrl
   ```
   This will start a local version of your AWS Lambda functions and API Gateway endpoints.

3. If you haven't created your app yet, skip to that section now. If you have, you'll need to update your Slack App configuration:
   - Once ngrok is running, you'll see a forwarding URL in the format `https://xxxx-xx-xx-xx-xx.ngrok.io`.
   - Update your Slack App's interactivity request URL to point to this ngrok URL with the path `/slack/events`.
   - Update your Slack App's event subscription URL to point to this ngrok URL with the path `/slack/events`.

4. Access your application:
   - The bot will be running locally on port 3000.
   - You can interact with it through your configured Slack workspace.

## Slack App Configuration

1. Create a new Slack app on the [Slack Developer Console](https://api.slack.com/apps).

2. Choose the "From Scratch" option, then name your app and pick your workspace.

3. Grab the Signing Secret on now for the `SLACK_SIGNING_SECRET` environment variable.

4. Scroll down and add **Display Information** for your app so your team knows what it's for.

5. Go to **OAuth & Permissions** then scroll down to add the following to **Bot Token Scopes**:
```
app_mentions:read
chat:write
files:read
files:write
im:write
```
6. In **OAuth Tokens** on that same page, click on **Install to Workspace** and authorize the app. This gives you the `SLACK_BOT_TOKEN` environment variable.

7. Go to **Event Subscriptions** then scroll down to add the following to **Subscribe to Bot Events**:
```
message.im
```

8. Using the URL created by ngrok, add it at the top of the page in Request URL with the appended `/slack/events`. After it verifies, save the changes.

9. With that same URL, go to **Interactivity & Shortcuts** and it there.

10. Go to **App Home** and make sure you check the box under **Messages Tab** that reads "Allow users to send Slash commands and messages from the messages tab"

11. Optionally, you can toggle the "Always Show My Bot as Online" here as well.

12. Go to **Install App** and click the "Reinstall to {Workspace Name}" button and authorize the app again.

13. Switch to the Slack application and scroll to the Apps in the message bar. Click "+ Add apps" and search for the app you just created and install it into your workspace.

14. If everything worked as planned, you should be able to message the App an image prompt and it will respond with a size selection and a button to Generate.

## Key Files Deployed to Lambda

When deploying to AWS Lambda, the following key files and directories are included in the deployment package:

    .
    ├── app.js                # The main application file that contains the Lambda handler function.
    ├── lib/                  # The directory containing all the application logic and utilities
    |   ├── logger.js         # Logging functionality
    |   ├── process-image.js  # Image processing logic
    |   └── slack-actions.js  # Slack bot interactivity action logic


These files are automatically included in the deployment package by the Serverless Framework.

## Environment Variables

The application requires several environment variables to function properly. These should be set in your `.env` file:

1. `LOG_LEVEL`: Set to "DEBUG" for detailed logging.
2. `OPENAI_API_KEY`: Your OpenAI API key for image generation.
3. `SLACK_BOT_TOKEN`: Your Slack bot token for authentication.
4. `SLACK_SIGNING_SECRET`: Your Slack signing secret for request verification.

You can find these values in your Slack App configuration and OpenAI account.

## Deployment

Deployment to AWS is handled automatically through GitHub Actions. The workflow is defined in `.github/workflows/lambda-deploy.yml` and will be triggered when you push changes to the main branch. No manual deployment steps are required.

## Notes

- The Slack Socket Mode app uses WebSocket connection for event handling.
- Ensure all environment variables are securely managed.
- For local development, you'll need to use ngrok to expose your local server to the internet.
- The application is designed to work with AWS Lambda and API Gateway, but can be run locally for development and testing purposes.
