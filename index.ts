import { stepCountIs, streamText } from "ai";
import { google } from "@ai-sdk/google";
import { SYSTEM_PROMPT, INITIAL_REVIEW_PROMPT } from './prompts';
import { getFileChangesInDirectoryTool, generateCommitMessageTool, writeReviewToMarkdownTool } from "./tools";

const codeReviewAgent = async (prompt: string) => {
  const result = streamText({
    model: google("models/gemini-2.5-flash"),
    prompt,
    system: SYSTEM_PROMPT,
    tools: {
      getFileChangesInDirectoryTool: getFileChangesInDirectoryTool,
      generateCommitMessageTool: generateCommitMessageTool,
      writeReviewToMarkdownTool: writeReviewToMarkdownTool,
    },
    stopWhen: stepCountIs(10),
  });

  for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
  }
};


const cliPrompt = process.argv[2];
const finalPrompt = cliPrompt || INITIAL_REVIEW_PROMPT;

await codeReviewAgent(finalPrompt);
