import { FastMCP } from "fastmcp";
import { z } from "zod";

// サーバーのインスタンスを作成
const server = new FastMCP({
  name: "My Server",
  version: "1.0.0",
});

server.addTool({
  name: "add",
  description: "2つの数を足す",
  parameters: z.object({
    a: z.number(),
    b: z.number(),
  }),
  // 実際の処理を行う関数
  execute: async (args) => {
    return String(args.a + args.b);
  },
});

server.addTool({
  name: "subtract",
  description: "2つの数を引く",
  parameters: z.object({
    a: z.number(),
    b: z.number(),
  }),
  // 実際の処理を行う関数
  execute: async (args) => {
    return String(args.a - args.b);
  },
});

// サーバーを起動
server.start({
  transportType: "stdio",
});
