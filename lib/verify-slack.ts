import crypto from "crypto"

export async function verifySlackRequest(request: Request, rawBody: string): Promise<boolean> {
  try {
    const slackSignature = request.headers.get("x-slack-signature")
    const timestamp = request.headers.get("x-slack-request-timestamp")

    if (!slackSignature || !timestamp) {
      return false
    }

    // Check if the request is older than 5 minutes
    const currentTime = Math.floor(Date.now() / 1000)
    if (Math.abs(currentTime - Number.parseInt(timestamp)) > 300) {
      return false
    }

    const signingSecret = process.env.SLACK_SIGNING_SECRET
    if (!signingSecret) {
      console.error("SLACK_SIGNING_SECRET is not set")
      return false
    }

    const baseString = `v0:${timestamp}:${rawBody}`
    const hmac = crypto.createHmac("sha256", signingSecret)
    const mySignature = `v0=${hmac.update(baseString).digest("hex")}`

    return crypto.timingSafeEqual(Buffer.from(mySignature), Buffer.from(slackSignature))
  } catch (error) {
    console.error("Error verifying Slack request:", error)
    return false
  }
}
