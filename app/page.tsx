import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { EDITING_OPTIONS } from "@/lib/editing-options"

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <Card className="w-full max-w-3xl">
        <CardHeader>
          <CardTitle>Slack Image Editor Bot</CardTitle>
          <CardDescription>A Slackbot that uses OpenAI to edit and enhance images</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-2">How to use:</h3>
              <ol className="list-decimal pl-5 space-y-2">
                <li>Send a direct message to the bot with an image attached</li>
                <li>Include a description of the changes you want to make OR use a preset command</li>
                <li>The bot will process your image and send back the edited version</li>
              </ol>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-2">Preset Editing Options:</h3>
              <p className="mb-4">Use these commands with your image uploads for quick editing:</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {EDITING_OPTIONS.map((option) => (
                  <div key={option.id} className="border rounded-md p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl">{option.emoji}</span>
                      <h4 className="font-medium">{option.name}</h4>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{option.description}</p>
                    <code className="mt-2 text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">/{option.id}</code>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-md">
              <p className="text-sm">
                Type <code>/help</code> in a direct message to the bot to see all available commands.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
