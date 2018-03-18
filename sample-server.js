
const Boom          = require("boom")
const HAPI          = require("hapi")
const HAPIWebSocket = require("./hapi-plugin-websocket")
const HAPIAuthBasic = require("hapi-auth-basic")

async function runServer() {
    const server = new HAPI.Server({ address: "127.0.0.1", port: 12345 });

    await server.register([
        HAPIWebSocket, 
        HAPIAuthBasic
    ]);

    server.auth.strategy('basic', 'basic', {
        validate: async (request, username, password, h) => {
            let isValid = false;
            let credentials = null;
            if (username === "foo" && password === "bar"){
                isValid = true;
                credentials = {id: username, name:username};
            }
            return {isValid, credentials};                
        }
    });

    /*  plain REST route  */
    server.route({
        method: "POST", path: "/foo",
        config: {
            payload: { output: "data", parse: true, allow: "application/json" }
        },
        handler: (request, h) => {
            return { at: "foo", seen: request.payload };
        }
    })

    /*  combined REST/WebSocket route  */
    server.route({
        method: "POST", path: "/bar",
        config: {
            payload: { output: "data", parse: true, allow: "application/json" },
            plugins: { websocket: true }
        },
        handler: (request, h) => {
            let { mode } = request.websocket()
            return { at: "bar", mode: mode, seen: request.payload };
        }
    })

    /*  exclusive WebSocket route  */
    server.route({
        method: "POST", path: "/baz",
        config: {
            plugins: { websocket: { only: true, autoping: 30 * 1000 } }
        },
        handler: (request, h) => {
            return { at: "baz", seen: request.payload };
        }
    })

    /*  full-featured exclusive WebSocket route  */
    server.route({
        method: "POST", path: "/quux",
        config: {
            response: {
              emptyStatusCode: 204
            },
            payload: { output: "data", parse: true, allow: "application/json" },
            auth: { mode: "required", strategy: "basic" },
            plugins: {
                websocket: {
                    only: true,
                    initially: true,
                    subprotocol: "quux/1.0",
                    connect: ({ ctx, ws }) => {
                        // NOTE: This will crash if the client disconnects
                        ctx.to = setInterval(() => {
                            ws.send(JSON.stringify({ cmd: "PING" }))
                        }, 5000)
                    },
                    disconnect: ({ ctx }) => {
                        if (ctx.to !== null) {
                            clearTimeout(this.ctx)
                            ctx.to = null
                        }
                    }
                }
            }
        },
        handler: (request, h) => {
            let { initially, ws } = request.websocket()
            if (initially) {
                ws.send(JSON.stringify({ cmd: "HELLO", arg: request.auth.credentials.username }))
                return ""
            }
            if (typeof request.payload.cmd !== "string"){
                return Boom.badRequest("invalid request");
            }
            if (request.payload.cmd === "PING"){
                return { result: "PONG" }
            }
            else if (request.payload.cmd === "AWAKE-ALL") {
                var peers = request.websocket().peers
                peers.forEach((peer) => {
                    peer.send(JSON.stringify({ cmd: "AWAKE" }))
                })
                return ""            
            }
            else{
                return Boom.badRequest("unknown command");
            }
        }
    })

    /*  exclusive framed WebSocket route  */
    server.route({
        method: "POST", path: "/framed",
        config: {
            plugins: {
                websocket: {
                    only:          true,
                    autoping:      30 * 1000,
                    frame:         true,
                    frameEncoding: "json",
                    frameRequest:  "REQUEST",
                    frameResponse: "RESPONSE"
                }
            }
        },
        handler: (request, h) => {
            return { at: "framed", seen: request.payload };
        }
    })

    try {
        await server.start();
    }
    catch (e){
        console.log(e);
    }
}
runServer();
