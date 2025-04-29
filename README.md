# Refactor for AWS App Runner Deployment - Next.js Removal

## Summary
This project has been refactored to remove Next.js and run as a standalone Node.js application suitable for AWS App Runner deployment.

## Changes Made
- Removed Next.js dependency and scripts from package.json.
- Added new scripts for development (`dev`), build (`build`), start (`start`), and linting.
- Created a new entry point `server.js` in the root directory to initialize and run the Slack Socket Mode app.
- Moved Slack bot logic from Next.js API routes to the standalone server.js.
- Updated imports to relative paths suitable for the new structure.
- Added TypeScript support and ESLint configuration for Node.js environment.

## Running the App
- Use `npm run dev` to run the app in development mode with ts-node.
- Use `npm run build` to compile TypeScript to JavaScript.
- Use `npm start` to run the compiled app.

## Deployment to AWS App Runner
- Build a Docker image with the app and push to a container registry.
- Configure AWS App Runner to deploy the container.
- Set environment variables (`SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `OPENAI_API_KEY`, etc.) in AWS App Runner.
- Ensure the container listens on the correct port (default 8080 or as configured).

## Notes
- The Slack Socket Mode app uses WebSocket connection for event handling.
- No HTTP API routes are used for Slack events.
- Ensure all environment variables are securely managed.

---

Please let me know if you need assistance with Dockerfile creation, AWS App Runner configuration, or further improvements.
