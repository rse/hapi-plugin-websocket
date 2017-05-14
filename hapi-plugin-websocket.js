/*
**  hapi-plugin-websocket -- HAPI plugin for seamless WebSocket integration
**  Copyright (c) 2016-2017 Ralf S. Engelschall <rse@engelschall.com>
**
**  Permission is hereby granted, free of charge, to any person obtaining
**  a copy of this software and associated documentation files (the
**  "Software"), to deal in the Software without restriction, including
**  without limitation the rights to use, copy, modify, merge, publish,
**  distribute, sublicense, and/or sell copies of the Software, and to
**  permit persons to whom the Software is furnished to do so, subject to
**  the following conditions:
**
**  The above copyright notice and this permission notice shall be included
**  in all copies or substantial portions of the Software.
**
**  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
**  EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
**  MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
**  IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
**  CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
**  TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
**  SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

/*  external dependencies  */
var Boom = require("boom")
var WS   = require("ws")

/*  internal dependencies  */
var Package = require("./package.json")

/*  the HAPI plugin register function  */
var register = (server, options, next) => {
    /*  perform WebSocket handling on HAPI start  */
    server.ext({ type: "onPostStart", method: function (server, next) {

        /*  iterate over all routes  */
        var connections = server.table()
        connections.forEach((connection) => {
            connection.table.forEach((route) => {
                /*  for all WebSocket enabled routes...  */
                if (   typeof route.settings === "object"
                    && typeof route.settings.plugins === "object"
                    && typeof route.settings.plugins.websocket !== "undefined") {

                    /*  sanity check route  */
                    if (route.method.toUpperCase() !== "POST")
                        throw new Error("WebSocket can be enabled on POST routes only")

                    /*  establish a new WebSocket listener for the route  */
                    var wss = new WS.Server({
                        server: server.listener,
                        path:   route.path
                    })

                    /*  hook into WebSocket server creation  */
                    var options = route.settings.plugins.websocket
                    if (   typeof options === "object"
                        && typeof options.create === "function")
                        options.create.call(null, wss)

                    /*  on WebSocket connection...  */
                    wss.on("connection", (ws) => {
                        /*  provide a local app context  */
                        var ctx = {}

                        /*  hook into WebSocket connection  */
                        if (   typeof options === "object"
                            && typeof options.connect === "function")
                            options.connect.call(ctx, wss, ws)

                        /*  hook into WebSocket message retrival  */
                        let closed = false
                        ws.on("message", (message) => {
                            /*  transform incoming message into a simulated HTTP request  */
                            server.inject({
                                method:        "POST",
                                url:           ws.upgradeReq.url,
                                headers:       ws.upgradeReq.headers,
                                remoteAddress: ws.upgradeReq.socket.remoteAddress,
                                payload:       message,
                                plugins:       { websocket: { ctx: ctx, wss: wss, ws: ws } }
                            }, (response) => {
                                /*  transform HTTP response into an outgoing message  */
                                if (response.statusCode !== 204 && !closed)
                                    ws.send(response.payload)
                            })
                        })

                        /*  hook into WebSocket disconnection  */
                        ws.on("close", () => {
                            closed = true
                            if (   typeof options === "object"
                                && typeof options.disconnect === "function")
                                options.disconnect.call(ctx, wss, ws)
                        })
                    })
                }
            })
        })

        /*  continue processing  */
        next()
    }})

    /*  decorate the request object  */
    server.decorate("request", "websocket", (request) => {
        /*  make available remote WebSocket information  */
        if (typeof request.plugins.websocket !== "undefined") {
            request.info.remoteAddress = request.plugins.websocket.ws.upgradeReq.socket.remoteAddress
            request.info.remotePort    = request.plugins.websocket.ws.upgradeReq.socket.remotePort
        }

        /*  allow WebSocket information to be easily retrieved  */
        return () => {
            return request.plugins.websocket
        }
    }, { apply: true })

    /*  handle WebSocket exclusive routes  */
    server.ext({ type: "onPreAuth", method: (request, reply) => {
        /*  if WebSocket is enabled with "only" flag on the selected route...  */
        if (   typeof request.route.settings.plugins.websocket === "object"
            && request.route.settings.plugins.websocket.only === true      ) {
            /*  ...but this is not a WebSocket originated request  */
            if (!(   typeof request.plugins.websocket === "object"
                  && request.plugins.websocket.wss !== null
                  && request.plugins.websocket.ws  !== null       )) {
                return reply(Boom.badRequest("Plain HTTP request to a WebSocket-only route not allowed"))
            }
        }
        return reply.continue()
    }})

    /*  continue processing  */
    next()
}

/*  provide meta-information as expected by HAPI  */
register.attributes = { pkg: Package }

/*  export register function, wrapped in a plugin object  */
module.exports = { register: register }

