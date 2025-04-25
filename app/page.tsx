import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Slack Image Editor Bot</CardTitle>
          <CardDescription>A Slackbot that uses OpenAI to edit and enhance images</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="mb-4">
            This application provides a Slackbot that can edit images using OpenAI's image generation capabilities.
          </p>
          <h3 className="font-semibold mb-2">How to use:</h3>
          <ol className="list-decimal pl-5 space-y-2">
            <li>Send a direct message to the bot with an image attached</li>
            <li>Include a description of the changes you want to make</li>
            <li>The bot will process your image and send back the edited version</li>
          </ol>
        </CardContent>
      </Card>
    </main>
  )
}
