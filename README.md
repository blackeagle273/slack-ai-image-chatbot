# AI Image Slack Chatbot

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
   git clone https://github.com/your-username/ai-image-slack-chatbot.git
   cd ai-image-slack-chatbot
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

3. Update your Slack App configuration:
   - Once ngrok is running, you'll see a forwarding URL in the format `https://xxxx-xx-xx-xx-xx.ngrok.io`.
   - Update your Slack App's interactivity request URL to point to this ngrok URL with the path `/slack/events`.
   - Update your Slack App's event subscription URL to point to this ngrok URL with the path `/slack/events`.

4. Access your application:
   - The bot will be running locally on port 3000.
   - You can interact with it through your configured Slack workspace.

## Key Files Deployed to Lambda

When deploying to AWS Lambda, the following key files and directories are included in the deployment package:

1. `app.js`: The main application file that contains the Lambda handler function.
2. `lib/`: The directory containing all the application logic and utilities:
   - `lib/logger.js`: Logging functionality
   - `lib/process-image.js`: Image processing logic
   - `lib/slack-actions.js`: Slack bot interactivity action logic

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
