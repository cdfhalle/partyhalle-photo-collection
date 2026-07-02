import { routeAgentRequest } from "agents";
import { GameRoom, type GameEnv } from "./GameRoom";

// The live-quiz game runs in its own small Worker (separate from the OpenNext
// Next.js Worker, which owns its generated entry). It hosts the GameRoom Durable
// Object and routes WebSocket/HTTP to /agents/game-room/{pin}. cors:true lets the
// Next app's origin connect cross-origin in dev / on workers.dev.
export { GameRoom };

const handler = {
  async fetch(request: Request, env: GameEnv): Promise<Response> {
    return (
      (await routeAgentRequest(request, env, { cors: true })) ??
      new Response("Not found", { status: 404 })
    );
  },
};

export default handler;
