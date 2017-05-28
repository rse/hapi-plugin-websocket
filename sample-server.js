
const Boom          = require("boom")
const HAPI          = require("hapi")
const HAPIWebSocket = require("./hapi-plugin-websocket")
const HAPIAuthBasic = require("hapi-auth-basic")

let server = new HAPI.Server()
server.connection({ address: "127.0.0.1", port: 12345 })

server.register(HAPIWebSocket)
server.register(HAPIAuthBasic)

server.auth.strategy("basic", "basic", {
    validateFunc: (request, username, password, callback) => {
        if (username === "foo" && password === "bar")
            callback(null, true, { username: username })
        else
            callback(Boom.unauthorized("invalid username/password"), false)
    }
})

/*  plain REST route  */
server.route({
    method: "POST", path: "/foo",
    config: {
        payload: { output: "data", parse: true, allow: "application/json" }
    },
    handler: (request, reply) => {
        reply({ at: "foo", seen: request.payload })
    }
})

/*  combined REST/WebSocket route  */
server.route({
    method: "POST", path: "/bar",
    config: {
        payload: { output: "data", parse: true, allow: "application/json" },
        plugins: { websocket: true }
    },
    handler: (request, reply) => {
        let { mode } = request.websocket()
        reply({ at: "bar", mode: mode, seen: request.payload })
    }
})

/*  exclusive WebSocket route  */
server.route({
    method: "POST", path: "/baz",
    config: {
        plugins: { websocket: { only: true, autoping: 30 * 1000 } }
    },
    handler: (request, reply) => {
        reply({ at: "baz", seen: request.payload })
    }
})

/*  full-featured exclusive WebSocket route  */
server.route({
    method: "POST", path: "/quux",
    config: {
        payload: { output: "data", parse: true, allow: "application/json" },
        auth: { mode: "required", strategy: "basic" },
        plugins: {
            websocket: {
                only: true,
                initially: true,
                subprotocol: "quux/1.0",
                connect: ({ ctx, ws }) => {
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
    handler: (request, reply) => {
        let { initially, ws } = request.websocket()
        if (initially) {
            ws.send(JSON.stringify({ cmd: "HELLO", arg: request.auth.credentials.username }))
            return reply().code(204)
        }
        if (typeof request.payload.cmd !== "string")
            return reply(Boom.badRequest("invalid request"))
        if (request.payload.cmd === "PING")
            return reply({ result: "PONG" })
        else if (request.payload.cmd === "AWAKE-ALL") {
            var peers = request.websocket().peers
            peers.forEach((peer) => {
                peer.send(JSON.stringify({ cmd: "AWAKE" }))
            })
            return reply().code(204)
        }
        else
            return reply(Boom.badRequest("unknown command"))
    }
})

server.start()

