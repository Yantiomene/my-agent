# my-agent: Code Review AI Agent

This project implements an AI-powered code review agent designed to provide constructive and actionable feedback on code changes. Leveraging advanced AI capabilities, the agent automates parts of the code review process, ensuring code quality, maintainability, and adherence to best practices.

## Technical Stack

- **Runtime**: [Bun](https://bun.com) (v1.2.22) - A fast all-in-one JavaScript runtime.
- **AI Framework**: `@ai-sdk/google` - Used for interacting with Google's AI models.
- **AI Model**: `gemini-2.5-flash` - The primary AI model powering the code review logic.
- **Version Control Integration**: `simple-git` - For programmatic interaction with Git repositories, enabling analysis of code changes.
- **Language**: TypeScript - Provides type safety and enhances developer experience.

## Available Tools

The code review agent is equipped with the following tools to assist in its tasks:

- `getFileChangesInDirectoryTool`: This tool allows the agent to retrieve a summary of code changes within a specified directory. It uses Git to identify added, modified, and deleted files, excluding those listed in the `.gitignore`.
- `generateCommitMessageTool`: This tool helps in generating concise and informative commit messages based on the detected code changes. It analyzes the nature of the modifications to suggest a relevant commit message.
- `writeReviewToMarkdownTool`: This tool enables the agent to output its comprehensive code review findings into a Markdown file, facilitating documentation and record-keeping of the review process.

## Installation

To install dependencies:

```bash
bun install
```

### Usage

To run the code review agent, use the following command:

```bash
bun run index.ts [your-custom-prompt]
```

-   **`[your-custom-prompt]`**: (Optional) Provide a custom prompt for the AI agent. If no custom prompt is provided, the agent will use a default initial review prompt defined in `prompts.ts`.

This project was created using `bun init` in bun v1.2.22. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
