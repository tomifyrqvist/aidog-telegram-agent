import { DurableObject, DurableObjectState, DurableObjectNamespace, Request } from '@cloudflare/workers-types'

interface Env {
  SHARED_SECRET: string;
  // Define the binding for the DurableObject
  MCP_SERVER: DurableObjectNamespace;
}

interface MCPRequest {
  jsonrpc: string;
  id: number;
  method: string;
  params?: {
    tool?: string;
    params?: any;
  };
}

interface MCPResponse {
  jsonrpc: string;
  id: number;
  result?: any;
  error?: {
    code: number;
    message: string;
  };
}

export class MCPServer implements DurableObject {
  constructor(private state: DurableObjectState, private env: Env) {}

  /**
   * Initialize the MCP server and return capabilities
   */
  async initialize() {
    return {
      capabilities: {
        tools: [
          {
            name: "telegram_bot",
            description: "A Telegram bot that can interact with users and provide AI-powered responses",
            parameters: {
              type: "object",
              properties: {
                message: {
                  type: "string",
                  description: "The message to send to the Telegram bot"
                }
              },
              required: ["message"]
            }
          }
        ]
      }
    }
  }

  /**
   * Handle Telegram bot messages
   */
  async telegram_bot(params: { message: string }) {
    // Here you would implement the actual Telegram bot logic
    return {
      response: `Received message: ${params.message}`
    }
  }

  /**
   * Handle incoming requests
   */
  async fetch(request: Request): Promise<Response> {
    // Verify authentication
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response('Unauthorized', { status: 401, webSocket: null })
    }

    const token = authHeader.split(' ')[1]
    if (token !== this.env.SHARED_SECRET) {
      return new Response('Unauthorized', { status: 401, webSocket: null })
    }

    // Handle MCP protocol
    if (request.method === 'POST') {
      try {
        const body = await request.json() as MCPRequest
        
        // Handle initialization request
        if (body.method === 'initialize') {
          const response = await this.initialize()
          return new Response(JSON.stringify({
            jsonrpc: '2.0',
            id: body.id,
            result: response
          } as MCPResponse), {
            headers: { 'Content-Type': 'application/json' },
            webSocket: null
          })
        }

        // Handle tool invocation
        if (body.method === '$/invoke') {
          const { tool, params } = body.params || {}
          if (tool === 'telegram_bot') {
            const result = await this.telegram_bot(params)
            return new Response(JSON.stringify({
              jsonrpc: '2.0',
              id: body.id,
              result
            } as MCPResponse), {
              headers: { 'Content-Type': 'application/json' },
              webSocket: null
            })
          }
        }
      } catch (error) {
        const requestBody = await request.json() as MCPRequest
        return new Response(JSON.stringify({
          jsonrpc: '2.0',
          id: requestBody?.id,
          error: {
            code: -32603,
            message: 'Internal error'
          }
        } as MCPResponse), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
          webSocket: null
        })
      }
    }

    // Handle SSE connection for notifications
    if (request.headers.get('Accept') === 'text/event-stream') {
      const { readable, writable } = new TransformStream<Uint8Array>()
      const writer = writable.getWriter()
      
      // Send capabilities notification
      const encoder = new TextEncoder()
      writer.write(encoder.encode('data: ' + JSON.stringify({
        jsonrpc: '2.0',
        method: 'workspace/didChangeCapabilities',
        params: {
          capabilities: (await this.initialize()).capabilities
        }
      }) + '\n\n'))

      return new Response(readable, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        },
        webSocket: null
      })
    }

    return new Response('Not Found', { status: 404, webSocket: null })
  }
}

// Export the DurableObject
export { MCPServer as DurableObject }

// Create the Worker that handles requests
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // For local development, handle requests directly
    if (env.MCP_SERVER === undefined) {
      const server = new MCPServer(null as any, env);
      return server.fetch(request);
    }

    // In production, use Durable Object
    const id = env.MCP_SERVER.idFromName('default')
    const stub = env.MCP_SERVER.get(id)
    
    // Forward the request to the DurableObject
    return stub.fetch(request)
  }
}
