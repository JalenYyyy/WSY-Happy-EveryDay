import { exec } from "child_process";
import { readFile, writeFile } from "fs/promises";
import path from "path";
import { promisify } from "util";
import { AsyncLocalStorage } from "async_hooks";
import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  Packer,
  AlignmentType,
} from "docx";
import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { tavily } from "@tavily/core";
import { saveGeneratedFile } from "./file-store";

const execAsync = promisify(exec);

/** Project root — tools are sandboxed to this directory */
const WORKSPACE = process.cwd();

/** AsyncLocalStorage for per-request session context (avoids module-level races) */
export const asyncSession = new AsyncLocalStorage<{ sessionId: string; userId: string }>();

function isSubPath(parent: string, child: string) {
  const relative = path.relative(parent, child);
  return !!relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}


export const readFileTool: AgentTool = {
  name: "read_file",
  label: "Read File",
  description: "Read the contents of a file. Path is relative to the project root.",
  parameters: Type.Object({
    path: Type.String({ description: "File path relative to project root" }),
  }),
  execute: async (_id, params) => {
    const p = params as { path: string };
    const safePath = path.resolve(WORKSPACE, p.path);
    if (!isSubPath(WORKSPACE, safePath)) {
      return {
        content: [{ type: "text", text: `Error: path not allowed: ${p.path}` }],
        details: { path: p.path },
      };
    }
    const content = await readFile(safePath, "utf-8");
    return {
      content: [{ type: "text", text: content }],
      details: { path: p.path, size: content.length },
    };
  },
};

export const writeFileTool: AgentTool = {
  name: "write_file",
  label: "Write File",
  description: "Write or overwrite a file. Path is relative to the project root.",
  parameters: Type.Object({
    path: Type.String({ description: "File path relative to project root" }),
    content: Type.String({ description: "Content to write" }),
  }),
  execute: async (_id, params) => {
    const p = params as { path: string; content: string };
    const safePath = path.resolve(WORKSPACE, p.path);
    if (!isSubPath(WORKSPACE, safePath)) {
      return {
        content: [{ type: "text", text: `Error: path not allowed: ${p.path}` }],
        details: { path: p.path },
      };
    }
    await writeFile(safePath, p.content, "utf-8");
    return {
      content: [{ type: "text", text: `Written: ${p.path}` }],
      details: { path: p.path },
    };
  },
};

export const bashTool: AgentTool = {
  name: "bash",
  label: "Run Command",
  description: "Execute a shell command in the project directory. Uses cmd.exe on Windows.",
  parameters: Type.Object({
    command: Type.String({ description: "Shell command to execute" }),
  }),
  execute: async (_id, params, signal) => {
    const p = params as { command: string };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const opts: any = { cwd: WORKSPACE, timeout: 30_000, shell: true };
    if (signal) opts.signal = signal;
    const { stdout, stderr } = await execAsync(p.command, opts);
    const output = [stdout, stderr].filter(Boolean).join("\n");
    return {
      content: [{ type: "text", text: output || "(no output)" }],
      details: { command: p.command },
    };
  },
};

export const agentTools = [readFileTool, writeFileTool, bashTool];

// ---------------------------------------------------------------------------
// Web Search (Tavily)
// ---------------------------------------------------------------------------

export const webSearchTool: AgentTool = {
  name: "web_search",
  label: "Web Search",
  description:
    "Search the web for up-to-date information. Returns titles, URLs, and snippets for the top results.",
  parameters: Type.Object({
    query: Type.String({ description: "The search query" }),
    maxResults: Type.Optional(
      Type.Number({ description: "Maximum number of results (default 5, max 10)" }),
    ),
  }),
  execute: async (_id, params) => {
    const p = params as { query: string; maxResults?: number };
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      return {
        content: [{ type: "text", text: "Error: TAVILY_API_KEY is not configured." }],
        details: { query: p.query },
      };
    }

    const client = tavily({ apiKey });
    const results = await client.search(p.query, {
      maxResults: Math.min(p.maxResults ?? 5, 10),
      includeAnswer: true,
    });

    const lines: string[] = [];
    if (results.answer) {
      lines.push(`**Summary:** ${results.answer}`, "");
    }
    results.results.forEach((r, i) => {
      lines.push(`[${i + 1}] ${r.title}`);
      lines.push(`URL: ${r.url}`);
      lines.push(r.content.slice(0, 400));
      lines.push("");
    });

    return {
      content: [{ type: "text", text: lines.join("\n") }],
      details: { query: p.query, count: results.results.length },
    };
  },
};

// ---------------------------------------------------------------------------
// Fetch URL
// ---------------------------------------------------------------------------

export const fetchUrlTool: AgentTool = {
  name: "fetch_url",
  label: "Fetch URL",
  description:
    "Fetch a webpage and return its plain-text content. Useful for reading documentation, articles, or any URL.",
  parameters: Type.Object({
    url: Type.String({ description: "The URL to fetch" }),
    maxChars: Type.Optional(
      Type.Number({ description: "Maximum characters to return (default 4000)" }),
    ),
  }),
  execute: async (_id, params, signal) => {
    const p = params as { url: string; maxChars?: number };
    const maxChars = p.maxChars ?? 4000;

    // Basic SSRF protections
    try {
      const u = new URL(p.url);
      if (!["http:", "https:"].includes(u.protocol)) {
        return { content: [{ type: "text", text: `Error: unsupported protocol ${u.protocol}` }], details: { url: p.url } };
      }

      const hostname = u.hostname.toLowerCase();
      if (hostname === "localhost" || hostname.endsWith(".local")) {
        return { content: [{ type: "text", text: `Error: hostname not allowed` }], details: { url: p.url } };
      }

      const ipv4 = /^\d+\.\d+\.\d+\.\d+$/.test(hostname);
      const ipv6 = hostname.includes(":") && !hostname.includes("[");

      function isPrivateIPv4(ip: string) {
        const parts = ip.split(".").map((s) => parseInt(s, 10));
        if (parts[0] === 10) return true;
        if (parts[0] === 127) return true;
        if (parts[0] === 169 && parts[1] === 254) return true;
        if (parts[0] === 192 && parts[1] === 168) return true;
        if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
        if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
        return false;
      }

      function isPrivateIPv6(ip: string) {
        const low = ip.toLowerCase();
        if (low === "::1") return true;
        if (low.startsWith("fc") || low.startsWith("fd")) return true; // unique local
        if (low.startsWith("fe80")) return true; // link-local
        return false;
      }

      if (ipv4 && isPrivateIPv4(hostname)) {
        return { content: [{ type: "text", text: `Error: fetching private IP is disallowed` }], details: { url: p.url } };
      }
      if (ipv6 && isPrivateIPv6(hostname)) {
        return { content: [{ type: "text", text: `Error: fetching private IP is disallowed` }], details: { url: p.url } };
      }

    } catch (err) {
      return { content: [{ type: "text", text: `Error: invalid URL` }], details: { url: p.url } };
    }

    const res = await fetch(p.url, {
      signal: signal ?? AbortSignal.timeout(15_000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; PiAgent/1.0)" },
    });

    if (!res.ok) {
      return {
        content: [{ type: "text", text: `HTTP ${res.status} ${res.statusText}` }],
        details: { url: p.url, status: res.status },
      };
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text")) {
      return {
        content: [{ type: "text", text: `Cannot read binary content (${contentType})` }],
        details: { url: p.url, contentType },
      };
    }

    const html = await res.text();
    // Strip tags, collapse whitespace, trim
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/\s{2,}/g, " ")
      .trim()
      .slice(0, maxChars);

    return {
      content: [{ type: "text", text: text }],
      details: { url: p.url, chars: text.length },
    };
  },
};

// ---------------------------------------------------------------------------
// Document Generation
// ---------------------------------------------------------------------------

/**
 * Parse a markdown-ish text into docx Paragraph array.
 * Supports # headings, ** bold **, plain paragraphs, and blank-line separation.
 */
function markdownToParagraphs(content: string): Paragraph[] {
  const lines = content.split("\n");
  const paragraphs: Paragraph[] = [];

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.startsWith("### ")) {
      paragraphs.push(new Paragraph({ text: line.slice(4), heading: HeadingLevel.HEADING_3 }));
    } else if (line.startsWith("## ")) {
      paragraphs.push(new Paragraph({ text: line.slice(3), heading: HeadingLevel.HEADING_2 }));
    } else if (line.startsWith("# ")) {
      paragraphs.push(new Paragraph({ text: line.slice(2), heading: HeadingLevel.HEADING_1 }));
    } else if (line.trim() === "") {
      paragraphs.push(new Paragraph({ text: "" }));
    } else {
      // Handle inline **bold** markers
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      const runs: TextRun[] = parts.map((part) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return new TextRun({ text: part.slice(2, -2), bold: true });
        }
        return new TextRun({ text: part });
      });
      paragraphs.push(new Paragraph({ children: runs, alignment: AlignmentType.LEFT }));
    }
  }

  return paragraphs;
}

/**
 * Context variable injected per-request so tools know which session they belong to.
 * Set before agent.prompt() is called.
 */
export const generateWordDocTool: AgentTool = {
  name: "generate_word_doc",
  label: "生成 Word 文档",
  description:
    "Generate a Word (.docx) document from the provided markdown/plain-text content and return a download URL for the user. " +
    "Use # for h1, ## for h2, ### for h3, **text** for bold. " +
    "The returned URL can be shared with the user so they can download the file.",
  parameters: Type.Object({
    filename: Type.String({ description: "Output file name, e.g. 'report.docx' (must end in .docx)" }),
    title: Type.String({ description: "Document title shown in the document header" }),
    content: Type.String({ description: "Markdown / plain-text content for the document body" }),
  }),
  execute: async (_id, params) => {
    const p = params as { filename: string; title: string; content: string };
    const context = asyncSession.getStore();
    if (!context) {
      return { content: [{ type: "text", text: "Error: no active session context." }], details: {} };
    }

    // Ensure filename ends with .docx
    const filename = p.filename.endsWith(".docx") ? p.filename : `${p.filename}.docx`;

    const doc = new Document({
      sections: [
        {
          properties: {},
          children: [
            new Paragraph({ text: p.title, heading: HeadingLevel.TITLE }),
            new Paragraph({ text: "" }),
            ...markdownToParagraphs(p.content),
          ],
        },
      ],
    });

    const buffer = Buffer.from(await Packer.toBuffer(doc));
    const file = await saveGeneratedFile(context.sessionId, context.userId, filename, buffer);

    return {
      content: [
        {
          type: "text",
          text:
            `Word document created successfully!\n` +
            `File: ${filename}\n` +
            `Download URL: ${file.downloadPath}\n\n` +
            `Tell the user they can download the document at: ${file.downloadPath}`,
        },
      ],
      details: { filename, size: buffer.length, downloadPath: file.downloadPath },
    };
  },
};

export const generateTextFileTool: AgentTool = {
  name: "generate_text_file",
  label: "生成文本文件",
  description:
    "Generate a plain text or markdown file and return a download URL. " +
    "Use for .txt, .md, .csv, .json output files.",
  parameters: Type.Object({
    filename: Type.String({ description: "Output file name including extension, e.g. 'data.csv'" }),
    content: Type.String({ description: "Text content to write into the file" }),
  }),
  execute: async (_id, params) => {
    const p = params as { filename: string; content: string };
    const context = asyncSession.getStore();
    if (!context) {
      return { content: [{ type: "text", text: "Error: no active session context." }], details: {} };
    }

    const buffer = Buffer.from(p.content, "utf-8");
    const file = await saveGeneratedFile(context.sessionId, context.userId, p.filename, buffer);

    return {
      content: [
        {
          type: "text",
          text:
            `File created: ${p.filename}\n` +
            `Download URL: ${file.downloadPath}\n\n` +
            `Tell the user they can download the file at: ${file.downloadPath}`,
        },
      ],
      details: { filename: p.filename, size: buffer.length, downloadPath: file.downloadPath },
    };
  },
};

export const webAgentTools = [
  readFileTool,
  writeFileTool,
  bashTool,
  webSearchTool,
  fetchUrlTool,
  generateWordDocTool,
  generateTextFileTool,
];
