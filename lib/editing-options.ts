// Define preset editing options with their prompts and descriptions
export interface EditingOption {
  id: string
  name: string
  description: string
  prompt: string
  emoji: string
}

export const EDITING_OPTIONS: EditingOption[] = [
  {
    id: "enhance",
    name: "Enhance",
    description: "Improve image quality and details",
    prompt:
      "Enhance this image with better contrast, sharpness, and color balance. Make it look professional and high quality.",
    emoji: "✨",
  },
  {
    id: "cartoon",
    name: "Cartoon",
    description: "Convert to cartoon style",
    prompt: "Transform this image into a cartoon style with bold outlines, simplified features, and vibrant colors.",
    emoji: "🎨",
  },
  {
    id: "watercolor",
    name: "Watercolor",
    description: "Convert to watercolor painting",
    prompt:
      "Convert this image into a beautiful watercolor painting with soft edges, gentle color blending, and artistic brush strokes.",
    emoji: "🖌️",
  },
  {
    id: "vintage",
    name: "Vintage",
    description: "Apply vintage/retro filter",
    prompt:
      "Apply a vintage filter to this image with faded colors, slight grain, and warm tones to make it look like it was taken decades ago.",
    emoji: "📷",
  },
  {
    id: "neon",
    name: "Neon",
    description: "Add neon glow effects",
    prompt:
      "Add vibrant neon glow effects to this image with bright, glowing colors against a dark background for a cyberpunk aesthetic.",
    emoji: "💫",
  },
  {
    id: "minimalist",
    name: "Minimalist",
    description: "Simplify to minimal style",
    prompt:
      "Simplify this image into a clean, minimalist style with reduced details, limited color palette, and focus on essential elements.",
    emoji: "⚪",
  },
  {
    id: "portrait",
    name: "Portrait Enhance",
    description: "Enhance portrait photo",
    prompt:
      "Enhance this portrait photo with professional retouching. Improve skin tones, enhance eyes, and create a pleasing background blur.",
    emoji: "👤",
  },
  {
    id: "landscape",
    name: "Landscape Enhance",
    description: "Enhance landscape photo",
    prompt:
      "Enhance this landscape photo with vibrant colors, improved contrast, and dramatic lighting. Make the sky more impressive and the scenery more breathtaking.",
    emoji: "🏞️",
  },
]

// Function to get an editing option by ID
export function getEditingOptionById(id: string): EditingOption | undefined {
  return EDITING_OPTIONS.find((option) => option.id.toLowerCase() === id.toLowerCase())
}

// Function to parse text for editing commands
export function parseEditingCommand(text: string): EditingOption | null {
  // Check if text starts with a command marker
  if (!text.startsWith("/")) {
    return null
  }

  // Extract the command (remove the slash and get the first word)
  const command = text.substring(1).split(/\s+/)[0].toLowerCase()

  // Find the matching editing option
  return getEditingOptionById(command) || null
}

// Function to generate help text for available commands
export function generateHelpText(): string {
  const commandList = EDITING_OPTIONS.map((option) => `• */${option.id}* - ${option.emoji} ${option.description}`).join(
    "\n",
  )

  return `*Available Image Editing Commands*\n\n${commandList}\n\nTo use a command, upload an image and type \`/command\` in your message. For example, upload an image and type \`/enhance\`.`
}
