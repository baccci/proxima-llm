export const CAPABILITY_SLICES: Record<string, string> = {
  attachments: `## Attachments
You can attach images and PDFs to a message so the model can look at them.

- Click the paperclip in the message box to add files.
- Images can be PNG, JPEG, WebP, or GIF. PDFs are supported too.
- You can attach more than one file at a time.
- The paperclip is only available when the selected model can read images or PDFs — otherwise it's greyed out.`,

  thinking: `## Thinking
Some models can "think" — work through a problem step by step before giving their final answer.

- Turn it on with the brain icon in the message box. The setting is remembered per chat.
- When it's on, the model shows its reasoning in a collapsible block above the answer.
- The brain icon only appears for models that support thinking.`,

  'focus-mode': `## Focus mode
A distraction-free, fullscreen reading view for going through a conversation one exchange at a time.

- Enter it with the expand icon at the top right of a chat.
- It shows one question-and-answer pair at a time. Use the ← / → arrow keys to move between them, and Esc to leave.
- The text size adapts to the length of the answer, and very long answers flow into two columns.
- You can show or hide the original question.`,

  projects: `## Projects
Projects group related chats together under a shared context.

- Create a project from the sidebar.
- A project can have its own instructions and a notes area that apply to every chat inside it.
- Chats can live inside a project or stand on their own.`,

  memory: `## Memory
The model can save and recall notes across conversations using memory slices — titled entries that persist between chats.

- The model reads a slice on demand with \`read_memory\` (only when relevant — it won't load them all at once).
- It can save new notes or update existing ones with \`write_memory\`, and remove outdated ones with \`delete_memory\`.
- Memory is split into two scopes: **Global** (across all chats) and **Project** (tied to the current project).
- You can view, add, edit, and delete slices in the Memories card in a project view, or in the Memory tab in Settings.`,

  'web-search': `## Web search
Lets the model look things up on the internet while it answers, for questions that need up-to-date information.

- Toggle it with the globe icon in the message box.

Note: this is still being built and isn't fully available yet.`,
};
