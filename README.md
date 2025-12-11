# Automaker

Automaker is an autonomous AI development studio that helps you build software faster using AI-powered agents. It provides a visual Kanban board interface to manage features, automatically assigns AI agents to implement them, and tracks progress through an intuitive workflow from backlog to verified completion.

---

> **[!CAUTION]**
>
> ## Security Disclaimer
>
> **This software uses AI-powered tooling that has access to your operating system and can read, modify, and delete files. Use at your own risk.**
>
> We have reviewed this codebase for security vulnerabilities, but you assume all risk when running this software. You should review the code yourself before running it.
>
> **We do not recommend running Automaker directly on your local computer** due to the risk of AI agents having access to your entire file system. Please sandbox this application using Docker or a virtual machine.
>
> **[Read the full disclaimer](../DISCLAIMER.md)**

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated

### Quick Start

```bash
# 1. Clone the repo
git clone git@github.com:AutoMaker-Org/automaker.git
cd automaker

# 2. Install dependencies
npm install

# 3. Get your Claude Code OAuth token
claude setup-token
# ⚠️ This prints your token - don't share your screen!

# 4. Set the token and run
export CLAUDE_CODE_OAUTH_TOKEN="sk-ant-oat01-..."
npm run dev:electron
```

### Authentication Options

Automaker supports multiple authentication methods (in order of priority):

| Method | Environment Variable | Description |
|--------|---------------------|-------------|
| OAuth Token (env) | `CLAUDE_CODE_OAUTH_TOKEN` | From `claude setup-token` - uses your Claude subscription |
| OAuth Token (stored) | — | Stored in app credentials file |
| API Key (stored) | — | Anthropic API key stored in app |
| API Key (env) | `ANTHROPIC_API_KEY` | Pay-per-use API key |

**Recommended:** Use `CLAUDE_CODE_OAUTH_TOKEN` if you have a Claude subscription.

### Persistent Setup (Optional)

Add to your `~/.bashrc` or `~/.zshrc`:

```bash
export CLAUDE_CODE_OAUTH_TOKEN="YOUR_TOKEN_HERE"
```

Then restart your terminal or run `source ~/.bashrc`.

## Features

- 📋 **Kanban Board** - Visual drag-and-drop board to manage features through backlog, in progress, waiting approval, and verified stages
- 🤖 **AI Agent Integration** - Automatic AI agent assignment to implement features when moved to "In Progress"
- 🧠 **Multi-Model Support** - Choose from multiple AI models including Claude Opus, Sonnet, and more
- 💭 **Extended Thinking** - Enable extended thinking modes for complex problem-solving
- 📡 **Real-time Agent Output** - View live agent output, logs, and file diffs as features are being implemented
- 🔍 **Project Analysis** - AI-powered project structure analysis to understand your codebase
- 📁 **Context Management** - Add context files to help AI agents understand your project better
- 💡 **Feature Suggestions** - AI-generated feature suggestions based on your project
- 🖼️ **Image Support** - Attach images and screenshots to feature descriptions
- ⚡ **Concurrent Processing** - Configure concurrency to process multiple features simultaneously
- 🧪 **Test Integration** - Automatic test running and verification for implemented features
- 🔀 **Git Integration** - View git diffs and track changes made by AI agents
- 👤 **AI Profiles** - Create and manage different AI agent profiles for various tasks
- 💬 **Chat History** - Keep track of conversations and interactions with AI agents
- ⌨️ **Keyboard Shortcuts** - Efficient navigation and actions via keyboard shortcuts
- 🎨 **Dark/Light Theme** - Beautiful UI with theme support
- 🖥️ **Cross-Platform** - Desktop application built with Electron for Windows, macOS, and Linux

## Tech Stack

- [Next.js](https://nextjs.org) - React framework
- [Electron](https://www.electronjs.org/) - Desktop application framework
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [Zustand](https://zustand-demo.pmnd.rs/) - State management
- [dnd-kit](https://dndkit.com/) - Drag and drop functionality

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

## License

See [LICENSE](../LICENSE) for details.
